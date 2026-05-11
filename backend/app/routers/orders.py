from collections import defaultdict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models.order import Order
from app.models.user import User
from app.schemas.orders import OrderCreate, OrderPublic, order_public
from app.services.checkout_fulfillment import CheckoutError, fulfill_checkout

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderPublic)
def create_order(
    body: OrderCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrderPublic:
    qty_map = defaultdict(int)
    for row in body.items:
        qty_map[row.product_id] += row.quantity

    try:
        order = fulfill_checkout(
            db,
            user.id,
            dict(qty_map),
            payment_method=body.payment_method or "demo",
            stripe_checkout_session_id=None,
        )
        db.commit()
    except CheckoutError as e:
        db.rollback()
        raise HTTPException(e.status_code, e.detail) from e

    o = db.scalar(
        select(Order)
        .where(Order.id == order.id)
        .options(selectinload(Order.items)),
    )
    if o is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Order persist failed")
    return order_public(o)


@router.get("/me", response_model=list[OrderPublic])
def list_my_orders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
) -> list[OrderPublic]:
    stmt = (
        select(Order)
        .where(Order.user_id == user.id)
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
        .limit(limit)
    )
    rows = list(db.scalars(stmt).all())
    return [order_public(o) for o in rows]


@router.get("/{order_id}", response_model=OrderPublic)
def get_order(
    order_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrderPublic:
    o = db.scalar(
        select(Order)
        .where(Order.id == order_id, Order.user_id == user.id)
        .options(selectinload(Order.items)),
    )
    if o is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order_public(o)
