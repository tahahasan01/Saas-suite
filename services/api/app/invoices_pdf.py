"""On-demand invoice PDF generation (fpdf2, pure Python — no system deps)."""
from __future__ import annotations

from fpdf import FPDF
from fpdf.enums import XPos, YPos


def build_invoice_pdf(*, company: str, lead_name: str, number: str, date_str: str,
                      amount_minor: int, discount_pct: float, total_minor: int, notes: str) -> bytes:
    pdf = FPDF()
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 22)
    pdf.cell(0, 12, "INVOICE", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 7, company, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.cell(0, 7, f"Invoice #: {number}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.cell(0, 7, f"Date: {date_str}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Bill to", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 7, lead_name, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(6)

    def row(label: str, value: str, bold: bool = False) -> None:
        pdf.set_font("Helvetica", "B" if bold else "", 12 if bold else 11)
        pdf.cell(120, 8, label)
        pdf.cell(0, 8, value, new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="R")

    row("Amount", f"PKR {amount_minor / 100:,.0f}")
    row("Discount", f"{discount_pct:g}%")
    pdf.ln(1)
    row("Total", f"PKR {total_minor / 100:,.0f}", bold=True)

    if notes:
        pdf.ln(6)
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 6, f"Notes: {notes}")

    return bytes(pdf.output())
