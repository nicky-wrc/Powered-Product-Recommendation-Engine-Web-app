"""Thai-style sales invoice PDF: dual fonts (Latin+digits / Thai), blue header, two-column info."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from fpdf import FPDF

from app.config import settings
from app.models.order import Order
from app.upload_paths import UPLOADS_ROOT

_ASSETS_FONTS = Path(__file__).resolve().parent.parent / "assets" / "fonts"
_NOTO_LATIN = _ASSETS_FONTS / "NotoSans-Regular.ttf"
_NOTO_THAI = _ASSETS_FONTS / "NotoSansThai-Regular.ttf"

_BLUE = (37, 99, 235)
_PURPLE = (124, 58, 237)
_TEAL = (15, 118, 110)


def _resolve_latin_font() -> Path:
    if _NOTO_LATIN.is_file():
        return _NOTO_LATIN
    if sys.platform == "win32":
        windir = Path(os.environ.get("WINDIR", r"C:\Windows"))
        for name in ("arial.ttf", "Arial.ttf", "calibri.ttf", "Calibri.ttf", "segoeui.ttf"):
            cand = windir / "Fonts" / name
            if cand.is_file():
                return cand
    for p in (
        Path("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ):
        if p.is_file():
            return p
    raise RuntimeError(
        "Add NotoSans-Regular.ttf to backend/app/assets/fonts/ (needed for amounts & table headers).",
    )


def _resolve_thai_font() -> Path:
    if _NOTO_THAI.is_file():
        return _NOTO_THAI
    if sys.platform == "win32":
        windir = Path(os.environ.get("WINDIR", r"C:\Windows"))
        for name in ("Tahoma.ttf", "tahoma.ttf"):
            cand = windir / "Fonts" / name
            if cand.is_file():
                return cand
    for p in (
        Path("/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ):
        if p.is_file():
            return p
    return _resolve_latin_font()


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


def _fmt_money_usd(n: float) -> str:
    return f"${n:,.2f}"


def _fmt_dt(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%d/%m/%Y %H:%M UTC")


class _Doc(FPDF):
    def __init__(self, latin: Path, thai: Path) -> None:
        super().__init__(unit="mm", format="A4")
        self.add_font("Lat", "", str(latin))
        self.add_font("Thai", "", str(thai))

    def lat(self, pts: int) -> None:
        self.set_font("Lat", "", pts)

    def thai(self, pts: int) -> None:
        self.set_font("Thai", "", pts)


def build_order_invoice_pdf(order: Order, *, customer_email: str | None = None) -> bytes:
    latin = _resolve_latin_font()
    thai = _resolve_thai_font()
    pdf = _Doc(latin, thai)

    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_margins(14, 14, 14)
    pdf.add_page()

    lm = 14.0
    W = 210.0
    cw = W - 2 * lm

    # --- Blue banner + logo -------------------------------------------------
    banner_bottom = 40.0
    pdf.set_fill_color(*_BLUE)
    pdf.rect(0, 0, W, banner_bottom, style="F")

    title_x = lm
    logo_path = _invoice_logo_path()
    if logo_path:
        try:
            pdf.image(str(logo_path), x=lm, y=6, h=20)
            title_x = lm + 30
        except Exception:
            pass

    brand = (settings.store_invoice_name or "Store").strip() or "Store"
    pdf.set_xy(title_x, 8)
    pdf.set_text_color(255, 255, 255)
    pdf.thai(16)
    pdf.cell(0, 7, "ใบวางบิล (Invoice)", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(title_x)
    pdf.lat(11)
    pdf.cell(0, 6, brand, new_x="LMARGIN", new_y="NEXT")

    pdf.set_xy(lm, banner_bottom + 8)
    pdf.set_text_color(40, 40, 45)

    # --- Title row ----------------------------------------------------------
    pdf.lat(11)
    pdf.cell(cw * 0.55, 6, "ใบวางบิล", align="L")
    pdf.set_text_color(130, 130, 138)
    pdf.cell(cw * 0.45, 6, "ต้นฉบับ / Original", align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(40, 40, 45)
    pdf.ln(2)

    y_split = pdf.get_y()
    w_left = cw * 0.48
    w_right = cw * 0.48
    gap = cw * 0.04
    h_box = 34.0

    # Left: document details
    pdf.set_xy(lm, y_split)
    pdf.set_fill_color(*_PURPLE)
    pdf.set_text_color(255, 255, 255)
    pdf.lat(8)
    pdf.cell(w_left, 6, " รายละเอียดเอกสาร", fill=True, new_x="LMARGIN", new_y="NEXT")
    y_in = pdf.get_y()
    pdf.set_draw_color(200, 205, 215)
    pdf.set_fill_color(252, 252, 254)
    pdf.rect(lm, y_in, w_left, h_box, style="DF")
    pdf.set_xy(lm + 2, y_in + 2)
    pdf.set_text_color(55, 55, 62)
    rows_left = [
        ("เลขที่ / No.", str(order.id)[:36] + ("…" if len(str(order.id)) > 36 else "")),
        ("วันที่ / Date", _fmt_dt(order.created_at)),
        ("สถานะ / Status", order.status),
        ("ชำระ / Payment", order.payment_method or "—"),
    ]
    for lab, val in rows_left:
        pdf.lat(8)
        pdf.cell(w_left * 0.38, 5, lab)
        pdf.lat(8)
        pdf.cell(w_left * 0.58, 5, val, new_x="LMARGIN", new_y="NEXT")
        pdf.set_x(lm + 2)

    # Right: customer
    xr = lm + w_left + gap
    pdf.set_xy(xr, y_split)
    pdf.set_fill_color(*_TEAL)
    pdf.set_text_color(255, 255, 255)
    pdf.thai(8)
    pdf.cell(w_right, 6, " ลูกค้า / Customer", fill=True, new_x="LMARGIN", new_y="NEXT")
    y_ir = pdf.get_y()
    pdf.set_draw_color(200, 205, 215)
    pdf.set_fill_color(252, 252, 254)
    pdf.rect(xr, y_ir, w_right, h_box, style="DF")
    pdf.set_xy(xr + 2, y_ir + 2)
    pdf.set_text_color(55, 55, 62)
    pdf.lat(8)
    em = (customer_email or "").strip() or "—"
    pdf.cell(0, 5, "อีเมล / Email", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(xr + 2)
    pdf.lat(9)
    pdf.multi_cell(w_right - 4, 5, em)

    y_next = max(y_in + h_box, y_ir + h_box, pdf.get_y()) + 4
    pdf.set_xy(lm, y_next)

    # Seller note strip
    addr = (settings.store_invoice_address or "").strip()
    phone = (settings.store_phone or "").strip()
    tid = (settings.store_tax_id or "").strip()
    lines: list[str] = []
    if tid:
        lines.append(f"เลขประจำตัวผู้เสียภาษี / Tax ID: {tid}")
    if addr:
        lines.extend([ln.strip() for ln in addr.splitlines() if ln.strip()])
    if phone:
        lines.append(f"โทร. / Tel. {phone}")
    if lines:
        h_strip = 4 + len(lines) * 5
        pdf.set_fill_color(245, 247, 250)
        pdf.set_draw_color(215, 220, 230)
        pdf.rect(lm, pdf.get_y(), cw, h_strip, style="FD")
        yy = pdf.get_y() + 2
        pdf.set_xy(lm + 2, yy)
        pdf.set_text_color(75, 78, 90)
        pdf.lat(8)
        for ln in lines:
            pdf.cell(0, 5, ln, new_x="LMARGIN", new_y="NEXT")
            pdf.set_x(lm + 2)
        pdf.set_xy(lm, yy + h_strip + 4)
    else:
        pdf.ln(2)

    # --- Table --------------------------------------------------------------
    pdf.set_text_color(40, 42, 55)
    pdf.thai(9)
    pdf.cell(0, 6, "รายการสินค้า / Line items", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    c_desc = cw * 0.46
    c_qty = cw * 0.11
    c_unit = cw * 0.215
    c_amt = cw * 0.215
    row_head = 8.0

    pdf.set_fill_color(236, 242, 255)
    pdf.set_draw_color(170, 185, 210)
    pdf.lat(8)
    pdf.cell(c_desc, row_head, " รายการ", border=1, fill=True)
    pdf.cell(c_qty, row_head, "จำนวน", border=1, fill=True, align="C")
    pdf.cell(c_unit, row_head, "ราคา/หน่วย", border=1, fill=True, align="R")
    pdf.cell(c_amt, row_head, "จำนวนเงิน", border=1, fill=True, align="R", new_x="LMARGIN", new_y="NEXT")

    sub = 0.0
    lh = 6
    for it in order.items:
        amt = float(it.unit_price) * it.quantity
        sub += amt
        name = (it.product_name or "").strip()
        if it.variant_label and str(it.variant_label).strip():
            name = f"{name} ({it.variant_label.strip()})"

        x0 = pdf.get_x()
        y0 = pdf.get_y()
        pdf.set_fill_color(255, 255, 255)
        pdf.thai(8)
        pdf.multi_cell(c_desc, lh, " " + name, border=1, fill=True)
        y1 = pdf.get_y()
        rh = max(row_head, y1 - y0)

        pdf.set_xy(x0 + c_desc, y0)
        pdf.lat(8)
        pdf.set_fill_color(255, 255, 255)
        pdf.cell(c_qty, rh, str(it.quantity), border=1, align="C", fill=True)
        pdf.cell(c_unit, rh, _fmt_money_usd(float(it.unit_price)), border=1, align="R", fill=True)
        pdf.cell(c_amt, rh, _fmt_money_usd(amt), border=1, align="R", fill=True, new_x="LMARGIN", new_y="NEXT")

    pdf.ln(4)

    # Totals (Latin digits)
    bx = lm + c_desc
    wlab = c_qty + c_unit
    wamt = c_amt
    pdf.set_draw_color(200, 205, 215)
    pdf.lat(9)

    def adj(label: str, val: str) -> None:
        pdf.set_x(bx)
        pdf.set_text_color(70, 72, 82)
        pdf.cell(wlab, 6, label, align="R")
        pdf.set_text_color(25, 28, 38)
        pdf.cell(wamt, 6, val, align="R", new_x="LMARGIN", new_y="NEXT")

    adj("รวมสินค้า / Subtotal", _fmt_money_usd(sub))
    if order.promo_code and (order.promo_discount or 0) > 0:
        adj(f"ส่วนลด ({order.promo_code})", f"- {_fmt_money_usd(float(order.promo_discount or 0))}")
    if (order.loyalty_discount or 0) > 0 and (order.loyalty_points_redeemed or 0) > 0:
        adj(
            f"แลกแต้ม ({order.loyalty_points_redeemed})",
            f"- {_fmt_money_usd(float(order.loyalty_discount or 0))}",
        )
    if order.gift_card_code and (order.gift_card_discount or 0) > 0:
        adj(
            f"Gift card ({order.gift_card_code})",
            f"- {_fmt_money_usd(float(order.gift_card_discount or 0))}",
        )
    if order.gift_wrap:
        adj("ห่อของขวัญ", "(รวมในยอดรวม)")

    pdf.ln(2)
    pdf.set_fill_color(*_BLUE)
    pdf.set_text_color(255, 255, 255)
    pdf.set_x(bx)
    pdf.lat(10)
    pdf.cell(wlab, 9, "รวมทั้งสิ้น / Grand total (USD)", fill=True, align="R")
    pdf.lat(10)
    pdf.cell(wamt, 9, _fmt_money_usd(float(order.total_amount)), fill=True, align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(6)
    pdf.set_text_color(105, 108, 118)
    pdf.lat(7)
    pdf.multi_cell(
        0,
        4,
        "หมายเหตุ: เอกสารนี้เป็นหลักฐานการสั่งซื้อ / Purchase record. ยอดเงินเป็นสกุล USD / Amounts in US dollars.",
    )
    pdf.ln(3)
    pdf.set_text_color(95, 98, 108)
    pdf.lat(8)
    pdf.cell(cw * 0.46, 5, "_____________________________", align="C")
    pdf.cell(cw * 0.08, 5, "")
    pdf.cell(cw * 0.46, 5, "_____________________________", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.lat(7)
    pdf.cell(cw * 0.46, 5, "ผู้รับสินค้า / Receiver", align="C")
    pdf.cell(cw * 0.08, 5, "")
    pdf.cell(cw * 0.46, 5, "ผู้ส่ง / Seller", align="C", new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
