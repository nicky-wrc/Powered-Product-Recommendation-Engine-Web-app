"""Promotional codes: percent or fixed discount on merchandise subtotal (before gift wrap)."""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.promo_code import PromoCode


def normalize_promo_code(raw: str | None) -> str | None:
    if not raw:
        return None
    s = raw.strip().upper()
    return s or None


def get_promo_code_row(db: Session, code: str, *, for_update: bool = False) -> PromoCode | None:
    c = normalize_promo_code(code)
    if not c:
        return None
    stmt = select(PromoCode).where(PromoCode.code == c)
    if for_update:
        stmt = stmt.with_for_update()
    return db.scalar(stmt)


def compute_discount_for_subtotal(row: PromoCode, merch_subtotal: Decimal) -> Decimal:
    if merch_subtotal <= 0:
        return Decimal("0")
    if row.kind == "percent":
        p = row.value
        if p <= 0 or p > Decimal("100"):
            return Decimal("0")
        d = (merch_subtotal * p / Decimal("100")).quantize(Decimal("0.01"))
        return min(d, merch_subtotal)
    if row.kind == "fixed":
        d = min(row.value, merch_subtotal)
        return max(Decimal("0"), d).quantize(Decimal("0.01"))
    return Decimal("0")


def validate_promo_row(row: PromoCode | None, merch_subtotal: Decimal) -> tuple[Decimal, str | None]:
    """Return (discount_amount, error_message). error_message iff discount is 0 and code was invalid."""
    if row is None:
        return Decimal("0"), "Unknown or invalid promo code"
    now = datetime.now(timezone.utc)
    if not row.active:
        return Decimal("0"), "This promo code is not active"
    if row.valid_from is not None and now < row.valid_from:
        return Decimal("0"), "This promo code is not valid yet"
    if row.valid_until is not None and now > row.valid_until:
        return Decimal("0"), "This promo code has expired"
    if row.max_uses is not None and row.uses_count >= row.max_uses:
        return Decimal("0"), "This promo code has reached its usage limit"
    if row.min_subtotal is not None and merch_subtotal < row.min_subtotal:
        return Decimal("0"), f"Minimum order ${row.min_subtotal} required for this code"
    d = compute_discount_for_subtotal(row, merch_subtotal)
    if d <= 0:
        return Decimal("0"), "This promo code does not apply to your cart"
    return d, None


def preview_promo_discount(db: Session, code: str | None, merch_subtotal: Decimal) -> tuple[Decimal, str | None]:
    c = normalize_promo_code(code)
    if not c:
        return Decimal("0"), "Enter a promo code"
    row = get_promo_code_row(db, c, for_update=False)
    discount, err = validate_promo_row(row, merch_subtotal)
    if err:
        return Decimal("0"), err
    return discount, None


def lock_validate_and_discount(
    db: Session,
    code: str | None,
    merch_subtotal: Decimal,
) -> tuple[Decimal, PromoCode | None, str | None]:
    """Lock promo row, validate. Returns (discount, row, error_message)."""
    c = normalize_promo_code(code)
    if not c:
        return Decimal("0"), None, "Enter a promo code"
    row = get_promo_code_row(db, c, for_update=True)
    discount, err = validate_promo_row(row, merch_subtotal)
    if err:
        return Decimal("0"), None, err
    assert row is not None
    return discount, row, None


def increment_promo_use(promo: PromoCode) -> None:
    promo.uses_count = int(promo.uses_count or 0) + 1
