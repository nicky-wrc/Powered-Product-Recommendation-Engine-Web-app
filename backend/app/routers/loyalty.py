"""Loyalty redemption preview for current cart lines (server-priced)."""

from collections import defaultdict
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.orders import OrderLineIn
from app.services.checkout_fulfillment import CheckoutError, GIFT_WRAP_FEE, load_checkout_pricing
from app.services import loyalty as loyalty_svc
from app.services.promo_codes import preview_promo_discount

router = APIRouter(prefix="/loyalty", tags=["loyalty"])


def _merge_order_lines(items: list[OrderLineIn]) -> list[tuple[UUID, UUID | None, int]]:
    merged: dict[tuple[UUID, UUID | None], int] = defaultdict(int)
    for row in items:
        merged[(row.product_id, row.variant_id)] += row.quantity
    return [(pid, vid, q) for (pid, vid), q in merged.items()]


class LoyaltyPreviewBody(BaseModel):
    items: list[OrderLineIn] = Field(min_length=1)
    promo_code: str | None = Field(default=None, max_length=64)
    redeem_loyalty_points: int = Field(default=0, ge=0, le=500_000)


class LoyaltyPreviewResponse(BaseModel):
    valid: bool
    error: str | None = None
    subtotal: float
    promo_discount: float
    merch_after_promo: float
    balance: int
    redeem_points_used: int
    loyalty_discount: float
    merch_after_loyalty: float
    points_earned_if_completed: int
    gift_wrap_fee: float = float(GIFT_WRAP_FEE)
    redeem_points_per_dollar: int
    earn_points_per_dollar: float


@router.post("/preview", response_model=LoyaltyPreviewResponse)
def preview_loyalty(
    body: LoyaltyPreviewBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LoyaltyPreviewResponse:
    lines = _merge_order_lines(body.items)
    try:
        pricing = load_checkout_pricing(db, lines, lock_rows=False)
    except CheckoutError as e:
        raise HTTPException(e.status_code, e.detail) from e

    promo_d = Decimal("0")
    if body.promo_code and body.promo_code.strip():
        d, err = preview_promo_discount(db, body.promo_code, pricing.subtotal)
        if err:
            return LoyaltyPreviewResponse(
                valid=False,
                error=err,
                subtotal=float(pricing.subtotal),
                promo_discount=0.0,
                merch_after_promo=float(pricing.subtotal),
                balance=int(user.loyalty_points or 0),
                redeem_points_used=0,
                loyalty_discount=0.0,
                merch_after_loyalty=float(pricing.subtotal),
                points_earned_if_completed=0,
                redeem_points_per_dollar=loyalty_svc.redeem_points_per_dollar(),
                earn_points_per_dollar=float(loyalty_svc.earn_points_per_dollar()),
            )
        promo_d = d

    merch_after_promo = pricing.subtotal - promo_d
    if merch_after_promo < 0:
        merch_after_promo = Decimal("0")

    bal = int(user.loyalty_points or 0)
    ppr = loyalty_svc.redeem_points_per_dollar()
    req = int(body.redeem_loyalty_points or 0)

    if req <= 0:
        qualifying = merch_after_promo
        earned = loyalty_svc.earn_points_for_qualifying_spend(qualifying, loyalty_svc.earn_points_per_dollar())
        return LoyaltyPreviewResponse(
            valid=True,
            error=None,
            subtotal=float(pricing.subtotal),
            promo_discount=float(promo_d),
            merch_after_promo=float(merch_after_promo),
            balance=bal,
            redeem_points_used=0,
            loyalty_discount=0.0,
            merch_after_loyalty=float(merch_after_promo),
            points_earned_if_completed=earned,
            redeem_points_per_dollar=ppr,
            earn_points_per_dollar=float(loyalty_svc.earn_points_per_dollar()),
        )

    use_pts, ld, err = loyalty_svc.compute_redeem(req, bal, merch_after_promo, ppr)
    if err:
        return LoyaltyPreviewResponse(
            valid=False,
            error=err,
            subtotal=float(pricing.subtotal),
            promo_discount=float(promo_d),
            merch_after_promo=float(merch_after_promo),
            balance=bal,
            redeem_points_used=0,
            loyalty_discount=0.0,
            merch_after_loyalty=float(merch_after_promo),
            points_earned_if_completed=0,
            redeem_points_per_dollar=ppr,
            earn_points_per_dollar=float(loyalty_svc.earn_points_per_dollar()),
        )

    after_loyal = merch_after_promo - ld
    if after_loyal < 0:
        after_loyal = Decimal("0")
    earned = loyalty_svc.earn_points_for_qualifying_spend(after_loyal, loyalty_svc.earn_points_per_dollar())

    return LoyaltyPreviewResponse(
        valid=True,
        error=None,
        subtotal=float(pricing.subtotal),
        promo_discount=float(promo_d),
        merch_after_promo=float(merch_after_promo),
        balance=bal,
        redeem_points_used=use_pts,
        loyalty_discount=float(ld),
        merch_after_loyalty=float(after_loyal),
        points_earned_if_completed=earned,
        redeem_points_per_dollar=ppr,
        earn_points_per_dollar=float(loyalty_svc.earn_points_per_dollar()),
    )
