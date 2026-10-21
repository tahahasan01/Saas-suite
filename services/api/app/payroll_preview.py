"""`GET /hrms/payroll`: a preview of a month's payroll, saved nowhere (St03
risk 4). It runs the same loader and calculator as the calculate job, so a
run calculated from the same inputs stores exactly these numbers (a snapshot
test holds the two together)."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status

from . import payroll, payroll_data
from . import payroll_engine as eng
from .payroll_models import LineOut, PreviewOut, PreviewPayslip


def line_out(ln: eng.Line) -> LineOut:
    return LineOut(code=ln.code, name=ln.name, kind=ln.kind, amount_minor=ln.amount_minor, taxable=ln.taxable,
                   explain=ln.explain)


def slip_out(res: eng.PayslipResult) -> PreviewPayslip:
    a = res.attendance
    amount = {ln.code: ln.amount_minor for ln in res.lines}
    return PreviewPayslip(
        employee_id=res.employee_id, name=res.name, gross_minor=res.gross_minor,
        present_days=a.present_days, paid_leave_days=a.paid_leave_days, unpaid_leave_days=a.unpaid_leave_days,
        wfh_days=a.wfh_days, absent_days=a.absent_days, half_days=a.half_days,
        absence_deduction_minor=amount.get("ABSENCE", 0), tax_minor=amount.get("INCOME_TAX", 0),
        # The preview never shows a negative net; the error says why instead.
        net_minor=max(0, res.net_minor), tax_year=res.tax_year, tax_rates_verified=res.tax_verified,
        period_days=res.period_days, employed_days=res.employed_days, deductions_minor=res.deductions_minor,
        employer_cost_minor=res.employer_cost_minor, statutory_verified=res.statutory_verified,
        warnings=res.warnings, notes=res.notes, error=res.error, lines=[line_out(ln) for ln in res.lines])


def month_or_422(month: str) -> tuple[Any, Any]:
    try:
        return eng.month_bounds(month)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "month must be YYYY-MM")


async def preview(conn: Any, month: str) -> PreviewOut:
    first, last = month_or_422(month)
    # Salaries are paid for the month, so its last day decides the tax year.
    pay_date = last
    ty = payroll.tax_year_for(pay_date)
    results = [eng.calculate(ld.input) for ld in await payroll_data.load_inputs(
        conn, period_start=first, period_end=last, pay_date=pay_date)]
    results = [r for r in results if r.employed_days > 0]
    unverified = eng.unverified_items([(ln.code, ln.explain) for r in results for ln in r.lines])
    if not ty.verified and not any(u.startswith("Income tax") for u in unverified):
        unverified.insert(0, f"Income tax slabs ({ty.label})")
    return PreviewOut(month=month, working_days=await payroll_data.working_days(conn, first),
                      payslips=[slip_out(r) for r in results], tax_year=ty.label, tax_rates_verified=ty.verified,
                      rates_verified=not unverified, unverified=unverified)
