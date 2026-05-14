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


def volume_tiered_unit_price(
    *,
    base: Decimal,
    tier_quantity: int,
    tiers_raw: list | None,
    is_gift_card: bool = False,
) -> Decimal:
    """Apply best eligible quantity break. `tier_quantity` = total units in checkout for this SKU (product+variant)."""
    if is_gift_card or tier_quantity < 1 or not tiers_raw:
        return base
    tiers: list[tuple[int, Decimal]] = []
    for row in tiers_raw:
        if not isinstance(row, dict):
            continue
        mq = row.get("min_qty")
        up = row.get("unit_price")
        if mq is None or up is None:
            continue
        try:
            mqi = int(mq)
            upd = Decimal(str(up)).quantize(Decimal("0.01"))
        except (TypeError, ValueError, ArithmeticError):
            continue
        if mqi < 2 or upd < Decimal("0"):
            continue
        if upd > base:
            continue
        tiers.append((mqi, upd))
    if not tiers:
        return base
    best_min = max((mq for mq, _ in tiers if mq <= tier_quantity), default=None)
    if best_min is None:
        return base
    cand = [up for mq, up in tiers if mq == best_min]
    return min(cand) if cand else base
