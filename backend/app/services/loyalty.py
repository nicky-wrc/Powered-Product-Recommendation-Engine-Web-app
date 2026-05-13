"""Loyalty points: earn on qualifying merchandise spend, redeem as $ off (before gift wrap)."""

from decimal import ROUND_DOWN, Decimal

from app.config import settings


def points_to_discount(points: int, redeem_points_per_dollar: int) -> Decimal:
    if points <= 0 or redeem_points_per_dollar <= 0:
        return Decimal("0")
    return (Decimal(points) / Decimal(redeem_points_per_dollar)).quantize(Decimal("0.01"), rounding=ROUND_DOWN)


def max_redeem_points_for_merch(merch_after_promo: Decimal, redeem_points_per_dollar: int) -> int:
    if merch_after_promo <= 0 or redeem_points_per_dollar <= 0:
        return 0
    return int((merch_after_promo * Decimal(redeem_points_per_dollar)).to_integral_value(rounding=ROUND_DOWN))


def compute_redeem(
    requested_points: int,
    balance: int,
    merch_after_promo: Decimal,
    redeem_points_per_dollar: int,
) -> tuple[int, Decimal, str | None]:
    if requested_points <= 0:
        return 0, Decimal("0"), None
    if requested_points > balance:
        return 0, Decimal("0"), "Not enough loyalty points"
    if merch_after_promo <= 0:
        return 0, Decimal("0"), "No merchandise subtotal to apply points to"
    cap = max_redeem_points_for_merch(merch_after_promo, redeem_points_per_dollar)
    use_points = min(requested_points, balance, cap)
    if use_points <= 0:
        return 0, Decimal("0"), "These points cannot cover any more of this order subtotal"
    disc = points_to_discount(use_points, redeem_points_per_dollar)
    if disc > merch_after_promo:
        disc = merch_after_promo
        use_points = max_redeem_points_for_merch(merch_after_promo, redeem_points_per_dollar)
        use_points = min(use_points, requested_points, balance)
        disc = min(points_to_discount(use_points, redeem_points_per_dollar), merch_after_promo)
    return use_points, disc, None


def earn_points_for_qualifying_spend(qualifying_merchandise: Decimal, points_per_dollar: Decimal) -> int:
    if qualifying_merchandise <= 0 or points_per_dollar <= 0:
        return 0
    return int((qualifying_merchandise * points_per_dollar).to_integral_value(rounding=ROUND_DOWN))


def redeem_points_per_dollar() -> int:
    return max(1, int(settings.loyalty_redeem_points_per_dollar))


def earn_points_per_dollar() -> Decimal:
    return max(Decimal("0"), settings.loyalty_earn_points_per_dollar)
