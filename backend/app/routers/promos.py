"""Authenticated promo preview against current cart lines (server-priced)."""

from collections import defaultdict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.orders import OrderLineIn
from app.services.checkout_fulfillment import CheckoutError, load_checkout_pricing
from app.services.promo_codes import preview_promo_discount

router = APIRouter(prefix="/promos", tags=["promos"])


def _merge_order_lines(items: list[OrderLineIn]) -> list[tuple[UUID, UUID | None, int]]:
    merged: dict[tuple[UUID, UUID | None], int] = defaultdict(int)
    for row in items:
        merged[(row.product_id, row.variant_id)] += row.quantity
    return [(pid, vid, q) for (pid, vid), q in merged.items()]


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
    lines = _merge_order_lines(body.items)
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
