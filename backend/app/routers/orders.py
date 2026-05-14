from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models.order import Order, OrderItem
from app.models.user import User
from app.schemas.orders import OrderCreate, OrderPublic, order_public
from app.services.checkout_fulfillment import CheckoutError, coalesce_checkout_lines, fulfill_checkout
from app.services.invoice_pdf import build_order_invoice_pdf
from app.services.order_cancel import cancel_processing_order
from app.services.order_notifications import try_send_order_confirmation

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderPublic)
def create_order(
    body: OrderCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrderPublic:
    lines_specs = coalesce_checkout_lines(body.items)

    try:
        order = fulfill_checkout(
            db,
            user.id,
            lines_specs,
            payment_method=body.payment_method or "direct",
            stripe_checkout_session_id=None,
            gift_wrap=body.gift_wrap,
            gift_message=body.gift_message,
            promo_code=body.promo_code,
            redeem_loyalty_points=body.redeem_loyalty_points,
            gift_card_code=body.gift_card_code,
            gift_cards_recipient_email=body.gift_cards_recipient_email,
            gift_cards_message=body.gift_cards_message,
        )
        db.commit()
    except CheckoutError as e:
        db.rollback()
        raise HTTPException(e.status_code, e.detail) from e

    try_send_order_confirmation(db, order.id)

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
            Order.id.in_(
                select(OrderItem.order_id).where(
                    or_(
                        OrderItem.product_name.ilike(f"%{term}%"),
                        OrderItem.variant_label.ilike(f"%{term}%"),
                    ),
                ),
            ),
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


@router.get("/{order_id}/invoice")
def download_order_invoice(
    order_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    o = db.scalar(
        select(Order)
        .where(Order.id == order_id, Order.user_id == user.id)
        .options(selectinload(Order.items)),
    )
    if o is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if o.status == "cancelled":
        raise HTTPException(status.HTTP_410_GONE, "Invoice not available for cancelled orders.")
    pdf = build_order_invoice_pdf(o, customer_email=user.email)
    filename = f"invoice-{str(order_id)[:8]}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{order_id}/cancel", response_model=OrderPublic)
def cancel_my_order(
    order_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrderPublic:
    try:
        cancel_processing_order(db, order_id, user.id)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    o = db.scalar(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items)),
    )
    if o is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Order update failed")
    return order_public(o)


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
