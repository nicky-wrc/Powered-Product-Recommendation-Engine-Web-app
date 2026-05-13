"""Cancel an unfulfilled order: restock, reverse loyalty/promo/gift card, void issued gift cards."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.models.gift_card import GiftCard
from app.models.interaction import Interaction
from app.models.order import Order
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.user import User
from app.services import gift_cards as gift_svc
from app.services import promo_codes as promo_svc


def cancel_processing_order(db: Session, order_id: UUID, user_id: UUID) -> Order:
    o = db.scalar(
        select(Order)
        .where(Order.id == order_id, Order.user_id == user_id)
        .options(selectinload(Order.items))
        .with_for_update(),
    )
    if o is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if o.status != "processing":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Only orders awaiting fulfillment can be cancelled. Shipped or completed orders cannot be cancelled here.",
        )

    for it in o.items:
        p = db.scalar(select(Product).where(Product.id == it.product_id).with_for_update())
        if p is None:
            continue
        if getattr(p, "is_gift_card", False):
            continue
        if it.variant_id is not None:
            v = db.scalar(select(ProductVariant).where(ProductVariant.id == it.variant_id).with_for_update())
            if v is not None:
                v.stock += it.quantity
        else:
            p.stock += it.quantity

    u = db.scalar(select(User).where(User.id == o.user_id).with_for_update())
    if u is not None:
        bal = int(u.loyalty_points or 0)
        earned = int(o.loyalty_points_earned or 0)
        redeemed = int(o.loyalty_points_redeemed or 0)
        u.loyalty_points = max(0, bal - earned) + redeemed

    if o.gift_card_code and o.gift_card_discount and float(o.gift_card_discount) > 0:
        card = gift_svc.get_card_by_code(db, o.gift_card_code, for_update=True)
        if card is not None:
            card.balance_remaining = (card.balance_remaining + Decimal(str(o.gift_card_discount))).quantize(
                Decimal("0.01"),
            )

    if o.promo_code and o.promo_discount and float(o.promo_discount) > 0:
        row = promo_svc.get_promo_code_row(db, o.promo_code, for_update=True)
        if row is not None:
            promo_svc.decrement_promo_use(row)

    db.execute(update(GiftCard).where(GiftCard.issuer_order_id == o.id).values(active=False))

    stmt_ix = select(Interaction).where(
        Interaction.user_id == o.user_id,
        Interaction.event_type == "purchase",
    )
    oid_s = str(o.id)
    for inter in db.scalars(stmt_ix):
        meta = inter.event_metadata or {}
        if meta.get("order_id") == oid_s:
            db.delete(inter)

    o.status = "cancelled"
    return o
