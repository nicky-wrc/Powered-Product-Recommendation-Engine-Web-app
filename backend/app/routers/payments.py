"""Stripe Checkout: create session, webhook, optional sync when webhook is not wired (dev)."""

import json
from collections import defaultdict
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
from app.services.checkout_fulfillment import CheckoutError, GIFT_WRAP_FEE, fulfill_checkout, load_checkout_pricing
from app.services.product_pricing import effective_unit_price
from app.services.promo_codes import normalize_promo_code, preview_promo_discount

router = APIRouter(prefix="/payments", tags=["payments"])


def _merge_order_lines(items: list[OrderLineIn]) -> list[tuple[UUID, UUID | None, int]]:
    merged: dict[tuple[UUID, UUID | None], int] = defaultdict(int)
    for row in items:
        merged[(row.product_id, row.variant_id)] += row.quantity
    return [(pid, vid, q) for (pid, vid), q in merged.items()]


def _parse_meta_items(raw: str) -> list[tuple[UUID, UUID | None, int]]:
    pairs: list = json.loads(raw)
    out: list[tuple[UUID, UUID | None, int]] = []
    for item in pairs:
        if len(item) == 2:
            out.append((UUID(str(item[0])), None, int(item[1])))
        else:
            pid_s, vid_s, q = item[0], item[1], item[2]
            vid = UUID(str(vid_s)) if vid_s else None
            out.append((UUID(str(pid_s)), vid, int(q)))
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
    wrap = str(meta.get("gift_wrap") or "0") == "1"
    raw = meta.get("gift_message")
    if wrap and isinstance(raw, str) and raw.strip():
        return True, raw.strip()[:500]
    return wrap, None


class CheckoutSessionBody(BaseModel):
    items: list[OrderLineIn] = Field(min_length=1)
    gift_wrap: bool = False
    gift_message: str | None = Field(default=None, max_length=500)
    promo_code: str | None = Field(default=None, max_length=64)


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

    lines = _merge_order_lines(body.items)
    try:
        pricing = load_checkout_pricing(db, lines, lock_rows=False)
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

    line_items: list[dict] = []
    merch_after = pricing.subtotal - discount
    if merch_after < 0:
        merch_after = Decimal("0")

    if discount > 0:
        line_items.append(
            {
                "quantity": 1,
                "price_data": {
                    "currency": "usd",
                    "unit_amount": _to_cents(merch_after),
                    "product_data": {
                        "name": (
                            f"Cart — {len(pricing.merged)} line(s), promo discount"
                        )[:120],
                    },
                },
            },
        )
    else:
        for pid, vid, q in sorted(lines, key=lambda x: (str(x[0]), str(x[1] or ""), x[2])):
            p = pricing.products[pid]
            if vid is not None:
                v = pricing.variants[vid]
                display = f"{p.name} — {v.label}"
                unit = v.price
            else:
                display = p.name
                unit = effective_unit_price(p)
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
        [[str(pid), str(vid) if vid else "", q] for pid, vid, q in lines],
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
    }
    if promo_norm:
        meta["promo_code"] = promo_norm[:60]
    if body.gift_wrap and body.gift_message and body.gift_message.strip():
        meta["gift_message"] = body.gift_message.strip()[:450]

    base = settings.public_app_url.rstrip("/")
    stripe.api_key = settings.stripe_secret_key

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=line_items,
            success_url=f"{base}/orders?payment=stripe&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{base}/cart",
            client_reference_id=str(user.id),
            metadata=meta,
        )
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
        return {"status": "ok", "order": order_public(o).model_dump(mode="json")}

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
        fulfill_checkout(
            db,
            user_id,
            lines,
            payment_method="stripe",
            stripe_checkout_session_id=session.id,
            gift_wrap=gift_wrap,
            gift_message=gift_message,
            promo_code=promo_c,
            stripe_promo_discount=promo_disc,
        )
        db.commit()
    except (CheckoutError, IntegrityError, json.JSONDecodeError, ValueError, TypeError):
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