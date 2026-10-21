"""Invoice and credit note PDFs (3E, P1-9), rendered from the stored
document: its frozen lines and the bill-to snapshot taken at issue, never the
contact as it is today. Same Unicode setup as payslips (app/payslip_pdf.py):
Noto Sans with Noto Naskh Arabic as the fallback, so Urdu names, '₨' and
dashes print instead of crashing a Latin-1 font."""
from __future__ import annotations

from typing import Any

from fpdf.enums import XPos, YPos

from .invoice_models import InvoiceDetail
from .payslip_pdf import _money, _new_pdf, in_words

_TITLE = {"invoice": "Tax invoice", "credit_note": "Credit note"}
_METHOD = {"cash": "Cash", "bank": "Bank transfer", "cheque": "Cheque", "card": "Card", "jazzcash": "JazzCash",
           "easypaisa": "Easypaisa", "raast": "Raast", "wht_adjustment": "WHT adjustment"}


def build_invoice_pdf(inv: InvoiceDetail, seller: dict[str, Any]) -> bytes:
    pdf = _new_pdf()
    w = pdf.epw

    if seller.get("header"):
        pdf.set_font("NotoSans", "", 8)
        pdf.multi_cell(w, 4, seller["header"], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "B", 15)
    pdf.multi_cell(w, 8, seller.get("name") or "", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "", 9)
    ids = "   ".join(x for x in (f"NTN {seller['ntn']}" if seller.get("ntn") else "",
                                 f"STRN {seller['strn']}" if seller.get("strn") else "") if x)
    for text in (seller.get("address"), seller.get("phone"), ids):
        if text:
            pdf.multi_cell(w, 5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(3)
    pdf.set_font("NotoSans", "B", 13)
    pdf.cell(w, 8, _TITLE.get(inv.kind, "Invoice"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "", 9)
    ref = inv.number or (f"Ref {inv.legacy_ref}" if inv.legacy_ref else "")
    dates = [ref, f"Issued {inv.issue_date:%d %b %Y}" if inv.issue_date else "",
             f"Due {inv.due_date:%d %b %Y}" if inv.due_date and inv.kind == "invoice" else ""]
    pdf.cell(w, 5, " · ".join(d for d in dates if d), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    if inv.status == "void":
        pdf.set_font("NotoSans", "B", 11)
        pdf.cell(w, 7, f"VOID — {inv.reason}" if inv.reason else "VOID", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(3)
    bill = inv.bill_to or {"name": inv.contact_name or ""}
    pdf.set_font("NotoSans", "B", 10)
    pdf.cell(w, 6, "Bill to", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "", 10)
    for text in (bill.get("name"), bill.get("address"),
                 "   ".join(x for x in (f"NTN {bill['ntn']}" if bill.get("ntn") else "",
                                        f"STRN {bill['strn']}" if bill.get("strn") else "") if x)):
        if text:
            pdf.multi_cell(w, 5.5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(4)
    cols = (("Item", w * 0.40, "L"), ("Qty", w * 0.10, "R"), ("Price", w * 0.15, "R"),
            ("Tax", w * 0.15, "R"), ("Amount", w * 0.20, "R"))
    pdf.set_font("NotoSans", "B", 9)
    for head, width, align in cols:
        pdf.cell(width, 7, head, align=align)
    pdf.ln(7)
    pdf.set_font("NotoSans", "", 9)
    for line in inv.lines:
        qty = f"{line.qty:g}"
        tax = f"{line.tax_rate_pct:g}% {_money(line.tax_minor)}" if line.tax_minor else "—"
        y = pdf.get_y()
        pdf.multi_cell(cols[0][1], 5.5, line.description, new_x=XPos.RIGHT, new_y=YPos.TOP)
        bottom = pdf.get_y() + 5.5
        pdf.set_xy(pdf.l_margin + cols[0][1], y)
        for (_, width, align), text in zip(cols[1:], (qty, _money(line.unit_price_minor), tax,
                                                      _money(line.total_minor))):
            pdf.cell(width, 5.5, text, align=align)
        pdf.set_y(max(bottom, pdf.get_y() + 5.5))

    pdf.ln(2)

    def total(label: str, minor: int, bold: bool = False) -> None:
        pdf.set_font("NotoSans", "B" if bold else "", 10 if bold else 9)
        pdf.cell(w * 0.80, 6, label, align="R")
        pdf.cell(w * 0.20, 6, _money(minor), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    total("Subtotal", inv.subtotal_minor)
    if inv.line_discount_minor or inv.discount_minor:
        total("Discount", -(inv.line_discount_minor + inv.discount_minor))
    total("Sales tax", inv.tax_minor)
    total("Total", inv.total_minor, bold=True)
    for p in inv.payments:
        total(f"Paid {p.paid_on:%d %b} · {_METHOD.get(p.method, p.method)}", -p.amount_minor)
    for cn in inv.credit_notes:
        total(f"Credit note {cn.number or ''}", -cn.total_minor)
    if inv.kind == "invoice" and inv.status != "void":
        total("Balance due", inv.balance_minor, bold=True)

    pdf.ln(2)
    pdf.set_font("NotoSans", "", 8)
    pdf.multi_cell(w, 4.5, in_words(inv.total_minor), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    if inv.unverified_rates:
        pdf.multi_cell(w, 4.5, "Tax rates pending verification against the current Gazette; figures may change.",
                       new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    if inv.notes:
        pdf.ln(2)
        pdf.multi_cell(w, 4.5, inv.notes, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    if seller.get("footer"):
        pdf.ln(2)
        pdf.multi_cell(w, 4.5, seller["footer"], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    return bytes(pdf.output())
