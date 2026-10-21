"""Payslip PDF, rendered from the stored payslip and its frozen lines — never
recomputed (D-40, St03 §6.5). Pure Python (fpdf2) like invoices_pdf.py, but
with embedded Noto fonts (SIL OFL, app/fonts/) so Urdu names print: Noto
Sans for Latin text, Noto Naskh Arabic as the fallback for Arabic script,
shaped right-to-left by HarfBuzz.

The CNIC prints masked to its last 4 and the IBAN to its last 4 (St03 §6.5);
unverified tax or statutory rates print a notice instead of passing as fact.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from fpdf import FPDF
from fpdf.enums import XPos, YPos

from .payroll_access import mask_iban, mask_tail

FONTS = Path(__file__).resolve().parent / "fonts"

_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
         "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def _below_1000(n: int) -> str:
    words = []
    if n >= 100:
        words.append(f"{_ONES[n // 100]} hundred")
        n %= 100
    if n >= 20:
        words.append(_TENS[n // 10] + (f"-{_ONES[n % 10]}" if n % 10 else ""))
    elif n:
        words.append(_ONES[n])
    return " ".join(words)


def in_words(minor: int) -> str:
    """Net pay in words the way Pakistani payslips write it (lakh, crore)."""
    rupees, paisa = divmod(abs(minor), 100)
    if rupees == 0:
        text = "zero"
    else:
        parts = []
        for size, name in ((10_000_000, "crore"), (100_000, "lakh"), (1_000, "thousand")):
            if rupees >= size:
                count, rupees = divmod(rupees, size)
                parts.append(f"{in_words(count * 100)[7:-5]} {name}" if count >= 1000 else f"{_below_1000(count)} {name}")
        if rupees:
            parts.append(_below_1000(rupees))
        text = " ".join(parts)
    sign = "minus " if minor < 0 else ""
    return f"Rupees {sign}{text}" + (f" and {paisa} paisa" if paisa else "") + " only"


def _money(minor: int) -> str:
    sign = "-" if minor < 0 else ""
    rupees, paisa = divmod(abs(minor), 100)
    return f"{sign}Rs {rupees:,}" + (f".{paisa:02d}" if paisa else "")


def _new_pdf() -> FPDF:
    pdf = FPDF()
    pdf.add_font("NotoSans", "", str(FONTS / "NotoSans-Regular.ttf"))
    pdf.add_font("NotoSans", "B", str(FONTS / "NotoSans-Bold.ttf"))
    pdf.add_font("NotoNaskhArabic", "", str(FONTS / "NotoNaskhArabic-Regular.ttf"))
    pdf.set_fallback_fonts(["NotoNaskhArabic"], exact_match=False)
    try:
        pdf.set_text_shaping(True)     # joins Urdu letters, right to left (needs uharfbuzz)
    except Exception:  # noqa: BLE001 — without HarfBuzz the glyphs still print, unjoined
        pass
    pdf.set_auto_page_break(True, margin=15)
    pdf.add_page()
    return pdf


def render_certificate(cert: dict[str, Any], company: str, company_ntn: str) -> bytes:
    """The annual salary and tax certificate (St03 §6.6) — an export the
    employee files with; we do not submit it anywhere."""
    pdf = _new_pdf()
    w = pdf.epw
    emp = cert["employee"]
    pdf.set_font("NotoSans", "B", 15)
    pdf.multi_cell(w, 8, company, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "", 9)
    if company_ntn:
        pdf.cell(w, 5, f"NTN {company_ntn}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "B", 12)
    pdf.cell(w, 9, f"Salary and income tax certificate · {cert['tax_year']}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "", 10)
    pdf.multi_cell(w, 6, f"Employee: {emp.get('name', '')}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.multi_cell(w, 6, f"CNIC: {mask_tail(str(emp.get('cnic') or ''), 4)}   NTN: {emp.get('ntn') or '—'}",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(3)
    pdf.set_font("NotoSans", "B", 9)
    for head, width in (("Month", w * 0.31), ("Salary paid", w * 0.23), ("Taxable", w * 0.23), ("Tax deducted", w * 0.23)):
        pdf.cell(width, 7, head, align="L" if head == "Month" else "R")
    pdf.ln(7)
    pdf.set_font("NotoSans", "", 9)
    for m in cert["months"]:
        pdf.cell(w * 0.31, 6, m["month"])
        for k in ("gross_minor", "taxable_minor", "tax_minor"):
            pdf.cell(w * 0.23, 6, _money(m[k]), align="R")
        pdf.ln(6)
    pdf.set_font("NotoSans", "B", 9)
    pdf.cell(w * 0.31, 7, "Total")
    for k in ("gross_minor", "taxable_minor", "tax_minor"):
        pdf.cell(w * 0.23, 7, _money(cert[k]), align="R")
    pdf.ln(10)
    pdf.set_font("NotoSans", "", 8)
    if not cert.get("rates_verified", True):
        pdf.multi_cell(w, 4.5, "Rates pending verification: the tax slabs used have not yet been checked against the "
                               "Finance Act Gazette. Treat the tax figures as estimates.",
                       new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.multi_cell(w, 4.5, "Prepared from the employer's payroll records. Business OS does not file this with FBR.",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    return bytes(pdf.output())


def render(slip: dict[str, Any]) -> bytes:
    """`slip`: company, company_ntn, run_number, period, pay_date, tax_year,
    rates_verified, snapshot, employed_days, period_days, absent_days,
    unpaid_leave_days, gross/deductions/net/employer_cost_minor,
    taxable_ytd_minor, tax_ytd_minor, lines [{code, name, kind, amount_minor}],
    warnings."""
    pdf = _new_pdf()
    snap = slip.get("snapshot") or {}
    w = pdf.epw

    pdf.set_font("NotoSans", "B", 16)
    pdf.multi_cell(w, 8, slip.get("company") or "", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "", 9)
    if slip.get("company_ntn"):
        pdf.cell(w, 5, f"NTN {slip['company_ntn']}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "B", 12)
    pdf.cell(w, 8, f"Payslip · {slip.get('period', '')}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "", 9)
    pdf.cell(w, 5, f"{slip.get('run_number', '')} · paid {slip.get('pay_date', '')} · {slip.get('tax_year', '')}",
             new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(3)

    def kv(label: str, value: str) -> None:
        pdf.set_font("NotoSans", "", 9)
        pdf.cell(38, 6, label)
        pdf.set_font("NotoSans", "B", 10)
        pdf.multi_cell(w - 38, 6, value or "—", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    kv("Employee", snap.get("name", ""))
    kv("CNIC", mask_tail(snap.get("cnic") or "", 4))
    kv("Designation", " · ".join(x for x in (snap.get("designation"), snap.get("department")) if x))
    kv("Days paid", f"{slip.get('employed_days', 0)} of {slip.get('period_days', 0)}"
       + (f" · absent {slip['absent_days']}" if slip.get("absent_days") else "")
       + (f" · unpaid leave {slip['unpaid_leave_days']}" if slip.get("unpaid_leave_days") else ""))
    if snap.get("iban"):
        kv("Bank", f"{snap.get('bank_name') or ''} {mask_iban(snap['iban'])}".strip())
    pdf.ln(2)

    def table(title: str, rows: list[dict[str, Any]], total_label: str, total: int) -> None:
        if not rows:
            return
        pdf.set_font("NotoSans", "B", 10)
        pdf.set_fill_color(235, 245, 243)
        pdf.cell(w, 7, title, fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_font("NotoSans", "", 9)
        for r in rows:
            y = pdf.get_y()
            pdf.multi_cell(w - 40, 6, r["name"], new_x=XPos.RIGHT, new_y=YPos.TOP)
            pdf.set_xy(pdf.l_margin + w - 40, y)
            pdf.cell(40, 6, _money(r["amount_minor"]), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_y(max(pdf.get_y(), y + 6))
        pdf.set_font("NotoSans", "B", 9)
        pdf.cell(w - 40, 6, total_label)
        pdf.cell(40, 6, _money(total), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(2)

    lines = slip.get("lines") or []
    table("Earnings", [ln for ln in lines if ln["kind"] == "earning"], "Gross pay", slip.get("gross_minor", 0))
    table("Deductions", [ln for ln in lines if ln["kind"] == "deduction"], "Total deductions",
          slip.get("deductions_minor", 0))

    pdf.set_font("NotoSans", "B", 13)
    pdf.cell(w - 50, 9, "Net pay")
    pdf.cell(50, 9, _money(slip.get("net_minor", 0)), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "", 9)
    pdf.multi_cell(w, 5, in_words(slip.get("net_minor", 0)), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(3)

    employer = [ln for ln in lines if ln["kind"] == "employer_contribution"]
    table("Paid by the employer (not deducted)", employer, "Cost to employer", slip.get("employer_cost_minor", 0))

    pdf.set_font("NotoSans", "", 8)
    pdf.multi_cell(w, 4.5, f"Tax year to date: taxable {_money(slip.get('taxable_ytd_minor', 0))}, "
                           f"income tax {_money(slip.get('tax_ytd_minor', 0))}.",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    for warning in slip.get("warnings") or []:
        pdf.multi_cell(w, 4.5, f"Note: {warning}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    if not slip.get("rates_verified", True):
        pdf.set_text_color(150, 90, 0)
        pdf.multi_cell(w, 4.5, "Rates pending verification: some tax or social-security rates used here have not "
                               "yet been checked against the official notification. Treat those figures as estimates.",
                       new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_text_color(0, 0, 0)
    return bytes(pdf.output())
