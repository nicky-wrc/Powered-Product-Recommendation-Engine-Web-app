"""Branded order invoice PDF (Unicode product names, headers, optional logo)."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from fpdf import FPDF

from app.config import settings
from app.models.order import Order
from app.upload_paths import UPLOADS_ROOT

# Bundled Noto Sans Thai (glyphs for Thai + Latin; SIL OFL). Falls back to OS fonts if missing.
_ASSETS_FONTS = Path(__file__).resolve().parent.parent / "assets" / "fonts"
_BUNDLED_THAI = _ASSETS_FONTS / "NotoSansThai-Regular.ttf"


def _resolve_font_path() -> Path:
    if _BUNDLED_THAI.is_file():
        return _BUNDLED_THAI
    if sys.platform == "win32":
        windir = Path(os.environ.get("WINDIR", r"C:\Windows"))
        for name in ("Tahoma.ttf", "tahoma.ttf", "arial.ttf", "Arial.ttf", "segoeui.ttf"):
            cand = windir / "Fonts" / name
            if cand.is_file():
                return cand
    for linux in (
        Path("/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ):
        if linux.is_file():
            return linux
    raise RuntimeError(
        "No suitable font for invoice PDF. Add NotoSansThai-Regular.ttf to backend/app/assets/fonts/ "
        "or install a system Thai-capable font.",
    )


def _invoice_logo_path() -> Path | None:
    raw = (settings.invoice_logo_path or "").strip()
    if raw:
        p = Path(raw)
        if p.is_file():
            return p
    logo_dir = UPLOADS_ROOT / "logo"
    if logo_dir.is_dir():
        for ext in ("*.png", "*.jpg", "*.jpeg", "*.jfif", "*.webp"):
            found = sorted(logo_dir.glob(ext))
            if found:
                return found[0]
    return None


def _fmt_money(n: float) -> str:
    return f"${n:,.2f}"


def _fmt_when(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%d %b %Y · %H:%M UTC")


def build_order_invoice_pdf(order: Order, *, customer_email: str | None = None) -> bytes:
    font_path = _resolve_font_path()
    brand = (settings.store_invoice_name or "Store").strip() or "Store"

    pdf = FPDF(unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_margins(18, 18, 18)
    pdf.add_page()
    pdf.add_font("InvBody", "", str(font_path))

    # --- Header band
    pdf.set_fill_color(15, 118, 110)
    pdf.rect(0, 0, 210, 46, style="F")

    logo_file = _invoice_logo_path()
    if logo_file is not None:
        try:
            pdf.image(str(logo_file), x=18, y=8, h=18)
        except Exception:
            logo_file = None

    title_x = 50 if logo_file else 18
    pdf.set_xy(title_x, 10)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("InvBody", "", 20)
    pdf.cell(0, 10, brand, new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(title_x)
    pdf.set_font("InvBody", "", 12)
    pdf.cell(0, 7, "Sales invoice · ใบเสร็จ / ใบกำกับย่อ", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(55, 55, 55)
    pdf.set_y(52)

    # --- Meta grid
    pdf.set_font("InvBody", "", 10)
    left_x = pdf.get_x()
    y0 = pdf.get_y()
    pdf.set_fill_color(245, 245, 244)
    pdf.set_draw_color(220, 220, 218)
    pdf.rect(left_x, y0, 174, 34, style="DF")

    pdf.set_xy(left_x + 4, y0 + 5)
    pdf.set_font("InvBody", "", 9)
    pdf.set_text_color(15, 118, 110)
    pdf.cell(82, 5, "Invoice # / Order ID")
    pdf.set_font("InvBody", "", 9)
    pdf.set_text_color(40, 40, 40)
    pdf.set_xy(left_x + 4, y0 + 11)
    short_id = str(order.id)
    pdf.cell(82, 5, short_id)

    pdf.set_xy(left_x + 90, y0 + 5)
    pdf.set_font("InvBody", "", 9)
    pdf.set_text_color(15, 118, 110)
    pdf.cell(80, 5, "Date issued")
    pdf.set_font("InvBody", "", 9)
    pdf.set_text_color(40, 40, 40)
    pdf.set_xy(left_x + 90, y0 + 11)
    pdf.cell(80, 5, _fmt_when(order.created_at))

    pdf.set_xy(left_x + 4, y0 + 20)
    pdf.set_font("InvBody", "", 9)
    pdf.set_text_color(15, 118, 110)
    pdf.cell(82, 5, "Bill to")
    pdf.set_font("InvBody", "", 9)
    pdf.set_text_color(40, 40, 40)
    pdf.set_xy(left_x + 4, y0 + 26)
    bill = (customer_email or "").strip() or "—"
    pdf.cell(82, 5, bill[:60])

    pdf.set_xy(left_x + 90, y0 + 20)
    pdf.set_font("InvBody", "", 9)
    pdf.set_text_color(15, 118, 110)
    pdf.cell(80, 5, "Status · Payment")
    pdf.set_font("InvBody", "", 9)
    pdf.set_text_color(40, 40, 40)
    pdf.set_xy(left_x + 90, y0 + 26)
    pm = order.payment_method or "—"
    pdf.cell(80, 5, f"{order.status} · {pm}")

    pdf.set_y(y0 + 40)
    pdf.ln(4)

    # --- Line items table
    pdf.set_font("InvBody", "", 10)
    pdf.set_fill_color(232, 245, 244)
    pdf.set_draw_color(190, 210, 208)
    pdf.set_text_color(30, 30, 30)
    col_desc, col_qty, col_unit, col_line = 92, 18, 32, 32
    row_h = 8
    pdf.cell(col_desc, row_h, " Item / description", border=1, fill=True)
    pdf.cell(col_qty, row_h, "Qty", border=1, fill=True, align="C")
    pdf.cell(col_unit, row_h, "Unit price", border=1, fill=True, align="R")
    pdf.cell(col_line, row_h, "Amount", border=1, fill=True, align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("InvBody", "", 9)
    pdf.set_fill_color(255, 255, 255)
    sub = 0.0
    for it in order.items:
        line = float(it.unit_price) * it.quantity
        sub += line
        name = (it.product_name or "").strip()
        if it.variant_label and str(it.variant_label).strip():
            name = f"{name} · {it.variant_label.strip()}"
        desc_h = 7
        x = pdf.get_x()
        y = pdf.get_y()
        pdf.multi_cell(col_desc, desc_h, " " + name, border=1, fill=True)
        y2 = pdf.get_y()
        row_h_draw = max(row_h, y2 - y)
        pdf.set_xy(x + col_desc, y)
        pdf.cell(col_qty, row_h_draw, str(it.quantity), border=1, align="C", fill=True)
        pdf.cell(col_unit, row_h_draw, _fmt_money(float(it.unit_price)), border=1, align="R", fill=True)
        pdf.cell(col_line, row_h_draw, _fmt_money(line), border=1, align="R", fill=True, new_x="LMARGIN", new_y="NEXT")

    pdf.ln(3)
    pdf.set_draw_color(220, 220, 218)
    pdf.set_font("InvBody", "", 10)
    pdf.set_text_color(55, 55, 55)

    def _sum_row(label: str, amount: float, *, negative: bool = False) -> None:
        pdf.set_x(left_x + col_desc)
        pdf.cell(col_qty + col_unit, 7, label, border=0, align="R")
        val = -amount if negative else amount
        pdf.cell(col_line, 7, _fmt_money(val), border=0, align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.set_x(left_x)
    _sum_row("Merchandise subtotal", sub)
    if order.promo_code and (order.promo_discount or 0) > 0:
        _sum_row(f"Promo ({order.promo_code})", float(order.promo_discount or 0), negative=True)
    if (order.loyalty_discount or 0) > 0 and (order.loyalty_points_redeemed or 0) > 0:
        _sum_row(f"Loyalty ({order.loyalty_points_redeemed} pts)", float(order.loyalty_discount or 0), negative=True)
    if order.gift_card_code and (order.gift_card_discount or 0) > 0:
        _sum_row(f"Gift card ({order.gift_card_code})", float(order.gift_card_discount or 0), negative=True)
    if order.gift_wrap:
        pdf.set_x(left_x + col_desc)
        pdf.cell(col_qty + col_unit, 7, "Gift wrapping", border=0, align="R")
        pdf.cell(col_line, 7, "(in total)", border=0, align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(2)
    pdf.set_fill_color(15, 118, 110)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("InvBody", "", 12)
    pdf.set_x(left_x)
    pdf.cell(col_desc + col_qty + col_unit, 10, " Amount due (USD)", border=0, fill=True)
    pdf.cell(col_line, 10, _fmt_money(float(order.total_amount)), border=0, align="R", fill=True, new_x="LMARGIN", new_y="NEXT")

    pdf.ln(8)
    pdf.set_text_color(120, 120, 118)
    pdf.set_font("InvBody", "", 8)
    pdf.multi_cell(
        0,
        4,
        "Thank you for your purchase. This document is a sales receipt for your records. "
        "For support, contact us through your storefront account.",
    )
    return bytes(pdf.output())
