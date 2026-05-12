"""Flash sale / list price helpers."""

from datetime import datetime, timezone
from decimal import Decimal

from app.models.product import Product


def flash_sale_active(p: Product, *, now: datetime | None = None) -> bool:
    n = now if now is not None else datetime.now(timezone.utc)
    if p.sale_price is None or p.sale_ends_at is None:
        return False
    if n >= p.sale_ends_at:
        return False
    return p.sale_price < p.price


def effective_unit_price(p: Product, *, now: datetime | None = None) -> Decimal:
    if flash_sale_active(p, now=now) and p.sale_price is not None:
        return p.sale_price
    return p.price
