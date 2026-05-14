"""Shared checkout completion: stock, order rows, interactions, cart clear."""

from collections import Counter, defaultdict
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.cart_item import CartItem
from app.models.interaction import Interaction
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.product_bundle import ProductBundle, ProductBundleItem
from app.models.product_variant import ProductVariant
from app.models.user import User
from app.models.user_address import UserAddress
from app.schemas.orders import OrderLineIn
from app.services import gift_cards as gift_svc
from app.services import loyalty as loyalty_svc
from app.services import promo_codes as promo_svc
from app.services.interaction_weights import interaction_weight
from app.services.product_pricing import effective_unit_price, volume_tiered_unit_price
from app.services.product_variants import product_ids_requiring_variant

GIFT_WRAP_FEE = Decimal("4.99")


def _clean_ship_str(s: str | None, max_len: int) -> str | None:
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    return t[:max_len]


def _resolve_shipping_snapshot(db: Session, user: User) -> dict[str, str | None]:
    """Prefer default/newest saved address; else profile address lines."""
    addr = db.scalars(
        select(UserAddress)
        .where(UserAddress.user_id == user.id)
        .order_by(UserAddress.is_default.desc(), UserAddress.created_at.desc())
        .limit(1),
    ).first()
    if addr is not None and (addr.address_line1 or "").strip():
        rn = (addr.recipient_name or "").strip() or (user.name or "").strip() or "Customer"
        ph = (addr.phone or "").strip() or (user.phone or "").strip()
        return {
            "ship_label": _clean_ship_str(addr.label, 64),
            "ship_recipient_name": _clean_ship_str(rn, 255),
            "ship_phone": _clean_ship_str(ph, 64) if ph else None,
            "ship_address_line1": (addr.address_line1 or "").strip()[:255],
            "ship_address_line2": _clean_ship_str(addr.address_line2, 255),
            "ship_city": _clean_ship_str(addr.city, 128),
            "ship_province": _clean_ship_str(addr.province, 128),
            "ship_postal_code": _clean_ship_str(addr.postal_code, 32),
            "ship_country": _clean_ship_str(addr.country, 128),
        }

    line1 = (user.address_line1 or "").strip()
    if line1:
        return {
            "ship_label": None,
            "ship_recipient_name": _clean_ship_str(user.name, 255) or "Customer",
            "ship_phone": _clean_ship_str(user.phone, 64),
            "ship_address_line1": line1[:255],
            "ship_address_line2": _clean_ship_str(user.address_line2, 255),
            "ship_city": _clean_ship_str(user.city, 128),
            "ship_province": _clean_ship_str(user.province, 128),
            "ship_postal_code": _clean_ship_str(user.postal_code, 32),
            "ship_country": _clean_ship_str(user.country, 128),
        }

    return {
        "ship_label": None,
        "ship_recipient_name": None,
        "ship_phone": None,
        "ship_address_line1": None,
        "ship_address_line2": None,
        "ship_city": None,
        "ship_province": None,
        "ship_postal_code": None,
        "ship_country": None,
    }


def _norm_install_note(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip()
    return s[:500] if s else None


class CheckoutError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


def _installation_fee_and_label(p: Product, with_installation: bool) -> tuple[Decimal, str | None]:
    """Per-unit installation fee and label snapshot; (0, None) when not requested."""
    if not with_installation:
        return Decimal("0"), None
    if getattr(p, "is_gift_card", False):
        raise CheckoutError(400, "Gift cards cannot include installation add-ons.")
    fee_raw = getattr(p, "installation_service_price", None)
    lbl = (getattr(p, "installation_service_label", None) or "").strip()
    if fee_raw is None or not lbl:
        raise CheckoutError(400, f"Installation add-on is not available for {p.name}.")
    fee = Decimal(str(fee_raw)).quantize(Decimal("0.01"))
    if fee < 0:
        raise CheckoutError(400, "Invalid installation service price.")
    return fee, lbl[:200]


@dataclass(frozen=True)
class CheckoutLineSpec:
    product_id: UUID
    variant_id: UUID | None
    quantity: int
    bundle_group_id: UUID | None = None
    bundle_id: UUID | None = None
    with_installation: bool = False
    installation_slot_note: str | None = None


@dataclass(frozen=True)
class CheckoutOrderRow:
    product_id: UUID
    variant_id: UUID | None
    quantity: int
    unit_price: Decimal
    with_installation: bool = False
    installation_slot_note: str | None = None
    installation_service_label: str | None = None
    installation_fee_per_unit: Decimal = Decimal("0")


@dataclass(frozen=True)
class CheckoutPricing:
    merged: dict[tuple[UUID, UUID | None], int]
    products: dict[UUID, Product]
    variants: dict[UUID, ProductVariant]
    need_variants: set[UUID]
    subtotal: Decimal
    """One order row per checkout line (bundle lines use allocated unit prices)."""
    order_rows: list[CheckoutOrderRow]


def coalesce_checkout_lines(items: list[OrderLineIn]) -> list[CheckoutLineSpec]:
    merged: dict[tuple[UUID, UUID | None, UUID | None, UUID | None, bool, str | None], int] = defaultdict(int)
    for row in items:
        note_k = _norm_install_note(row.installation_slot_note) if row.with_installation else None
        key = (row.product_id, row.variant_id, row.bundle_group_id, row.bundle_id, bool(row.with_installation), note_k)
        merged[key] += row.quantity
    return [
        CheckoutLineSpec(pid, vid, q, bg, bid, wi, note)
        for (pid, vid, bg, bid, wi, note), q in merged.items()
    ]


def checkout_specs_from_tuples(lines: list[tuple[UUID, UUID | None, int]]) -> list[CheckoutLineSpec]:
    """Backward-compatible: (product_id, variant_id, quantity) without bundle metadata."""
    return [CheckoutLineSpec(pid, vid, q, None, None, False, None) for pid, vid, q in lines]


def _line_list_unit(
    pid: UUID,
    vid: UUID | None,
    products: dict[UUID, Product],
    variants: dict[UUID, ProductVariant],
    need_variants: set[UUID],
    tier_quantity: int,
) -> Decimal:
    p = products[pid]
    if getattr(p, "is_gift_card", False):
        if pid in need_variants:
            assert vid is not None
            return variants[vid].price
        return effective_unit_price(p)
    if pid in need_variants:
        assert vid is not None
        base = variants[vid].price
        return volume_tiered_unit_price(
            base=base,
            tier_quantity=tier_quantity,
            tiers_raw=getattr(p, "volume_tiers", None),
            is_gift_card=False,
        )
    base = effective_unit_price(p)
    return volume_tiered_unit_price(
        base=base,
        tier_quantity=tier_quantity,
        tiers_raw=getattr(p, "volume_tiers", None),
        is_gift_card=False,
    )


def _bundle_item_counter(db: Session, bundle_id: UUID) -> Counter[tuple[str, str, int]]:
    rows = list(
        db.scalars(
            select(ProductBundleItem)
            .where(ProductBundleItem.bundle_id == bundle_id)
            .order_by(ProductBundleItem.sort_order.asc(), ProductBundleItem.id.asc()),
        ).all(),
    )
    return Counter(
        (str(r.product_id), str(r.variant_id) if r.variant_id else "", int(r.quantity)) for r in rows
    )


def load_checkout_pricing(
    db: Session,
    lines: list[CheckoutLineSpec],
    *,
    lock_rows: bool = True,
) -> CheckoutPricing:
    merged: dict[tuple[UUID, UUID | None], int] = defaultdict(int)
    for spec in lines:
        merged[(spec.product_id, spec.variant_id)] += spec.quantity

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

    tot_qty: dict[tuple[UUID, UUID | None], int] = defaultdict(int)
    for spec in lines:
        tot_qty[(spec.product_id, spec.variant_id)] += spec.quantity

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
            if not getattr(p, "is_gift_card", False) and v.stock < q:
                raise CheckoutError(409, f"Insufficient stock for {p.name} ({v.label})")
        else:
            if vid is not None:
                raise CheckoutError(400, "This product has no variants")
            if not getattr(p, "is_gift_card", False) and p.stock < q:
                raise CheckoutError(409, f"Insufficient stock for {p.name}")

    for spec in lines:
        if spec.bundle_group_id is not None and (
            spec.with_installation or _norm_install_note(spec.installation_slot_note)
        ):
            raise CheckoutError(400, "Installation add-ons cannot be attached to bundle lines.")
    for spec in lines:
        if spec.with_installation:
            _installation_fee_and_label(products[spec.product_id], True)

    subtotal = Decimal("0")
    order_rows: list[CheckoutOrderRow] = []

    by_bundle_group: dict[UUID, list[CheckoutLineSpec]] = defaultdict(list)
    non_bundle: list[CheckoutLineSpec] = []
    for spec in lines:
        if spec.bundle_group_id is not None:
            by_bundle_group[spec.bundle_group_id].append(spec)
        else:
            non_bundle.append(spec)

    for spec in non_bundle:
        tq = tot_qty[(spec.product_id, spec.variant_id)]
        merch = _line_list_unit(spec.product_id, spec.variant_id, products, variants, need_variants, tq)
        p = products[spec.product_id]
        fee, ilabel = _installation_fee_and_label(p, spec.with_installation)
        note = _norm_install_note(spec.installation_slot_note) if spec.with_installation else None
        unit = merch + fee
        subtotal += unit * spec.quantity
        order_rows.append(
            CheckoutOrderRow(
                spec.product_id,
                spec.variant_id,
                spec.quantity,
                unit,
                spec.with_installation,
                note,
                ilabel,
                fee,
            ),
        )

    seen_bundle: set[UUID] = set()
    for spec in lines:
        if spec.bundle_group_id is None:
            continue
        bg = spec.bundle_group_id
        if bg in seen_bundle:
            continue
        seen_bundle.add(bg)
        group_lines = by_bundle_group[bg]
        bids = {g.bundle_id for g in group_lines}
        if len(bids) != 1 or bids == {None}:
            for bl_spec in group_lines:
                tq = tot_qty[(bl_spec.product_id, bl_spec.variant_id)]
                unit = _line_list_unit(bl_spec.product_id, bl_spec.variant_id, products, variants, need_variants, tq)
                subtotal += unit * bl_spec.quantity
                order_rows.append(
                    CheckoutOrderRow(
                        bl_spec.product_id,
                        bl_spec.variant_id,
                        bl_spec.quantity,
                        unit,
                        False,
                        None,
                        None,
                        Decimal("0"),
                    ),
                )
            continue
        bid = next(iter(bids))
        bundle = db.get(ProductBundle, bid)
        exp = _bundle_item_counter(db, bid)
        act = Counter(
            (str(s.product_id), str(s.variant_id) if s.variant_id else "", int(s.quantity)) for s in group_lines
        )
        if bundle is None or not bundle.active or exp != act:
            for bl_spec in group_lines:
                tq = tot_qty[(bl_spec.product_id, bl_spec.variant_id)]
                unit = _line_list_unit(bl_spec.product_id, bl_spec.variant_id, products, variants, need_variants, tq)
                subtotal += unit * bl_spec.quantity
                order_rows.append(
                    CheckoutOrderRow(
                        bl_spec.product_id,
                        bl_spec.variant_id,
                        bl_spec.quantity,
                        unit,
                        False,
                        None,
                        None,
                        Decimal("0"),
                    ),
                )
            continue

        line_totals: list[tuple[CheckoutLineSpec, Decimal]] = []
        for spec in sorted(group_lines, key=lambda s: (str(s.product_id), str(s.variant_id or ""))):
            tq = tot_qty[(spec.product_id, spec.variant_id)]
            u = _line_list_unit(spec.product_id, spec.variant_id, products, variants, need_variants, tq)
            line_totals.append((spec, u * spec.quantity))
        list_sum = sum(lt for _s, lt in line_totals)
        bp = bundle.bundle_price
        if list_sum <= 0:
            bp = Decimal("0")
        else:
            bp = min(bp, list_sum)
        subtotal += bp

        remaining = bp
        for i, (spec, lt) in enumerate(line_totals):
            if i == len(line_totals) - 1:
                line_amt = max(Decimal("0"), remaining)
            else:
                if list_sum <= 0:
                    line_amt = Decimal("0")
                else:
                    line_amt = (bp * (lt / list_sum)).quantize(Decimal("0.01"))
                remaining = (remaining - line_amt).quantize(Decimal("0.01"))
            u_alloc = (line_amt / spec.quantity).quantize(Decimal("0.01")) if spec.quantity else Decimal("0")
            order_rows.append(
                CheckoutOrderRow(
                    spec.product_id,
                    spec.variant_id,
                    spec.quantity,
                    u_alloc,
                    False,
                    None,
                    None,
                    Decimal("0"),
                ),
            )

    return CheckoutPricing(
        merged=dict(merged),
        products=products,
        variants=variants,
        need_variants=need_variants,
        subtotal=subtotal,
        order_rows=order_rows,
    )


def fulfill_checkout(
    db: Session,
    user_id: UUID,
    lines: list[CheckoutLineSpec],
    *,
    payment_method: str,
    stripe_checkout_session_id: str | None = None,
    gift_wrap: bool = False,
    gift_message: str | None = None,
    promo_code: str | None = None,
    stripe_promo_discount: Decimal | None = None,
    redeem_loyalty_points: int | None = None,
    stripe_loyalty_discount: Decimal | None = None,
    stripe_loyalty_points_redeemed: int | None = None,
    gift_card_code: str | None = None,
    gift_cards_recipient_email: str | None = None,
    gift_cards_message: str | None = None,
    stripe_gift_card_discount: Decimal | None = None,
    stripe_gift_card_code: str | None = None,
) -> Order:
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

    merch_after_promo = pricing.subtotal - discount
    if merch_after_promo < 0:
        merch_after_promo = Decimal("0")

    loyalty_discount = Decimal("0")
    loyalty_pts_used = 0

    user_row = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user_row is None:
        raise CheckoutError(404, "User not found")
    balance_before = int(user_row.loyalty_points or 0)

    ppr = loyalty_svc.redeem_points_per_dollar()

    if stripe_loyalty_discount is not None or (stripe_loyalty_points_redeemed or 0) > 0:
        ld = Decimal("0")
        if stripe_loyalty_discount is not None:
            ld = max(Decimal("0"), stripe_loyalty_discount.quantize(Decimal("0.01")))
        pts_meta = int(stripe_loyalty_points_redeemed or 0)
        if (ld > 0) ^ (pts_meta > 0):
            raise CheckoutError(400, "Invalid loyalty metadata on payment")
        if pts_meta > balance_before:
            raise CheckoutError(400, "Not enough loyalty points to finalize this payment; start checkout again.")
        if ld > merch_after_promo:
            raise CheckoutError(400, "Loyalty discount no longer valid for this cart")
        if pts_meta > 0:
            expected = loyalty_svc.points_to_discount(pts_meta, ppr)
            if expected != ld:
                raise CheckoutError(400, "Loyalty amount does not match redeemed points")
        loyalty_discount = ld
        loyalty_pts_used = pts_meta
        user_row.loyalty_points = balance_before - loyalty_pts_used
    elif redeem_loyalty_points is not None and redeem_loyalty_points > 0:
        use_pts, disc, err = loyalty_svc.compute_redeem(
            redeem_loyalty_points,
            balance_before,
            merch_after_promo,
            ppr,
        )
        if err:
            raise CheckoutError(400, err)
        loyalty_discount = disc
        loyalty_pts_used = use_pts
        user_row.loyalty_points = balance_before - loyalty_pts_used

    merch_after_loyalty = merch_after_promo - loyalty_discount
    if merch_after_loyalty < 0:
        merch_after_loyalty = Decimal("0")

    gift_card_discount = Decimal("0")
    gift_card_snap: str | None = None

    sgc_key = gift_svc.normalize_gift_card_code(stripe_gift_card_code) if stripe_gift_card_code else None
    if stripe_gift_card_discount is not None or sgc_key:
        gd = Decimal("0")
        if stripe_gift_card_discount is not None:
            gd = max(Decimal("0"), stripe_gift_card_discount.quantize(Decimal("0.01")))
        if (gd > 0) ^ bool(sgc_key):
            raise CheckoutError(400, "Invalid gift card metadata on payment")
        row = gift_svc.get_card_by_code(db, sgc_key, for_update=True)
        if row is None:
            raise CheckoutError(400, "Gift card not found or inactive")
        if row.balance_remaining <= 0:
            raise CheckoutError(400, "Gift card has no balance")
        expected = gift_svc.preview_redemption_amount(row, merch_after_loyalty)
        if gd != expected:
            raise CheckoutError(400, "Gift card amount does not match current cart; start checkout again")
        row.balance_remaining = (row.balance_remaining - gd).quantize(Decimal("0.01"))
        gift_card_discount = gd
        gift_card_snap = row.code
    elif gift_card_code and gift_svc.normalize_gift_card_code(gift_card_code):
        row = gift_svc.get_card_by_code(db, gift_card_code, for_update=True)
        if row is None:
            raise CheckoutError(400, "Invalid gift card code")
        if row.balance_remaining <= 0:
            raise CheckoutError(400, "Gift card has no balance left")
        gd = gift_svc.preview_redemption_amount(row, merch_after_loyalty)
        if gd <= 0:
            raise CheckoutError(400, "Nothing to apply from this gift card for this order")
        row.balance_remaining = (row.balance_remaining - gd).quantize(Decimal("0.01"))
        gift_card_discount = gd
        gift_card_snap = row.code

    qualifying = merch_after_loyalty - gift_card_discount
    if qualifying < 0:
        qualifying = Decimal("0")
    earned = loyalty_svc.earn_points_for_qualifying_spend(qualifying, loyalty_svc.earn_points_per_dollar())
    user_row.loyalty_points = int(user_row.loyalty_points or 0) + earned

    total = merch_after_loyalty - gift_card_discount + wrap_fee
    if total < 0:
        total = Decimal("0")

    ship_snap = _resolve_shipping_snapshot(db, user_row)
    if not (ship_snap.get("ship_address_line1") or "").strip():
        raise CheckoutError(
            400,
            "กรุณาเพิ่มที่อยู่จัดส่งในสมุดที่อยู่ หรือบรรทัดที่อยู่ในโปรไฟล์ ก่อนชำระเงิน",
        )

    order = Order(
        user_id=user_id,
        status="processing",
        total_amount=total,
        payment_method=payment_method,
        stripe_checkout_session_id=stripe_checkout_session_id,
        gift_wrap=wrap_requested,
        gift_message=msg_clean if wrap_requested else None,
        promo_code=promo_snap,
        promo_discount=discount if discount > 0 else None,
        loyalty_points_redeemed=loyalty_pts_used if loyalty_pts_used > 0 else None,
        loyalty_discount=loyalty_discount if loyalty_discount > 0 else None,
        loyalty_points_earned=earned if earned > 0 else None,
        gift_card_code=gift_card_snap,
        gift_card_discount=gift_card_discount if gift_card_discount > 0 else None,
        **ship_snap,
    )
    db.add(order)
    db.flush()

    for (pid, vid), q in merged.items():
        p = products[pid]
        if vid is not None:
            v = variants[vid]
            if not getattr(p, "is_gift_card", False):
                v.stock -= q
        else:
            if not getattr(p, "is_gift_card", False):
                p.stock -= q

    for orow in pricing.order_rows:
        pid, vid = orow.product_id, orow.variant_id
        q, unit_price = orow.quantity, orow.unit_price
        p = products[pid]
        if vid is not None:
            v = variants[vid]
            pname = p.name
            vlabel = v.label
        else:
            pname = p.name
            vlabel = None
        inst_label = orow.installation_service_label if orow.with_installation else None
        inst_fee = orow.installation_fee_per_unit if orow.with_installation else None
        inst_note = orow.installation_slot_note if orow.with_installation else None
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=pid,
                variant_id=vid,
                variant_label=vlabel,
                product_name=pname,
                quantity=q,
                unit_price=unit_price,
                installation_service_label=inst_label,
                installation_service_fee=inst_fee,
                installation_slot_note=inst_note,
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

    msg_clean_gc = (gift_cards_message or "").strip()[:2000] if gift_cards_message else None
    email_clean_gc = (gift_cards_recipient_email or "").strip()[:255] if gift_cards_recipient_email else None
    gift_svc.mint_for_order(
        db,
        order,
        user_id,
        merged,
        products,
        variants,
        recipient_email=email_clean_gc,
        personal_message=msg_clean_gc,
    )

    db.execute(delete(CartItem).where(CartItem.user_id == user_id))
    return order
