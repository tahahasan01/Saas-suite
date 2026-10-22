"""A leaver is paid up to their exit date (wave C, St12 §3, 0100).

Offboarding sets hrms_employees.exit_date. In that month payroll prorates
pay to the exit date, never counts the days after it as absence, and works
out income tax on what the year actually paid (no months to come). After
that month they get no payslip, though they stay active until settled.
"""
from __future__ import annotations

from datetime import date

from app import payroll_engine as eng

from .payroll_helpers import new_employee, owner_execute
from .test_payroll_engine import RS, emp, line
from .test_payroll_runs import calc, new_run


def test_a_leavers_last_month_taxes_only_what_the_year_paid():
    """250,000 in July and leaving on 31 July: the year's income is 250,000,
    under the threshold, so no tax. Staying, the projection says 23,000."""
    staying = eng.calculate(emp())
    leaving = eng.calculate(emp(leaves_on=date(2026, 7, 31)))
    assert line(staying, "INCOME_TAX").amount_minor == 23_000 * RS
    assert all(ln.code != "INCOME_TAX" or ln.amount_minor == 0 for ln in leaving.lines)
    assert leaving.net_minor == 250_000 * RS


def test_a_leaver_later_in_the_year_settles_the_years_tax():
    """Six months paid at 250,000 with 23,000 a month withheld (projected on
    3M). Leaving at the end of the seventh: the year is 1.75M, so this month
    takes that year's tax less what was withheld, never below zero."""
    six = eng.TaxHistory(taxable_minor=6 * 250_000 * RS, tax_minor=6 * 23_000 * RS, months=6)
    jan = dict(period_start=date(2027, 1, 1), period_end=date(2027, 1, 31), pay_date=date(2027, 1, 31),
               segments=[eng.Segment(date(2027, 1, 1), date(2027, 1, 31), 250_000 * RS)], tax_history=six)
    stay = eng.calculate(emp(**jan))
    leave = eng.calculate(emp(**jan, leaves_on=date(2027, 1, 31)))
    assert line(stay, "INCOME_TAX").amount_minor == 23_000 * RS
    explain = line(leave, "INCOME_TAX").explain if any(ln.code == "INCOME_TAX" for ln in leave.lines) else {}
    assert leave.tax_minor < stay.tax_minor
    assert not explain or explain["months_left"] == 1


async def _leaver(client, last_day: str) -> dict:
    e = await new_employee(client, name="Bilal", salary_minor=6_000_000, join_date="2025-01-06")
    r = await client.post(f"/hrms/employees/{e['id']}/offboarding",
                          json={"reason": "resigned", "last_working_day": last_day})
    assert r.status_code == 201, r.text
    return e


async def test_the_last_month_is_prorated_to_the_exit_date_and_later_days_are_not_absence(client, tenant):
    e = await _leaver(client, "2026-09-15")
    # Pretend they've been on the system all year, so September's days count.
    await owner_execute("update hrms_employees set created_at = '2026-01-01' where id = $1::uuid", e["id"])
    run = await new_run(client, "2026-09")
    detail = await calc(client, run["id"])
    slip = next(p for p in detail["payslips"] if p["employee_id"] == e["id"])
    full = (await client.get(f"/payroll/runs/{run['id']}/payslips/{slip['id']}")).json()
    assert full["employed_days"] == 15 and full["period_days"] == 30
    basic = next(ln for ln in full["lines"] if ln["code"] == "BASIC")
    assert basic["amount_minor"] == 3_000_000                       # half of 60,000
    # No attendance at all: absent for the working days up to the 15th only.
    assert 0 < full["absent_days"] <= 13


async def test_after_the_exit_month_there_is_no_payslip(client, tenant):
    e = await _leaver(client, "2026-08-20")
    run = await new_run(client, "2026-09")
    detail = await calc(client, run["id"])
    assert e["id"] not in {p["employee_id"] for p in detail["payslips"]}
    # Still on the books until the final settlement is paid.
    assert (await client.get(f"/hrms/employees/{e['id']}")).json()["status"] == "active"
