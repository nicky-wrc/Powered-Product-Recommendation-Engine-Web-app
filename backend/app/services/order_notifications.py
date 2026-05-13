"""Optional order confirmation email (SMTP). Falls back to structured logging when SMTP is not configured."""

from __future__ import annotations

import logging
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.models.order import Order

log = logging.getLogger(__name__)


def _build_plain_body(order: Order) -> tuple[str, str]:
    public = (settings.public_app_url or "http://localhost:3000").rstrip("/")
    lines = [
        "สวัสดีค่ะ/ครับ",
        "",
        f"ขอบคุณที่สั่งซื้อ — ออเดอร์ #{order.id}",
        f"ยอดรวม: ${float(order.total_amount):.2f}",
        f"สถานะ: {order.status}",
        "",
        "รายการสินค้า:",
    ]
    for it in order.items:
        lines.append(f"  - {it.product_name} x{it.quantity} @ ${float(it.unit_price):.2f}")
    lines.extend(["", f"ดูประวัติ: {public}/orders", "", "— Recommendation Engine Store"])
    subject = f"[Order {str(order.id)[:8]}] ยืนยันคำสั่งซื้อ ${float(order.total_amount):.2f}"
    return subject, "\n".join(lines)


def try_send_order_confirmation(db: Session, order_id: UUID) -> None:
    """At-most-once: row lock, send if SMTP configured else log; skip if already sent."""
    try:
        o = db.scalar(
            select(Order)
            .where(Order.id == order_id)
            .with_for_update()
            .options(selectinload(Order.items), selectinload(Order.user)),
        )
        if o is None:
            db.rollback()
            return
        if o.confirmation_email_sent_at is not None:
            db.commit()
            return

        user = o.user
        if user is None or not (user.email or "").strip():
            log.info("order confirmation skipped: no email for order %s", order_id)
            o.confirmation_email_sent_at = datetime.now(timezone.utc)
            db.commit()
            return

        to_addr = user.email.strip()
        subject, body = _build_plain_body(o)
        mail_from = (settings.order_email_from or settings.smtp_user or "").strip()
        host = (settings.smtp_host or "").strip()

        if not host or not mail_from:
            log.info(
                "order confirmation (no SMTP): to=%s subject=%s\n%s",
                to_addr,
                subject,
                body,
            )
            o.confirmation_email_sent_at = datetime.now(timezone.utc)
            db.commit()
            return

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = mail_from
        msg["To"] = to_addr
        msg.set_content(body)

        if settings.smtp_use_tls:
            with smtplib.SMTP(host, settings.smtp_port, timeout=30) as server:
                server.starttls()
                user_s = (settings.smtp_user or "").strip()
                pwd = (settings.smtp_password or "").strip()
                if user_s and pwd:
                    server.login(user_s, pwd)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, settings.smtp_port, timeout=30) as server:
                user_s = (settings.smtp_user or "").strip()
                pwd = (settings.smtp_password or "").strip()
                if user_s and pwd:
                    server.login(user_s, pwd)
                server.send_message(msg)
        log.info("order confirmation sent to %s for order %s", to_addr, order_id)
        o.confirmation_email_sent_at = datetime.now(timezone.utc)
        db.commit()
    except OSError as e:
        db.rollback()
        log.exception("order confirmation SMTP failed for order %s: %s", order_id, e)
