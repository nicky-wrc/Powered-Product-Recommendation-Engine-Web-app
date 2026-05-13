"""Digital gift cards: issue on purchase, redeem balance at checkout (after promo + loyalty)."""

import re
import secrets
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.gift_card import GiftCard
from app.models.order import Order
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.services.product_pricing import effective_unit_price

_CODE_RE = re.compile(r"[^A-Za-z0-9]")


def normalize_gift_card_code(raw: str | None) -> str | None:
    if raw is None or not str(raw).strip():
        return None
    c = _CODE_RE.sub("", str(raw).strip()).upper()
    if len(c) < 8:
        return None
    return c


def generate_unique_code(db: Session) -> str:
    for _ in range(48):
        # e.g. GC1A2B3C4D5E6F7 (no dashes; easier to store unique)
        body = secrets.token_hex(8).upper()
        code = f"GC{body}"
        taken = db.scalar(select(GiftCard.id).where(GiftCard.code == code))
        if taken is None:
            return code
    raise RuntimeError("Could not allocate a unique gift card code")


def get_card_by_code(db: Session, raw: str | None, *, for_update: bool = False) -> GiftCard | None:
    norm = normalize_gift_card_code(raw)
    if not norm:
        return None
    stmt = select(GiftCard).where(GiftCard.code == norm, GiftCard.active.is_(True))
    if for_update:
        stmt = stmt.with_for_update()
    return db.scalar(stmt)


def preview_redemption_amount(card: GiftCard, merch_after_loyalty: Decimal) -> Decimal:
    bal = card.balance_remaining.quantize(Decimal("0.01"))
    if bal <= 0 or merch_after_loyalty <= 0:
        return Decimal("0")
    return min(bal, merch_after_loyalty).quantize(Decimal("0.01"))


def mint_for_order(
    db: Session,
    order: Order,
    purchaser_user_id: UUID,
    merged: dict[tuple[UUID, UUID | None], int],
    products: dict[UUID, Product],
    variants: dict[UUID, ProductVariant],
    *,
    recipient_email: str | None,
    personal_message: str | None,
) -> None:
    msg = (personal_message or "").strip()[:2000] if personal_message else None
    email = (recipient_email or "").strip()[:255] if recipient_email else None
    email_out = email if email else None

    for (pid, vid), q in merged.items():
        p = products[pid]
        if not getattr(p, "is_gift_card", False):
            continue
        if vid is not None:
            unit = variants[vid].price
        else:
            unit = effective_unit_price(p)
        unit = unit.quantize(Decimal("0.01"))
        for _ in range(q):
            card = GiftCard(
                code=generate_unique_code(db),
                face_value=unit,
                balance_remaining=unit,
                issuer_order_id=order.id,
                purchased_by_user_id=purchaser_user_id,
                recipient_email=email_out,
                personal_message=msg,
            )
            db.add(card)
            db.flush()
