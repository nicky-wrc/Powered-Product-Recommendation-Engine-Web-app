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
from app.models.product import Product
from app.models.user import User
from app.schemas.orders import OrderLineIn, order_public
from app.services.checkout_fulfillment import CheckoutError, fulfill_checkout

router = APIRouter(prefix="/payments", tags=["payments"])


class CheckoutSessionBody(BaseModel):
    items: list[OrderLineIn] = Field(min_length=1)


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

    qty_map: dict[UUID, int] = defaultdict(int)
    for row in body.items:
        qty_map[row.product_id] += row.quantity

    pid_list = sorted(qty_map.keys(), key=lambda x: str(x))
    products: dict[UUID, Product] = {}
    for pid in pid_list:
        p = db.scalar(select(Product).where(Product.id == pid))
        if p is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
        products[pid] = p

    for pid, q in qty_map.items():
        if products[pid].stock < q:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Insufficient stock for {products[pid].name}",
            )

    line_items: list[dict] = []
    for pid in pid_list:
        p = products[pid]
        q = qty_map[pid]
        line_items.append(
            {
                "quantity": q,
                "price_data": {
                    "currency": "usd",
                    "unit_amount": _to_cents(p.price),
                    "product_data": {"name": p.name},
                },
            },
        )

    compact_items = json.dumps([[str(pid), qty_map[pid]] for pid in pid_list], separators=(",", ":"))
    if len(compact_items) > 450:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cart is too large for a single Stripe session; place a smaller order.",
        )

    base = settings.public_app_url.rstrip("/")
    stripe.api_key = settings.stripe_secret_key

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=line_items,
            success_url=f"{base}/orders?payment=stripe&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{base}/cart",
            client_reference_id=str(user.id),
            metadata={
                "user_id": str(user.id),
                "items": compact_items,
            },
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
        pairs: list[list] = json.loads(raw_items)
        qty_map = {UUID(str(p)): int(q) for p, q in pairs}
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid cart metadata.") from e

    try:
        order = fulfill_checkout(
            db,
            user.id,
            qty_map,
            payment_method="stripe",
            stripe_checkout_session_id=session.id,
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
        pairs: list[list] = json.loads(raw_items)
        qty_map = {UUID(str(p)): int(q) for p, q in pairs}
        fulfill_checkout(
            db,
            user_id,
            qty_map,
            payment_method="stripe",
            stripe_checkout_session_id=session.id,
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