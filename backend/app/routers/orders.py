from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models.order import Order, OrderItem
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
            payment_method=body.payment_method or "direct",
            stripe_checkout_session_id=None,
            gift_wrap=body.gift_wrap,
            gift_message=body.gift_message,
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
    status: str | None = Query(None, max_length=32, description="Exact order status"),
    payment_method: str | None = Query(None, max_length=64, description="Substring match on payment_method"),
    q: str | None = Query(None, max_length=200, description="Search product names in line items"),
    from_date: date | None = Query(None, description="UTC date inclusive start"),
    to_date: date | None = Query(None, description="UTC date inclusive end"),
    min_total: float | None = Query(None, ge=0, description="Minimum order total"),
    max_total: float | None = Query(None, ge=0, description="Maximum order total"),
) -> list[OrderPublic]:
    if min_total is not None and max_total is not None and min_total > max_total:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "min_total cannot be greater than max_total",
        )

    stmt = select(Order).where(Order.user_id == user.id)

    if status is not None and (st := status.strip()):
        stmt = stmt.where(Order.status == st)
    if payment_method is not None and (pm := payment_method.strip()):
        stmt = stmt.where(Order.payment_method.isnot(None), Order.payment_method.ilike(f"%{pm}%"))
    if q is not None and (term := q.strip()):
        stmt = stmt.where(
            Order.id.in_(select(OrderItem.order_id).where(OrderItem.product_name.ilike(f"%{term}%"))),
        )
    if from_date is not None:
        start = datetime.combine(from_date, time.min, tzinfo=timezone.utc)
        stmt = stmt.where(Order.created_at >= start)
    if to_date is not None:
        end = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
        stmt = stmt.where(Order.created_at < end)
    if min_total is not None:
        stmt = stmt.where(Order.total_amount >= min_total)
    if max_total is not None:
        stmt = stmt.where(Order.total_amount <= max_total)

    stmt = (
        stmt.options(selectinload(Order.items)).order_by(Order.created_at.desc()).limit(limit)
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
