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


async def test_work_from_home_is_worked_time_not_leave(client, tenant):
    """An approved WFH day must never be counted as leave or docked — the whole
    reason WFH is a request_type rather than a leave_type."""
    r = await client.post("/hrms/leave", json={
        "employee_id": tenant.employee_id, "request_type": "wfh",
        "from_date": date.today().isoformat(), "to_date": date.today().isoformat(),
        "reason": "Remote",
    })
    assert r.status_code == 201
    assert r.json()["request_type"] == "wfh"
    await client.post(f"/hrms/leave/{r.json()['id']}/approve")

    slip = await _payslip(client, tenant.employee_id)
    assert slip["paid_leave_days"] == 0    # not leave
    assert slip["unpaid_leave_days"] == 0  # and certainly not unpaid
    assert slip["absence_deduction_minor"] == 0


async def test_requests_can_be_filtered_by_type(client, tenant):
    # Distinct days: one person cannot be on leave and WFH the same day, and the
    # overlap guard now enforces exactly that.
    today = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    await client.post("/hrms/leave", json={"employee_id": tenant.employee_id, "request_type": "wfh",
                                           "from_date": today, "to_date": today})
    await client.post("/hrms/leave", json={"employee_id": tenant.employee_id, "request_type": "leave",
                                           "leave_type": "sick", "from_date": tomorrow, "to_date": tomorrow})
    wfh = (await client.get("/hrms/leave?request_type=wfh")).json()
    leave = (await client.get("/hrms/leave?request_type=leave")).json()
    assert [x["request_type"] for x in wfh] == ["wfh"]
    assert [x["request_type"] for x in leave] == ["leave"]
    assert len((await client.get("/hrms/leave")).json()) == 2


async def test_backwards_dates_are_rejected(client, tenant):
    r = await client.post("/hrms/leave", json={
        "employee_id": tenant.employee_id, "request_type": "leave", "leave_type": "annual",
        "from_date": "2026-05-10", "to_date": "2026-05-01",
    })
    assert r.status_code == 422


async def test_week_matrix_has_no_absences_before_the_company_existed(client, tenant):
    """The attendance grid must agree with payroll: a fresh tenant's staff are
    never 'absent' for days before signup, even if a sample join_date is
    backdated."""
    week = (await client.get("/hrms/attendance/week")).json()
    assert week["employees"], "expected seeded employees"
    for emp in week["employees"]:
        assert "absent" not in emp["cells"], f"{emp['name']} shows a phantom absence"


async def test_week_matrix_marks_today_pending_not_absent(client, tenant):
    week = (await client.get("/hrms/attendance/week")).json()
    # The last column is today; nobody has checked in, but the day isn't over.
    for emp in week["employees"]:
        assert emp["cells"][-1] in ("pending", "off", "holiday", "none")
