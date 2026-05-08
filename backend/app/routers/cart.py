from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.cart_item import CartItem
from app.models.product import Product
from app.models.user import User
from app.schemas.cart import CartItemAdd, CartItemPatch, CartLineResponse, CartResponse
from app.schemas.products import product_public

router = APIRouter(prefix="/cart", tags=["cart"])


def _cart_response(db: Session, user_id: UUID) -> CartResponse:
    stmt = (
        select(CartItem, Product)
        .join(Product, CartItem.product_id == Product.id)
        .where(CartItem.user_id == user_id)
        .order_by(CartItem.id.asc())
    )
    rows = db.execute(stmt).all()
    items: list[CartLineResponse] = []
    count = 0
    for ci, p in rows:
        items.append(CartLineResponse(product=product_public(p), quantity=ci.quantity))
        count += ci.quantity
    return CartResponse(items=items, item_count=count)


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
    existing = db.scalar(
        select(CartItem).where(CartItem.user_id == user.id, CartItem.product_id == body.product_id),
    )
    if existing:
        existing.quantity = min(99, existing.quantity + body.quantity)
    else:
        db.add(CartItem(user_id=user.id, product_id=body.product_id, quantity=body.quantity))
    db.commit()
    return _cart_response(db, user.id)


@router.patch("/items/{product_id}", response_model=CartResponse)
def patch_cart_item(
    product_id: UUID,
    body: CartItemPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartResponse:
    row = db.scalar(
        select(CartItem).where(CartItem.user_id == user.id, CartItem.product_id == product_id),
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cart line not found")
    row.quantity = body.quantity
    db.commit()
    return _cart_response(db, user.id)


@router.delete("/items/{product_id}", response_model=CartResponse)
def delete_cart_item(
    product_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartResponse:
    db.execute(
        delete(CartItem).where(CartItem.user_id == user.id, CartItem.product_id == product_id),
    )
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
