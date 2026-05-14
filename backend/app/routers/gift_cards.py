"""Gift card redemption preview and buyer's issued cards."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.gift_card import GiftCard
from app.models.user import User
from app.schemas.orders import OrderLineIn
from app.services.checkout_fulfillment import CheckoutError, GIFT_WRAP_FEE, coalesce_checkout_lines, load_checkout_pricing
from app.services import gift_cards as gift_svc
from app.services import loyalty as loyalty_svc
from app.services.promo_codes import preview_promo_discount

router = APIRouter(prefix="/gift-cards", tags=["gift-cards"])


class GiftCardPreviewBody(BaseModel):
    items: list[OrderLineIn] = Field(min_length=1)
    promo_code: str | None = Field(default=None, max_length=64)
    redeem_loyalty_points: int = Field(default=0, ge=0, le=500_000)
    gift_card_code: str | None = Field(default=None, max_length=40)

class GiftCardPreviewResponse(BaseModel):
    valid: bool
    error: str | None = None
    subtotal: float
    promo_discount: float
    merch_after_promo: float
    loyalty_discount: float
    merch_after_loyalty: float
    gift_card_discount: float
    merch_after_gift_card: float
    gift_wrap_fee: float = float(GIFT_WRAP_FEE)
    gift_card_balance: float | None = None


class GiftCardMineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    balance_remaining: float
    face_value: float
    recipient_email: str | None = None
    created_at: datetime
    issuer_order_id: UUID


@router.post("/preview", response_model=GiftCardPreviewResponse)
def preview_gift_card(
    body: GiftCardPreviewBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GiftCardPreviewResponse:
    lines = coalesce_checkout_lines(body.items)
    try:
        pricing = load_checkout_pricing(db, lines, lock_rows=False)
    except CheckoutError as e:
        raise HTTPException(e.status_code, e.detail) from e

    promo_d = Decimal("0")
    if body.promo_code and body.promo_code.strip():
        d, err = preview_promo_discount(db, body.promo_code, pricing.subtotal)
        if err:
            return GiftCardPreviewResponse(
                valid=False,
                error=err,
                subtotal=float(pricing.subtotal),
                promo_discount=0.0,
                merch_after_promo=float(pricing.subtotal),
                loyalty_discount=0.0,
                merch_after_loyalty=float(pricing.subtotal),
                gift_card_discount=0.0,
                merch_after_gift_card=float(pricing.subtotal),
            )
        promo_d = d

    merch_after_promo = pricing.subtotal - promo_d
    if merch_after_promo < 0:
        merch_after_promo = Decimal("0")

    loyalty_d = Decimal("0")
    req = int(body.redeem_loyalty_points or 0)
    if req > 0:
        _pts, loyalty_d, err = loyalty_svc.compute_redeem(
            req,
            int(user.loyalty_points or 0),
            merch_after_promo,
            loyalty_svc.redeem_points_per_dollar(),
        )
        if err:
            return GiftCardPreviewResponse(
                valid=False,
                error=err,
                subtotal=float(pricing.subtotal),
                promo_discount=float(promo_d),
                merch_after_promo=float(merch_after_promo),
                loyalty_discount=0.0,
                merch_after_loyalty=float(merch_after_promo),
                gift_card_discount=0.0,
                merch_after_gift_card=float(merch_after_promo),
            )

    merch_after_loyalty = merch_after_promo - loyalty_d
    if merch_after_loyalty < 0:
        merch_after_loyalty = Decimal("0")

    raw_gc = body.gift_card_code
    if not raw_gc or not raw_gc.strip():
        return GiftCardPreviewResponse(
            valid=True,
            error=None,
            subtotal=float(pricing.subtotal),
            promo_discount=float(promo_d),
            merch_after_promo=float(merch_after_promo),
            loyalty_discount=float(loyalty_d),
            merch_after_loyalty=float(merch_after_loyalty),
            gift_card_discount=0.0,
            merch_after_gift_card=float(merch_after_loyalty),
        )

    row = gift_svc.get_card_by_code(db, raw_gc, for_update=False)
    if row is None or not row.active:
        return GiftCardPreviewResponse(
            valid=False,
            error="Invalid or inactive gift card code",
            subtotal=float(pricing.subtotal),
            promo_discount=float(promo_d),
            merch_after_promo=float(merch_after_promo),
            loyalty_discount=float(loyalty_d),
            merch_after_loyalty=float(merch_after_loyalty),
            gift_card_discount=0.0,
            merch_after_gift_card=float(merch_after_loyalty),
        )
    if row.balance_remaining <= 0:
        return GiftCardPreviewResponse(
            valid=False,
            error="This gift card has no balance left",
            subtotal=float(pricing.subtotal),
            promo_discount=float(promo_d),
            merch_after_promo=float(merch_after_promo),
            loyalty_discount=float(loyalty_d),
            merch_after_loyalty=float(merch_after_loyalty),
            gift_card_discount=0.0,
            merch_after_gift_card=float(merch_after_loyalty),
            gift_card_balance=float(row.balance_remaining),
        )

    gc_d = gift_svc.preview_redemption_amount(row, merch_after_loyalty)
    after = merch_after_loyalty - gc_d
    if after < 0:
        after = Decimal("0")
    return GiftCardPreviewResponse(
        valid=True,
        error=None,
        subtotal=float(pricing.subtotal),
        promo_discount=float(promo_d),
        merch_after_promo=float(merch_after_promo),
        loyalty_discount=float(loyalty_d),
        merch_after_loyalty=float(merch_after_loyalty),
        gift_card_discount=float(gc_d),
        merch_after_gift_card=float(after),
        gift_card_balance=float(row.balance_remaining),
    )


@router.get("/mine", response_model=list[GiftCardMineOut])
def my_gift_cards(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[GiftCardMineOut]:
    rows = list(
        db.scalars(
            select(GiftCard)
            .where(GiftCard.purchased_by_user_id == user.id)
            .order_by(GiftCard.created_at.desc()),
        ).all(),
    )
    return [
        GiftCardMineOut(
            id=r.id,
            code=r.code,
            balance_remaining=float(r.balance_remaining),
            face_value=float(r.face_value),
            recipient_email=r.recipient_email,
            created_at=r.created_at,
            issuer_order_id=r.issuer_order_id,
        )
        for r in rows
    ]
