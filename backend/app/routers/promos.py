"""Authenticated promo preview against current cart lines (server-priced)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.orders import OrderLineIn
from app.services.checkout_fulfillment import CheckoutError, coalesce_checkout_lines, load_checkout_pricing
from app.services.promo_codes import preview_promo_discount

router = APIRouter(prefix="/promos", tags=["promos"])


class PromoPreviewBody(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    items: list[OrderLineIn] = Field(min_length=1)


class PromoPreviewResponse(BaseModel):
    valid: bool
    error: str | None = None
    subtotal: float
    discount: float
    merch_after_discount: float
    gift_wrap_fee: float = 4.99


@router.post("/preview", response_model=PromoPreviewResponse)
def preview_promo(
    body: PromoPreviewBody,
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PromoPreviewResponse:
    lines = coalesce_checkout_lines(body.items)
    try:
        pricing = load_checkout_pricing(db, lines, lock_rows=False)
    except CheckoutError as e:
        raise HTTPException(e.status_code, e.detail) from e

    discount, err = preview_promo_discount(db, body.code, pricing.subtotal)
    if err:
        return PromoPreviewResponse(
            valid=False,
            error=err,
            subtotal=float(pricing.subtotal),
            discount=0.0,
            merch_after_discount=float(pricing.subtotal),
        )

    after = pricing.subtotal - discount
    if after < 0:
        after = 0
    return PromoPreviewResponse(
        valid=True,
        error=None,
        subtotal=float(pricing.subtotal),
        discount=float(discount),
        merch_after_discount=float(after),
    )
