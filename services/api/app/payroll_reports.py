"""Statutory worksheets and the bank file, built from stored payslips (St03
§6.5–6.6, §7). We export; nothing here files with FBR (IRIS), EOBI or the
provincial institutions — the owner transcribes or uploads them.

Money columns are plain decimal rupees ("1234.50") so a spreadsheet sums
them; any cell a spreadsheet could read as a formula is prefixed with "'".
"""
from __future__ import annotations

import csv
import io
from collections import defaultdict
from typing import Any

from . import iban
from .payroll_access import snapshot_view

_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def cell(value: Any) -> str:
    text = "" if value is None else str(value)
    return "'" + text if text.startswith(_FORMULA_START) else text


def rs(minor: int) -> str:
    return f"{minor / 100:.2f}" if minor >= 0 else f"-{-minor / 100:.2f}"


def to_csv(rows: list[list[Any]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    for row in rows:
        writer.writerow([v if isinstance(v, str) and not v.startswith(_FORMULA_START) or _is_money(v) else cell(v)
                         for v in row])
    return buf.getvalue()


def _is_money(v: Any) -> bool:
    # rs() output, including a negative amount, is a number, not a formula.
    if not isinstance(v, str):
        return False
    try:
        float(v)
    except ValueError:
        return False
    return True


async def _slips(conn: Any, run_id: Any, reveal: bool) -> list[tuple[Any, dict[str, Any]]]:
    """Payslips with their snapshot through THE masking function."""
    rows = await conn.fetch("select * from payslips where run_id = $1 order by snapshot->>'name', employee_id", run_id)
    return [(p, snapshot_view(p["snapshot"], reveal=reveal)) for p in rows]


async def wht(conn: Any, run: Any, *, reveal: bool) -> str:
    """Monthly withholding worksheet: CNIC, taxable salary and tax per
    employee, to transcribe into the IRIS salary statement."""
    period = f"{run['period_start']:%Y-%m}"
    out: list[list[Any]] = [["Employee", "CNIC", "NTN", "Taxable salary (PKR)", "Tax deducted (PKR)", "Tax year",
                             "Period"]]
    taxable = tax = 0
    for p, s in await _slips(conn, run["id"], reveal):
        out.append([s.get("name", ""), s.get("cnic", ""), s.get("ntn", ""), rs(p["taxable_minor"]), rs(p["tax_minor"]),
                    p["tax_year"], period])
        taxable += p["taxable_minor"]
        tax += p["tax_minor"]
    out.append(["Total", "", "", rs(taxable), rs(tax), run["tax_year"], period])
    return to_csv(out)


async def contributions(conn: Any, run: Any, scheme: str, *, reveal: bool) -> str:
    """A challan worksheet for one scheme (EOBI, PESSI, SESSI)."""
    reg = await conn.fetchrow("select registration_no from tenant_statutory_registrations where scheme_code = $1",
                              scheme)
    lines: dict[Any, dict[str, Any]] = defaultdict(dict)
    for ln in await conn.fetch(
            "select payslip_id, code, amount_minor, explain from payslip_lines where run_id = $1 and code = any($2)",
            run["id"], [f"{scheme}_EE", f"{scheme}_ER"]):
        lines[ln["payslip_id"]][ln["code"][-2:]] = ln
    number_field = "eobi_number" if scheme == "EOBI" else "ss_number"
    out: list[list[Any]] = [
        [f"{scheme} contributions", f"Employer registration: {reg['registration_no'] if reg else 'not set'}",
         f"Period: {run['period_start']:%Y-%m}"],
        ["Employee", "CNIC", "Registration no", "Base wage (PKR)", "Employee share (PKR)", "Employer share (PKR)",
         "Total (PKR)"]]
    sums = [0, 0]
    for p, s in await _slips(conn, run["id"], reveal):
        found = lines.get(p["id"])
        if not found:
            continue
        ee = found.get("EE")
        er = found.get("ER")
        either: Any = er or ee
        base = either["explain"].get("base_minor", 0)
        ee_amt = ee["amount_minor"] if ee else 0
        er_amt = er["amount_minor"] if er else 0
        out.append([s.get("name", ""), s.get("cnic", ""), s.get(number_field, ""), rs(base), rs(ee_amt), rs(er_amt),
                    rs(ee_amt + er_amt)])
        sums[0] += ee_amt
        sums[1] += er_amt
    out.append(["Total", "", "", "", rs(sums[0]), rs(sums[1]), rs(sums[0] + sums[1])])
    return to_csv(out)


async def salary_certificate(conn: Any, employee_id: Any, tax_year: str, *, reveal: bool) -> dict[str, Any] | None:
    """Annual salary and tax for one employee from every approved, paid or
    locked run of the tax year (adjustments and the recompute included)."""
    rows = await conn.fetch(
        """select r.period_start, r.kind, r.purpose, p.gross_minor, p.taxable_minor, p.tax_minor, p.net_minor,
                  p.snapshot, p.tax_verified
             from payslips p join payroll_runs r on r.id = p.run_id
            where p.employee_id = $1 and r.tax_year = $2 and r.status in ('approved', 'paid', 'locked')
            order by r.period_start, r.created_at""", employee_id, tax_year)
    if not rows:
        return None
    months: dict[str, dict[str, int]] = {}
    for r in rows:
        m = months.setdefault(f"{r['period_start']:%Y-%m}", {"gross_minor": 0, "taxable_minor": 0, "tax_minor": 0})
        m["gross_minor"] += r["gross_minor"]
        m["taxable_minor"] += r["taxable_minor"]
        m["tax_minor"] += r["tax_minor"]
    snap = snapshot_view(rows[-1]["snapshot"], reveal=reveal)
    return {"tax_year": tax_year, "employee": {k: snap.get(k, "") for k in ("name", "cnic", "ntn", "designation")},
            "months": [{"month": k, **v} for k, v in months.items()],
            "gross_minor": sum(v["gross_minor"] for v in months.values()),
            "taxable_minor": sum(v["taxable_minor"] for v in months.values()),
            "tax_minor": sum(v["tax_minor"] for v in months.values()),
            "rates_verified": all(r["tax_verified"] for r in rows)}


async def bank_check(conn: Any, run: Any, *, reveal: bool) -> dict[str, Any]:
    """Who the bank file will pay, and who it can't (and why)."""
    ready, problems, cash = [], [], 0
    for p, s in await _slips(conn, run["id"], True):   # validity needs the real IBAN; output is masked below
        if p["net_minor"] <= 0:
            continue
        if s.get("payment_mode") != "bank":
            cash += 1
            continue
        reason = iban.problem(s.get("iban") or "")
        if reason:
            problems.append({"employee_id": str(p["employee_id"]), "name": s.get("name", ""),
                             "reason": "No IBAN on file" if reason == "missing" else f"IBAN is not valid ({reason})"})
        else:
            ready.append((p, snapshot_view(s, reveal=reveal)))
    return {"ready_slips": ready, "problems": problems, "cash": cash}


async def bank_file(conn: Any, run: Any, *, reveal: bool) -> str:
    """Generic bulk-transfer CSV (St03 §6.5 "Bank payout"); bank-specific
    formats are adapters for later (Phase 6)."""
    checked = await bank_check(conn, run, reveal=reveal)
    out: list[list[Any]] = [["Beneficiary name", "IBAN", "Bank", "Amount (PKR)", "Reference"]]
    for p, s in checked["ready_slips"]:
        account = iban.normalise(s.get("iban", "")) if reveal else s.get("iban", "")
        out.append([s.get("name", ""), account, s.get("bank_name", ""), rs(p["net_minor"]),
                    f"PAY-{run['period_start']:%Y%m}-{str(p['employee_id'])[:8]}"])
    return to_csv(out)
