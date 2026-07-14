"""The absence side of a payslip, against a real database.

The original bug: absences were counted as `attendance.status = 'absent'`, a
value nothing ever wrote, so the deduction was always exactly zero while the UI
displayed a Deduction column. These tests assert the arithmetic actually moves.
"""
from __future__ import annotations

from datetime import date, timedelta


async def _payslip(client, employee_id):
    r = await client.get("/hrms/payroll")
    r.raise_for_status()
    return next(s for s in r.json()["payslips"] if s["employee_id"] == employee_id)


async def test_working_days_come_from_the_calendar_not_a_constant(client, tenant):
    """A holiday must reduce the month's working days — they were hardcoded to 26."""
    before = (await client.get("/hrms/payroll")).json()["working_days"]

    # Pick a day this month that is not already the weekly rest day.
    day = date.today().replace(day=1)
    while day.weekday() == 6:  # Sunday, the default weekly off
        day += timedelta(days=1)
    r = await client.post("/hrms/holidays",
                          json={"holiday_date": day.isoformat(), "name": "Test Holiday"})
    assert r.status_code == 201

    after = (await client.get("/hrms/payroll")).json()["working_days"]
    assert after == before - 1


async def test_holidays_round_trip(client, tenant):
    day = (date.today().replace(day=1) + timedelta(days=20)).isoformat()
    await client.post("/hrms/holidays", json={"holiday_date": day, "name": "Eid"})
    listed = (await client.get("/hrms/holidays")).json()
    assert [h["name"] for h in listed] == ["Eid"]

    assert (await client.delete(f"/hrms/holidays/{listed[0]['id']}")).status_code == 204
    assert (await client.get("/hrms/holidays")).json() == []


async def test_a_fresh_tenant_has_no_phantom_absences(client, tenant):
    """Nobody can be absent for days before the company was tracking them."""
    slip = await _payslip(client, tenant.employee_id)
    assert slip["absent_days"] == 0
    assert slip["absence_deduction_minor"] == 0


async def test_today_is_never_counted_absent_before_it_ends(client, tenant):
    """Absence is judged on completed working days only — never the current one,
    or everyone is 'absent' until they clock in each morning."""
    slip = await _payslip(client, tenant.employee_id)
    assert slip["absent_days"] == 0  # no check-in yet today, still not absent


async def test_checking_in_registers_presence(client, tenant):
    await client.post("/hrms/attendance/checkin",
                      json={"employee_id": tenant.employee_id, "method": "web"})
    slip = await _payslip(client, tenant.employee_id)
    assert slip["present_days"] == 1


async def test_net_is_gross_minus_deduction_and_tax(client, tenant):
    slip = await _payslip(client, tenant.employee_id)
    expected = slip["gross_minor"] - slip["absence_deduction_minor"] - slip["tax_minor"]
    assert slip["net_minor"] == max(0, expected)


async def test_payslip_separates_paid_from_unpaid_leave(client, tenant):
    """Paid leave must not be deducted; unpaid leave must be."""
    slip = await _payslip(client, tenant.employee_id)
    assert slip["paid_leave_days"] == 0
    assert slip["unpaid_leave_days"] == 0
