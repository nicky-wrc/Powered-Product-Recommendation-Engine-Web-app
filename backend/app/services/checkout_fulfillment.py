"""Shared checkout completion: stock, order rows, interactions, cart clear."""

from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.cart_item import CartItem
from app.models.interaction import Interaction
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.services.interaction_weights import interaction_weight
from app.services.product_pricing import effective_unit_price
from app.services.product_variants import product_ids_requiring_variant
from app.services import promo_codes as promo_svc

GIFT_WRAP_FEE = Decimal("4.99")

CheckoutLine = tuple[UUID, UUID | None, int]  # product_id, variant_id | None, quantity


class CheckoutError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class CheckoutPricing:
    merged: dict[tuple[UUID, UUID | None], int]
    products: dict[UUID, Product]
    variants: dict[UUID, ProductVariant]
    need_variants: set[UUID]
    subtotal: Decimal


def load_checkout_pricing(
    db: Session,
    lines: list[CheckoutLine],
    *,
    lock_rows: bool = True,
) -> CheckoutPricing:
    merged: dict[tuple[UUID, UUID | None], int] = defaultdict(int)
    for pid, vid, q in lines:
        merged[(pid, vid)] += q

    pid_list = {pid for pid, _vid in merged}
    products: dict[UUID, Product] = {}
    for pid in sorted(pid_list, key=lambda x: str(x)):
        stmt = select(Product).where(Product.id == pid)
        if lock_rows:
            stmt = stmt.with_for_update()
        p = db.scalar(stmt)
        if p is None:
            raise CheckoutError(404, "Product not found")
        products[pid] = p

    need_variants = product_ids_requiring_variant(db, pid_list)

    variants: dict[UUID, ProductVariant] = {}
    variant_ids = {vid for (_pid, vid), _q in merged.items() if vid is not None}
    for vid in sorted(variant_ids, key=lambda x: str(x)):
        stmt = select(ProductVariant).where(ProductVariant.id == vid)
        if lock_rows:
            stmt = stmt.with_for_update()
        v = db.scalar(stmt)
        if v is None:
            raise CheckoutError(404, "Product variant not found")
        variants[vid] = v

    for (pid, vid), q in merged.items():
        p = products[pid]
        if pid in need_variants:
            if vid is None:
                raise CheckoutError(400, f"Select a variant for {p.name}")
            v = variants[vid]
            if v.product_id != pid:
                raise CheckoutError(400, "Variant does not match product")
            if v.stock < q:
                raise CheckoutError(409, f"Insufficient stock for {p.name} ({v.label})")
        else:
            if vid is not None:
                raise CheckoutError(400, "This product has no variants")
            if p.stock < q:
                raise CheckoutError(409, f"Insufficient stock for {p.name}")

    subtotal = Decimal("0")
    for (pid, vid), q in merged.items():
        p = products[pid]
        if vid is not None:
            unit = variants[vid].price
            subtotal += unit * q
        else:
            subtotal += effective_unit_price(p) * q

    return CheckoutPricing(
        merged=dict(merged),
        products=products,
        variants=variants,
        need_variants=need_variants,
        subtotal=subtotal,
    )


def fulfill_checkout(
    db: Session,
    user_id: UUID,
    lines: list[CheckoutLine],
    *,
    payment_method: str,
    stripe_checkout_session_id: str | None = None,
    gift_wrap: bool = False,
    gift_message: str | None = None,
    promo_code: str | None = None,
    stripe_promo_discount: Decimal | None = None,
) -> Order:
    """
    stripe_promo_discount: when set (Stripe paid amount path), skip re-validation amount;
      must match what was charged. promo_code is stored for display.
    """
    if stripe_checkout_session_id:
        existing = db.scalar(
            select(Order).where(Order.stripe_checkout_session_id == stripe_checkout_session_id),
        )
        if existing is not None:
            return existing

    pricing = load_checkout_pricing(db, lines, lock_rows=True)
    merged = pricing.merged
    products = pricing.products
    variants = pricing.variants

    wrap_requested = bool(gift_wrap)
    msg_clean = (gift_message or "").strip()[:500] if wrap_requested else None
    wrap_fee = GIFT_WRAP_FEE if wrap_requested else Decimal("0")

    discount = Decimal("0")
    promo_snap: str | None = None

    if stripe_promo_discount is not None:
        discount = max(Decimal("0"), stripe_promo_discount.quantize(Decimal("0.01")))
        if discount > pricing.subtotal:
            discount = pricing.subtotal
        promo_snap = promo_svc.normalize_promo_code(promo_code)
        if stripe_checkout_session_id and promo_snap and discount > 0:
            row = promo_svc.get_promo_code_row(db, promo_snap, for_update=True)
            if row is not None:
                promo_svc.increment_promo_use(row)
    elif promo_code and (promo_svc.normalize_promo_code(promo_code)):
        disc, row, err = promo_svc.lock_validate_and_discount(db, promo_code, pricing.subtotal)
        if err:
            raise CheckoutError(400, err)
        discount = disc
        promo_snap = promo_svc.normalize_promo_code(promo_code)
        if row is not None:
            promo_svc.increment_promo_use(row)

    total = pricing.subtotal - discount + wrap_fee
    if total < 0:
        total = Decimal("0")

    order = Order(
        user_id=user_id,
        status="completed",
        total_amount=total,
        payment_method=payment_method,
        stripe_checkout_session_id=stripe_checkout_session_id,
        gift_wrap=wrap_requested,
        gift_message=msg_clean if wrap_requested else None,
        promo_code=promo_snap,
        promo_discount=discount if discount > 0 else None,
    )
    db.add(order)
    db.flush()

    for (pid, vid), q in merged.items():
        p = products[pid]
        if vid is not None:
            v = variants[vid]
            unit_price = v.price
            v.stock -= q
            pname = p.name
            vlabel = v.label
        else:
            unit_price = effective_unit_price(p)
            p.stock -= q
            pname = p.name
            vlabel = None
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=pid,
                variant_id=vid,
                variant_label=vlabel,
                product_name=pname,
                quantity=q,
                unit_price=unit_price,
            ),
        )
        w = interaction_weight("purchase", {"quantity": q})
        db.add(
            Interaction(
                user_id=user_id,
                product_id=pid,
                event_type="purchase",
                weight=w,
                event_metadata={
                    "quantity": q,
                    "source": "order",
                    "order_id": str(order.id),
                    "variant_id": str(vid) if vid else None,
                },
            ),
        )

    db.execute(delete(CartItem).where(CartItem.user_id == user_id))
    return order
