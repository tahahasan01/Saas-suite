"""Quote PDFs (wave D): the frozen quote as the customer saw it, from the
same Unicode PDF setup as invoices and payslips. An accepted quote also
prints who accepted it, when, and the start of the content hash they saw,
so a printout can be matched to the record."""
from __future__ import annotations

import io
from collections.abc import Mapping
from typing import Any

from fpdf.enums import XPos, YPos

from .crm_selling_models import QuoteTotals
from .payslip_pdf import _money, _new_pdf, in_words


def acceptance_line(q: Mapping[str, Any]) -> str | None:
    """'Accepted by <name> on <date> · ref <hash>', or None when not accepted."""
    if not q.get("accepted_name") or not q.get("accepted_at"):
        return None
    return (f"Accepted by {q['accepted_name']} on {q['accepted_at']:%d %b %Y %H:%M} UTC"
            f" · ref {str(q.get('content_hash') or '')[:12]}")


def build_quote_pdf(q: QuoteTotals, seller: dict[str, Any], signature: bytes | None = None) -> bytes:
    pdf = _new_pdf()
    w = pdf.epw

    if seller.get("header"):
        pdf.set_font("NotoSans", "", 8)
        pdf.multi_cell(w, 4, seller["header"], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "B", 15)
    pdf.multi_cell(w, 8, seller.get("name") or "", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "", 9)
    for text in (seller.get("address"), seller.get("phone"), f"NTN {seller['ntn']}" if seller.get("ntn") else ""):
        if text:
            pdf.multi_cell(w, 5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(3)
    pdf.set_font("NotoSans", "B", 13)
    pdf.cell(w, 8, "Quotation", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "", 9)
    pdf.cell(w, 5, f"{q.number} · Valid until {q.valid_until:%d %b %Y}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)
    pdf.set_font("NotoSans", "B", 10)
    pdf.cell(w, 6, "For", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "", 10)
    pdf.multi_cell(w, 5.5, q.customer_name, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(4)
    cols = (("Item", w * 0.40, "L"), ("Qty", w * 0.10, "R"), ("Price", w * 0.15, "R"),
            ("Tax", w * 0.15, "R"), ("Amount", w * 0.20, "R"))
    pdf.set_font("NotoSans", "B", 9)
    for head, width, align in cols:
        pdf.cell(width, 7, head, align=align)
    pdf.ln(7)
    pdf.set_font("NotoSans", "", 9)
    for line in q.lines:
        tax = f"{line.tax_rate_pct:g}% {_money(line.tax_minor)}" if line.tax_minor else "—"
        y = pdf.get_y()
        pdf.multi_cell(cols[0][1], 5.5, line.description, new_x=XPos.RIGHT, new_y=YPos.TOP)
        bottom = pdf.get_y() + 5.5
        pdf.set_xy(pdf.l_margin + cols[0][1], y)
        for (_, width, align), text in zip(cols[1:], (f"{line.qty:g} {line.unit}".strip(),
                                                      _money(line.unit_price_minor), tax, _money(line.total_minor))):
            pdf.cell(width, 5.5, text, align=align)
        pdf.set_y(max(bottom, pdf.get_y() + 5.5))

    pdf.ln(2)

    def total(label: str, minor: int, bold: bool = False) -> None:
        pdf.set_font("NotoSans", "B" if bold else "", 10 if bold else 9)
        pdf.cell(w * 0.80, 6, label, align="R")
        pdf.cell(w * 0.20, 6, _money(minor), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    total("Before tax", q.net_minor)
    total("Sales tax", q.tax_minor)
    total("Total", q.total_minor, bold=True)

    pdf.ln(2)
    pdf.set_font("NotoSans", "", 8)
    pdf.multi_cell(w, 4.5, in_words(q.total_minor), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    if q.terms:
        pdf.ln(2)
        pdf.set_font("NotoSans", "B", 9)
        pdf.cell(w, 5, "Terms", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_font("NotoSans", "", 9)
        pdf.multi_cell(w, 4.5, q.terms, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    accepted = acceptance_line(q.model_dump())
    if accepted:
        pdf.ln(3)
        pdf.set_font("NotoSans", "B", 9)
        pdf.multi_cell(w, 5, accepted, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        if signature:
            pdf.image(io.BytesIO(signature), w=60)
    if seller.get("footer"):
        pdf.ln(2)
        pdf.set_font("NotoSans", "", 8)
        pdf.multi_cell(w, 4.5, seller["footer"], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    return bytes(pdf.output())
