"""HR letters (wave C, H17/H37, St12, 0105): placeholders, rendering, PDF.

A template's text may use only the placeholders below; anything else is
refused when the template is saved, so a typo can't print as-is. Salary
prints only for callers holding payroll.salary.read, and the CNIC is masked
for everyone else (D-42). {{letter.number}} is filled at issue.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any

import asyncpg
from fpdf.enums import XPos, YPos

from .payroll_access import mask_tail
from .payslip_pdf import _money, _new_pdf

PLACEHOLDERS = {
    "employee.name": "Full name",
    "employee.code": "Employee code",
    "employee.designation": "Job title",
    "employee.department": "Department",
    "employee.manager": "Manager's name",
    "employee.cnic": "CNIC (masked without pay access)",
    "employee.join_date": "Joining date",
    "employee.exit_date": "Last working day (\"present\" while employed)",
    "employee.confirmed_on": "Probation confirmed on",
    "employee.employment_type": "Permanent, contract…",
    "employee.salary": "Monthly salary (needs pay access)",
    "company.name": "Company name",
    "today": "Today's date",
    "letter.number": "The letter's number",
}
_TOKEN = re.compile(r"\{\{\s*([a-z_.]+)\s*\}\}")
SALARY = "employee.salary"

STARTERS: list[tuple[str, str, str, str]] = [
    ("experience", "Experience certificate", "Experience certificate",
     "To whom it may concern\n\n"
     "This is to certify that {{employee.name}} (CNIC {{employee.cnic}}) worked with {{company.name}} as "
     "{{employee.designation}} from {{employee.join_date}} to {{employee.exit_date}}.\n\n"
     "During this time we found them hard-working and honest. We wish them every success.\n\n"
     "Ref {{letter.number}} · {{today}}\nFor {{company.name}}"),
    ("salary", "Salary certificate", "Salary certificate",
     "To whom it may concern\n\n"
     "This is to certify that {{employee.name}} has been employed with {{company.name}} as "
     "{{employee.designation}} since {{employee.join_date}}. Their gross monthly salary is {{employee.salary}}.\n\n"
     "This certificate is issued at their request and creates no liability for the company.\n\n"
     "Ref {{letter.number}} · {{today}}\nFor {{company.name}}"),
    ("noc", "No objection certificate", "No objection certificate",
     "To whom it may concern\n\n"
     "{{company.name}} has no objection to {{employee.name}}, our {{employee.designation}}, for the purpose "
     "set out in their request.\n\n"
     "Ref {{letter.number}} · {{today}}\nFor {{company.name}}"),
    ("employment", "Employment letter", "Employment verification",
     "To whom it may concern\n\n"
     "This is to confirm that {{employee.name}} works with {{company.name}} as {{employee.designation}} "
     "({{employee.employment_type}}) since {{employee.join_date}}.\n\n"
     "Ref {{letter.number}} · {{today}}\nFor {{company.name}}"),
]


def unknown_placeholders(text: str) -> set[str]:
    return {m for m in _TOKEN.findall(text) if m not in PLACEHOLDERS}


def uses_salary(text: str) -> bool:
    return SALARY in _TOKEN.findall(text)


def _day(d: date | None, empty: str = "") -> str:
    return f"{d.day} {d:%B %Y}" if d else empty


async def ensure_starters(conn: asyncpg.Connection, tenant_id: str) -> None:
    if await conn.fetchval("select 1 from hrms_letter_templates limit 1"):
        return
    await conn.executemany(
        """insert into hrms_letter_templates (tenant_id, kind, name, title, body) values ($1, $2, $3, $4, $5)
           on conflict do nothing""", [(tenant_id, k, n, t, b) for k, n, t, b in STARTERS])


async def values_for(conn: asyncpg.Connection, employee_id: Any, *, reveal: bool) -> dict[str, str]:
    e = await conn.fetchrow(
        """select e.*, m.name as manager_name,
                  (select base_minor from hrms_compensation c where c.employee_id = e.id
                     and c.effective_from <= current_date order by effective_from desc, seq desc limit 1) as base
             from hrms_employees e left join hrms_employees m on m.id = e.manager_id where e.id = $1""", employee_id)
    company = await conn.fetchval("select name from tenants where id = current_setting('app.tenant_id')::uuid")
    today: date = await conn.fetchval("select current_date")
    salary = e["base"] if e["base"] is not None else e["salary_minor"]
    return {
        "employee.name": e["name"], "employee.code": e["code"] or "", "employee.designation": e["designation"],
        "employee.department": e["department"], "employee.manager": e["manager_name"] or "",
        "employee.cnic": e["cnic"] if reveal else mask_tail(e["cnic"] or "", 4),
        "employee.join_date": _day(e["join_date"]), "employee.exit_date": _day(e["exit_date"], "present"),
        "employee.confirmed_on": _day(e["confirmed_on"]),
        "employee.employment_type": (e["employment_type"] or "").replace("_", " "),
        "employee.salary": _money(int(salary or 0)) if reveal else "",
        "company.name": company or "", "today": _day(today),
    }


def fill(text: str, values: dict[str, str]) -> str:
    """Replaces the placeholders it has values for; the rest stay (the number, until issue)."""
    return _TOKEN.sub(lambda m: values[m.group(1)] if m.group(1) in values else m.group(0), text)


def render_pdf(company: str, letter: asyncpg.Record) -> bytes:
    pdf = _new_pdf()
    w = pdf.epw
    pdf.set_font("NotoSans", "B", 15)
    pdf.multi_cell(w, 8, company, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("NotoSans", "", 9)
    pdf.cell(w, 5, f"{letter['number']} · {_day(letter['issued_at'].date())}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(6)
    pdf.set_font("NotoSans", "B", 13)
    pdf.multi_cell(w, 8, letter["title"], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(3)
    pdf.set_font("NotoSans", "", 11)
    pdf.multi_cell(w, 6, letter["body"], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    return bytes(pdf.output())
