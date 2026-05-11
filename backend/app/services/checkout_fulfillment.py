"""Shared checkout completion: stock, order rows, interactions, cart clear."""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.cart_item import CartItem
from app.models.interaction import Interaction
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.services.interaction_weights import interaction_weight


class CheckoutError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


def fulfill_checkout(
    db: Session,
    user_id: UUID,
    qty_map: dict[UUID, int],
    *,
    payment_method: str,
    stripe_checkout_session_id: str | None = None,
) -> Order:
    """
    Build a completed order, decrement stock, record purchase interactions, clear server cart.
    Does not commit. Idempotent when stripe_checkout_session_id matches an existing order.
    """
    if stripe_checkout_session_id:
        existing = db.scalar(
            select(Order).where(Order.stripe_checkout_session_id == stripe_checkout_session_id),
        )
        if existing is not None:
            return existing

    pid_list = sorted(qty_map.keys(), key=lambda x: str(x))
    products: dict[UUID, Product] = {}

    for pid in pid_list:
        p = db.scalar(select(Product).where(Product.id == pid).with_for_update())
        if p is None:
            raise CheckoutError(404, "Product not found")
        products[pid] = p

    for pid, q in qty_map.items():
        if products[pid].stock < q:
            raise CheckoutError(409, f"Insufficient stock for {products[pid].name}")

    total = Decimal("0")
    for pid, q in qty_map.items():
        total += products[pid].price * q

    order = Order(
        user_id=user_id,
        status="completed",
        total_amount=total,
        payment_method=payment_method,
        stripe_checkout_session_id=stripe_checkout_session_id,
    )
    db.add(order)
    db.flush()

    for pid, q in qty_map.items():
        p = products[pid]
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=pid,
                product_name=p.name,
                quantity=q,
                unit_price=p.price,
            ),
        )
        p.stock -= q
        w = interaction_weight("purchase", {"quantity": q})
        db.add(
            Interaction(
                user_id=user_id,
                product_id=pid,
                event_type="purchase",
                weight=w,
                event_metadata={"quantity": q, "source": "order", "order_id": str(order.id)},
            ),
        )

    db.execute(delete(CartItem).where(CartItem.user_id == user_id))
    return order
