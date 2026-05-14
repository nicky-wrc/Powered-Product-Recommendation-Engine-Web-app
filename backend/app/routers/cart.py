from collections import defaultdict
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.cart_item import CartItem
from app.models.product import Product
from app.models.product_bundle import ProductBundle, ProductBundleItem
from app.models.product_variant import ProductVariant
from app.models.user import User
from app.schemas.cart import CartItemAdd, CartItemPatch, CartLineResponse, CartResponse
from app.schemas.products import ProductPublic, product_public
from app.services.checkout_fulfillment import CheckoutLineSpec, load_checkout_pricing
from app.services.product_variants import product_ids_requiring_variant, variant_aggregates_for_product_ids

router = APIRouter(prefix="/cart", tags=["cart"])


def _find_cart_line(
    db: Session,
    user_id: UUID,
    product_id: UUID,
    variant_id: UUID | None,
    bundle_group_id: UUID | None,
) -> CartItem | None:
    stmt = select(CartItem).where(CartItem.user_id == user_id, CartItem.product_id == product_id)
    if variant_id is not None:
        stmt = stmt.where(CartItem.variant_id == variant_id)
    else:
        stmt = stmt.where(CartItem.variant_id.is_(None))
    if bundle_group_id is not None:
        stmt = stmt.where(CartItem.bundle_group_id == bundle_group_id)
    else:
        stmt = stmt.where(CartItem.bundle_group_id.is_(None))
    return db.scalar(stmt)


def _line_list_unit_cart(
    db: Session,
    p: Product,
    variant_id: UUID | None,
    agg: dict,
) -> tuple[ProductPublic, float, ProductVariant | None]:
    pa = agg.get(p.id)
    pub = product_public(p, variant_aggregate=pa if pa and pa[0] > 0 else None)
    v: ProductVariant | None = None
    unit = float(pub.price)
    if variant_id is not None:
        v = db.get(ProductVariant, variant_id)
        if v is None or v.product_id != p.id:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "Cart references missing variant; clear cart and re-add.",
            )
        unit = float(v.price)
        pub = pub.model_copy(update={"price": unit, "stock": v.stock})
    return pub, unit, v


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
        pub, unit, v = _line_list_unit_cart(db, p, ci.variant_id, agg)
        bname = None
        if ci.bundle_id:
            b = db.get(ProductBundle, ci.bundle_id)
            bname = b.name if b else None
        items.append(
            CartLineResponse(
                product=pub,
                quantity=ci.quantity,
                variant_id=ci.variant_id,
                variant_label=v.label if v else None,
                unit_price=unit,
                list_unit_price=unit,
                bundle_id=ci.bundle_id,
                bundle_group_id=ci.bundle_group_id,
                bundle_name=bname,
            ),
        )
        count += ci.quantity

    specs = [
        CheckoutLineSpec(ci.product_id, ci.variant_id, ci.quantity, ci.bundle_group_id, ci.bundle_id)
        for ci, _p in rows
    ]
    merch_sub = 0.0
    if specs:
        pricing = load_checkout_pricing(db, specs, lock_rows=False)
        merch_sub = float(pricing.subtotal)

    return CartResponse(items=items, item_count=count, merchandise_subtotal=merch_sub)


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


class CartBundleAddBody(BaseModel):
    times: int = Field(default=1, ge=1, le=5)


@router.get("", response_model=CartResponse)
def get_cart(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartResponse:
    return _cart_response(db, user.id)


@router.post("/bundles/{bundle_id}", response_model=CartResponse)
def add_bundle_to_cart(
    bundle_id: UUID,
    body: CartBundleAddBody = CartBundleAddBody(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartResponse:
    times = body.times
    bundle = db.get(ProductBundle, bundle_id)
    if bundle is None or not bundle.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bundle not found")
    items = list(
        db.scalars(
            select(ProductBundleItem)
            .where(ProductBundleItem.bundle_id == bundle_id)
            .order_by(ProductBundleItem.sort_order.asc(), ProductBundleItem.id.asc()),
        ).all(),
    )
    if not items:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bundle has no items")

    by_pid: dict[UUID, list[ProductBundleItem]] = defaultdict(list)
    for it in items:
        by_pid[it.product_id].append(it)
    for pid, plist in by_pid.items():
        if len(plist) > 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bundle cannot list the same product twice; use quantity on one row.")

    for it in items:
        p = db.get(Product, it.product_id)
        if p is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bundle references missing product")
        if getattr(p, "is_gift_card", False):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bundles cannot include gift cards")
        qty = it.quantity * times
        _validate_add(db, p, it.variant_id, qty)

    for _ in range(times):
        group_id = uuid4()
        for it in items:
            p = db.get(Product, it.product_id)
            assert p is not None
            qty = it.quantity
            existing = _find_cart_line(db, user.id, it.product_id, it.variant_id, group_id)
            if existing:
                existing.quantity = min(99, existing.quantity + qty)
            else:
                db.add(
                    CartItem(
                        user_id=user.id,
                        product_id=it.product_id,
                        variant_id=it.variant_id,
                        quantity=qty,
                        bundle_id=bundle_id,
                        bundle_group_id=group_id,
                    ),
                )
    db.commit()
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
    existing = _find_cart_line(db, user.id, body.product_id, body.variant_id, None)
    if existing:
        if existing.bundle_group_id is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This SKU is part of a bundle line; remove the bundle or change quantity from the cart.",
            )
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
    bundle_group_id: UUID | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartResponse:
    row = _find_cart_line(db, user.id, product_id, variant_id, bundle_group_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cart line not found")
    row.quantity = body.quantity
    db.commit()
    return _cart_response(db, user.id)


@router.delete("/items/{product_id}", response_model=CartResponse)
def delete_cart_item(
    product_id: UUID,
    variant_id: UUID | None = Query(None),
    bundle_group_id: UUID | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartResponse:
    row = _find_cart_line(db, user.id, product_id, variant_id, bundle_group_id)
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
    return CartResponse(items=[], item_count=0, merchandise_subtotal=0.0)
