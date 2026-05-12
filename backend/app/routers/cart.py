from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.cart_item import CartItem
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.user import User
from app.schemas.cart import CartItemAdd, CartItemPatch, CartLineResponse, CartResponse
from app.schemas.products import product_public
from app.services.product_variants import product_ids_requiring_variant, variant_aggregates_for_product_ids

router = APIRouter(prefix="/cart", tags=["cart"])


def _find_cart_line(
    db: Session,
    user_id: UUID,
    product_id: UUID,
    variant_id: UUID | None,
) -> CartItem | None:
    stmt = select(CartItem).where(CartItem.user_id == user_id, CartItem.product_id == product_id)
    if variant_id is not None:
        stmt = stmt.where(CartItem.variant_id == variant_id)
    else:
        stmt = stmt.where(CartItem.variant_id.is_(None))
    return db.scalar(stmt)


def _cart_response(db: Session, user_id: UUID) -> CartResponse:
    stmt = (
        select(CartItem, Product)
        .join(Product, CartItem.product_id == Product.id)
        .where(CartItem.user_id == user_id)
        .order_by(CartItem.id.asc())
    )
    rows = db.execute(stmt).all()
    pids = [p.id for _ci, p in rows]
    agg = variant_aggregates_for_product_ids(db, pids)
    items: list[CartLineResponse] = []
    count = 0
    for ci, p in rows:
        pa = agg.get(p.id)
        pub = product_public(p, variant_aggregate=pa if pa and pa[0] > 0 else None)
        v: ProductVariant | None = None
        unit = float(pub.price)
        if ci.variant_id is not None:
            v = db.get(ProductVariant, ci.variant_id)
            if v is None or v.product_id != p.id:
                raise HTTPException(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "Cart references missing variant; clear cart and re-add.",
                )
            unit = float(v.price)
            pub = pub.model_copy(update={"price": unit, "stock": v.stock})
        items.append(
            CartLineResponse(
                product=pub,
                quantity=ci.quantity,
                variant_id=ci.variant_id,
                variant_label=v.label if v else None,
                unit_price=unit,
            ),
        )
        count += ci.quantity
    return CartResponse(items=items, item_count=count)


def _validate_add(db: Session, p: Product, variant_id: UUID | None, qty: int) -> ProductVariant | None:
    need = product_ids_requiring_variant(db, {p.id})
    if p.id in need:
        if variant_id is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This product requires a variant")
        v = db.get(ProductVariant, variant_id)
        if v is None or v.product_id != p.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid variant")
        if v.stock < qty:
            raise HTTPException(status.HTTP_409_CONFLICT, "Insufficient stock for this variant")
        return v
    if variant_id is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This product has no variants")
    if p.stock < qty:
        raise HTTPException(status.HTTP_409_CONFLICT, "Insufficient stock")
    return None


@router.get("", response_model=CartResponse)
def get_cart(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartResponse:
    return _cart_response(db, user.id)


@router.post("/items", response_model=CartResponse)
def add_cart_item(
    body: CartItemAdd,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartResponse:
    p = db.get(Product, body.product_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    _validate_add(db, p, body.variant_id, body.quantity)
    existing = _find_cart_line(db, user.id, body.product_id, body.variant_id)
    if existing:
        existing.quantity = min(99, existing.quantity + body.quantity)
    else:
        db.add(
            CartItem(
                user_id=user.id,
                product_id=body.product_id,
                variant_id=body.variant_id,
                quantity=body.quantity,
            ),
        )
    db.commit()
    return _cart_response(db, user.id)


@router.patch("/items/{product_id}", response_model=CartResponse)
def patch_cart_item(
    product_id: UUID,
    body: CartItemPatch,
    variant_id: UUID | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartResponse:
    row = _find_cart_line(db, user.id, product_id, variant_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cart line not found")
    row.quantity = body.quantity
    db.commit()
    return _cart_response(db, user.id)


@router.delete("/items/{product_id}", response_model=CartResponse)
def delete_cart_item(
    product_id: UUID,
    variant_id: UUID | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartResponse:
    row = _find_cart_line(db, user.id, product_id, variant_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cart line not found")
    db.delete(row)
    db.commit()
    return _cart_response(db, user.id)


@router.delete("", response_model=CartResponse)
def clear_cart(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartResponse:
    db.execute(delete(CartItem).where(CartItem.user_id == user.id))
    db.commit()
    return CartResponse(items=[], item_count=0)
