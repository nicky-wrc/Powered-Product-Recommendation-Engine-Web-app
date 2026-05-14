"""Stripe Checkout: create session, webhook, optional sync when webhook is not wired (dev)."""

import json
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from stripe._error import SignatureVerificationError
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models.order import Order
from app.models.user import User
from app.schemas.orders import OrderLineIn, order_public
from app.services.checkout_fulfillment import (
    CheckoutError,
    CheckoutLineSpec,
    GIFT_WRAP_FEE,
    coalesce_checkout_lines,
    fulfill_checkout,
    load_checkout_pricing,
)
from app.services.order_notifications import try_send_order_confirmation
from app.services import gift_cards as gift_svc
from app.services import loyalty as loyalty_svc
from app.services.promo_codes import normalize_promo_code, preview_promo_discount

router = APIRouter(prefix="/payments", tags=["payments"])


def _parse_meta_items(raw: str) -> list[CheckoutLineSpec]:
    pairs: list = json.loads(raw)
    out: list[CheckoutLineSpec] = []
    for item in pairs:
        if len(item) == 2:
            pid_s, q = item[0], item[1]
            out.append(CheckoutLineSpec(UUID(str(pid_s)), None, int(q), None, None))
        elif len(item) == 3:
            pid_s, vid_s, q = item[0], item[1], item[2]
            vid = UUID(str(vid_s)) if vid_s else None
            out.append(CheckoutLineSpec(UUID(str(pid_s)), vid, int(q), None, None))
        else:
            pid_s, vid_s, q, bg_s, bid_s = item[0], item[1], item[2], item[3], item[4]
            vid = UUID(str(vid_s)) if vid_s else None
            bg = UUID(str(bg_s)) if bg_s else None
            bid = UUID(str(bid_s)) if bid_s else None
            out.append(CheckoutLineSpec(UUID(str(pid_s)), vid, int(q), bg, bid))
    return out


def _stripe_promo_from_metadata(meta: dict) -> tuple[str | None, Decimal | None]:
    raw_c = meta.get("promo_discount_cents") or "0"
    try:
        cents = int(str(raw_c).strip())
    except ValueError:
        cents = 0
    code_raw = meta.get("promo_code")
    code = code_raw.strip() if isinstance(code_raw, str) and code_raw.strip() else None
    if cents <= 0:
        return code, None
    return code, (Decimal(cents) / Decimal("100")).quantize(Decimal("0.01"))


def _gift_opts_from_metadata(meta: dict) -> tuple[bool, str | None]:
    wrap = str(meta.get("gift_wrap") or "0") == "1"
    raw = meta.get("gift_message")
    if wrap and isinstance(raw, str) and raw.strip():
        return True, raw.strip()[:500]
    return wrap, None


def _stripe_loyalty_from_metadata(meta: dict) -> tuple[Decimal | None, int | None]:
    if "loyalty_discount_cents" not in meta and "loyalty_points_redeemed" not in meta:
        return None, None
    try:
        cents = int(str(meta.get("loyalty_discount_cents") or "0").strip())
        pts = int(str(meta.get("loyalty_points_redeemed") or "0").strip())
    except ValueError:
        return None, None
    if cents <= 0 and pts <= 0:
        return None, None
    return (Decimal(cents) / Decimal("100")).quantize(Decimal("0.01")), pts


def _stripe_gift_from_metadata(meta: dict) -> tuple[Decimal | None, str | None]:
    if "gift_card_discount_cents" not in meta and "gift_card_code" not in meta:
        return None, None
    try:
        cents = int(str(meta.get("gift_card_discount_cents") or "0").strip())
    except ValueError:
        cents = 0
    raw = meta.get("gift_card_code")
    code = str(raw).strip() if isinstance(raw, str) and str(raw).strip() else None
    disc: Decimal | None = (Decimal(cents) / Decimal("100")).quantize(Decimal("0.01")) if cents > 0 else None
    if disc is None and not code:
        return None, None
    return disc, code


def _gift_card_recipient_from_metadata(meta: dict) -> tuple[str | None, str | None]:
    em = meta.get("gift_cards_recipient_email")
    msg = meta.get("gift_cards_message")
    e_out = em.strip()[:255] if isinstance(em, str) and em.strip() else None
    m_out = msg.strip()[:2000] if isinstance(msg, str) and msg.strip() else None
    return e_out, m_out


class CheckoutSessionBody(BaseModel):
    items: list[OrderLineIn] = Field(min_length=1)
    gift_wrap: bool = False
    gift_message: str | None = Field(default=None, max_length=500)
    promo_code: str | None = Field(default=None, max_length=64)
    redeem_loyalty_points: int | None = Field(default=None, ge=0, le=500_000)
    gift_card_code: str | None = Field(default=None, max_length=40)
    gift_cards_recipient_email: str | None = Field(default=None, max_length=255)
    gift_cards_message: str | None = Field(default=None, max_length=2000)
    # When true, require user.express_checkout_enabled and prefill Stripe Checkout email.
    express_checkout: bool = False


def _stripe_enabled() -> bool:
    return bool(settings.stripe_secret_key and settings.stripe_secret_key.strip())


def _to_cents(price: Decimal) -> int:
    return int((price * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


@router.get("/status")
def payment_status() -> dict:
    return {"stripe_checkout_available": _stripe_enabled()}


@router.post("/create-checkout-session")
def create_checkout_session(
    body: CheckoutSessionBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not _stripe_enabled():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Stripe is not configured (set STRIPE_SECRET_KEY in backend .env).",
        )

    lines_specs = coalesce_checkout_lines(body.items)
    try:
        pricing = load_checkout_pricing(db, lines_specs, lock_rows=False)
    except CheckoutError as e:
        raise HTTPException(e.status_code, e.detail) from e

    discount = Decimal("0")
    promo_norm: str | None = None
    if body.promo_code and body.promo_code.strip():
        d, err = preview_promo_discount(db, body.promo_code, pricing.subtotal)
        if err:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, err)
        discount = d
        promo_norm = normalize_promo_code(body.promo_code)

    merch_after_promo = pricing.subtotal - discount
    if merch_after_promo < 0:
        merch_after_promo = Decimal("0")

    redeem_req = int(body.redeem_loyalty_points or 0)
    loyalty_discount = Decimal("0")
    loyalty_pts = 0
    if redeem_req > 0:
        bal = int(user.loyalty_points or 0)
        loyalty_pts, loyalty_discount, err = loyalty_svc.compute_redeem(
            redeem_req,
            bal,
            merch_after_promo,
            loyalty_svc.redeem_points_per_dollar(),
        )
        if err:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, err)

    merch_after_loyalty = merch_after_promo - loyalty_discount
    if merch_after_loyalty < 0:
        merch_after_loyalty = Decimal("0")

    gc_discount = Decimal("0")
    gc_stored_code = ""
    if body.gift_card_code and body.gift_card_code.strip():
        row = gift_svc.get_card_by_code(db, body.gift_card_code, for_update=False)
        if row is None or not row.active or row.balance_remaining <= 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid gift card")
        gc_discount = gift_svc.preview_redemption_amount(row, merch_after_loyalty)
        gc_stored_code = row.code

    merch_pay = merch_after_loyalty - gc_discount
    if merch_pay < 0:
        merch_pay = Decimal("0")

    if merch_pay <= 0 and not body.gift_wrap:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Order total is $0; use Place order (direct checkout) instead of Stripe.",
        )

    line_items: list[dict] = []
    if discount > 0 or loyalty_discount > 0 or gc_discount > 0:
        label_parts: list[str] = []
        if discount > 0:
            label_parts.append("promo")
        if loyalty_discount > 0:
            label_parts.append("loyalty")
        if gc_discount > 0:
            label_parts.append("gift card")
        suffix = " + ".join(label_parts) if label_parts else "adjustments"
        line_items.append(
            {
                "quantity": 1,
                "price_data": {
                    "currency": "usd",
                    "unit_amount": _to_cents(merch_pay),
                    "product_data": {
                        "name": (f"Cart — {len(pricing.merged)} line(s), {suffix}")[:120],
                    },
                },
            },
        )
    else:
        for pid, vid, q, unit in sorted(
            pricing.order_rows,
            key=lambda x: (str(x[0]), str(x[1] or ""), x[2]),
        ):
            p = pricing.products[pid]
            if vid is not None:
                v = pricing.variants[vid]
                display = f"{p.name} — {v.label}"
            else:
                display = p.name
            line_items.append(
                {
                    "quantity": q,
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": _to_cents(unit),
                        "product_data": {"name": display[:120]},
                    },
                },
            )

    if body.gift_wrap:
        line_items.append(
            {
                "quantity": 1,
                "price_data": {
                    "currency": "usd",
                    "unit_amount": _to_cents(GIFT_WRAP_FEE),
                    "product_data": {"name": "Gift wrapping"},
                },
            },
        )

    compact_items = json.dumps(
        [
            [
                str(s.product_id),
                str(s.variant_id) if s.variant_id else "",
                s.quantity,
                str(s.bundle_group_id) if s.bundle_group_id else "",
                str(s.bundle_id) if s.bundle_id else "",
            ]
            for s in lines_specs
        ],
        separators=(",", ":"),
    )
    if len(compact_items) > 450:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cart is too large for a single Stripe session; place a smaller order.",
        )

    meta: dict[str, str] = {
        "user_id": str(user.id),
        "items": compact_items,
        "gift_wrap": "1" if body.gift_wrap else "0",
        "promo_discount_cents": str(_to_cents(discount)),
        "loyalty_discount_cents": str(_to_cents(loyalty_discount)),
        "loyalty_points_redeemed": str(loyalty_pts),
        "gift_card_discount_cents": str(_to_cents(gc_discount)),
        "gift_card_code": gc_stored_code,
    }
    if promo_norm:
        meta["promo_code"] = promo_norm[:60]
    if body.gift_wrap and body.gift_message and body.gift_message.strip():
        meta["gift_message"] = body.gift_message.strip()[:450]
    if body.gift_cards_recipient_email and body.gift_cards_recipient_email.strip():
        meta["gift_cards_recipient_email"] = body.gift_cards_recipient_email.strip()[:255]
    if body.gift_cards_message and body.gift_cards_message.strip():
        meta["gift_cards_message"] = body.gift_cards_message.strip()[:450]

    base = settings.public_app_url.rstrip("/")
    stripe.api_key = settings.stripe_secret_key

    session_kwargs: dict = {
        "mode": "payment",
        "line_items": line_items,
        "success_url": f"{base}/orders?payment=stripe&session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{base}/cart",
        "client_reference_id": str(user.id),
        "metadata": meta,
    }
    if body.express_checkout:
        if not getattr(user, "express_checkout_enabled", False):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Express checkout is not enabled for this account; turn it on in Profile first.",
            )
        if user.email and user.email.strip():
            session_kwargs["customer_email"] = user.email.strip()

    try:
        session = stripe.checkout.Session.create(**session_kwargs)
    except stripe.StripeError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Stripe error: {e!s}") from e

    if not session.url:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Stripe did not return a checkout URL.")
    return {"url": session.url}


class SyncSessionBody(BaseModel):
    session_id: str = Field(min_length=10, max_length=255)


@router.post("/sync-session")
def sync_checkout_session(
    body: SyncSessionBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """If webhook is not running (local dev), finalize order after redirect using Stripe API."""
    if not _stripe_enabled():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Stripe is not configured.")
    stripe.api_key = settings.stripe_secret_key
    try:
        session = stripe.checkout.Session.retrieve(body.session_id)
    except stripe.StripeError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Stripe error: {e!s}") from e

    if session.payment_status != "paid":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This checkout session is not paid yet.")

    meta = session.metadata or {}
    if meta.get("user_id") != str(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This payment belongs to another account.")

    raw_items = meta.get("items")
    if not raw_items:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing cart metadata on session.")
    try:
        lines = _parse_meta_items(raw_items)
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid cart metadata.") from e

    gift_wrap, gift_message = _gift_opts_from_metadata(meta)
    promo_c, promo_disc = _stripe_promo_from_metadata(meta)
    lo_disc, lo_pts = _stripe_loyalty_from_metadata(meta)
    gc_disc, gc_code = _stripe_gift_from_metadata(meta)
    recv_em, recv_msg = _gift_card_recipient_from_metadata(meta)

    try:
        order = fulfill_checkout(
            db,
            user.id,
            lines,
            payment_method="stripe",
            stripe_checkout_session_id=session.id,
            gift_wrap=gift_wrap,
            gift_message=gift_message,
            promo_code=promo_c,
            stripe_promo_discount=promo_disc,
            stripe_loyalty_discount=lo_disc,
            stripe_loyalty_points_redeemed=lo_pts,
            gift_cards_recipient_email=recv_em,
            gift_cards_message=recv_msg,
            stripe_gift_card_discount=gc_disc,
            stripe_gift_card_code=gc_code,
        )
        db.commit()
    except CheckoutError as e:
        db.rollback()
        raise HTTPException(e.status_code, e.detail) from e
    except IntegrityError:
        db.rollback()
        o = db.scalar(
            select(Order)
            .where(Order.stripe_checkout_session_id == session.id)
            .options(selectinload(Order.items)),
        )
        if o is None:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "Payment recorded but order linkage failed; contact support.",
            ) from None
        try_send_order_confirmation(db, o.id)
        return {"status": "ok", "order": order_public(o).model_dump(mode="json")}

    try_send_order_confirmation(db, order.id)

    o = db.scalar(
        select(Order).where(Order.id == order.id).options(selectinload(Order.items)),
    )
    if o is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Order persist failed")
    return {"status": "ok", "order": order_public(o).model_dump(mode="json")}


def _finalize_from_stripe_session(session: stripe.checkout.Session, db: Session) -> None:
    meta = session.metadata or {}
    uid_s = meta.get("user_id")
    raw_items = meta.get("items")
    if not uid_s or not raw_items:
        return
    try:
        user_id = UUID(uid_s)
        lines = _parse_meta_items(raw_items)
        gift_wrap, gift_message = _gift_opts_from_metadata(meta)
        promo_c, promo_disc = _stripe_promo_from_metadata(meta)
        lo_disc, lo_pts = _stripe_loyalty_from_metadata(meta)
        gc_disc, gc_code = _stripe_gift_from_metadata(meta)
        recv_em, recv_msg = _gift_card_recipient_from_metadata(meta)
        order = fulfill_checkout(
            db,
            user_id,
            lines,
            payment_method="stripe",
            stripe_checkout_session_id=session.id,
            gift_wrap=gift_wrap,
            gift_message=gift_message,
            promo_code=promo_c,
            stripe_promo_discount=promo_disc,
            stripe_loyalty_discount=lo_disc,
            stripe_loyalty_points_redeemed=lo_pts,
            gift_cards_recipient_email=recv_em,
            gift_cards_message=recv_msg,
            stripe_gift_card_discount=gc_disc,
            stripe_gift_card_code=gc_code,
        )
        db.commit()
        try_send_order_confirmation(db, order.id)
    except CheckoutError:
        db.rollback()
    except IntegrityError:
        db.rollback()
        o = db.scalar(select(Order).where(Order.stripe_checkout_session_id == session.id))
        if o is not None:
            try_send_order_confirmation(db, o.id)
    except (json.JSONDecodeError, ValueError, TypeError):
        db.rollback()


@router.post("/webhook")
async def stripe_webhook(request: Request) -> dict:
    if not settings.stripe_webhook_secret:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Webhook secret not configured (STRIPE_WEBHOOK_SECRET).",
        )
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    if not sig:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing Stripe-Signature header.")
    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig,
            settings.stripe_webhook_secret,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid payload.") from e
    except SignatureVerificationError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Stripe signature.") from e

    if event["type"] != "checkout.session.completed":
        return {"received": True}

    session_obj = event["data"]["object"]
    session_id = session_obj.get("id")
    if not session_id:
        return {"received": True}

    stripe.api_key = settings.stripe_secret_key
    session = stripe.checkout.Session.retrieve(session_id)

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _finalize_from_stripe_session(session, db)
    finally:
        db.close()
    return {"received": True}