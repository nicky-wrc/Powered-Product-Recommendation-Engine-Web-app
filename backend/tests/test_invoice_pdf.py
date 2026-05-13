"""Invoice PDF builder smoke tests (no DB)."""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from app.models.order import Order, OrderItem
from app.services.invoice_pdf import build_order_invoice_pdf


def test_invoice_pdf_bytes_smoke():
    oid = uuid4()
    uid = uuid4()
    pid = uuid4()
    o = Order(
        id=oid,
        user_id=uid,
        status="processing",
        total_amount=Decimal("19.99"),
        payment_method="direct",
        gift_wrap=False,
        gift_message=None,
        created_at=datetime.now(timezone.utc),
    )
    o.items = [
        OrderItem(
            order_id=oid,
            product_id=pid,
            product_name="รองเท้า Off White V2",
            quantity=2,
            unit_price=Decimal("2000.00"),
        ),
    ]
    b = build_order_invoice_pdf(o, customer_email="buyer@example.com")
    assert b.startswith(b"%PDF-")
    assert len(b) > 500
