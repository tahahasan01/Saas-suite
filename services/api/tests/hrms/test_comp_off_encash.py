"""Compensatory leave and leave encashment (wave C, H8, St12, 0103).

Comp-off: an employee who worked on a weekly off day or a holiday (they
clocked in) asks for a day (or half) off in return. An approver
(hrms.leave.approve, never for themselves) credits it to a leave type as a
`comp_off` ledger entry.

Encashment: HR (hrms.leave.adjust plus payroll.salary.update, since it is
pay) turns up to the remaining balance into money: days × base ÷ 30,
half-up, as a taxable LEAVE_ENCASH one-off, and an `encash` ledger entry
takes the days off the balance.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.security import SESSION_COOKIE

from ..core.test_rbac_v2 import _role, _user_on
from .payroll_helpers import new_employee, owner_execute, owner_fetch
from .test_employee_portal import _link_login


def _last(weekday: int) -> date:
    """The most recent past date with this isoweekday (7 = Sunday)."""
    d = date.today() - timedelta(days=1)
    while d.isoweekday() != weekday:
        d -= timedelta(days=1)
    return d


async def _worked(employee_id: str, day: date) -> None:
    await owner_execute(
        """insert into hrms_attendance (tenant_id, employee_id, work_date, check_in, check_out, status)
           select tenant_id, id, $2, $2::date + time '09:00', $2::date + time '17:00', 'present'
             from hrms_employees where id = $1::uuid
           on conflict (employee_id, work_date) do nothing""", employee_id, day)


def _portal(token: str) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test", cookies={SESSION_COOKIE: token})


async def _balance(client, employee_id: str, code: str) -> float:
    rows = (await client.get("/hrms/leave/balances", params={"employee_id": employee_id})).json()
    return next(b["remaining"] for b in rows if b["leave_type"] == code)


async def _type_id(client, employee_id: str, code: str) -> str:
    rows = (await client.get("/hrms/leave/balances", params={"employee_id": employee_id})).json()
    return next(b["leave_type_id"] for b in rows if b["leave_type"] == code)


async def test_a_worked_sunday_earns_a_comp_off_day_once_approved(client, tenant):
    sunday = _last(7)
    await _worked(tenant.employee_id, sunday)
    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"emp+{uuid.uuid4().hex[:8]}@example.com")
    casual = await _type_id(client, tenant.employee_id, "casual")
    before = await _balance(client, tenant.employee_id, "casual")
    async with _portal(token) as me:
        r = await me.post("/me/comp-off", json={"work_date": sunday.isoformat(), "days": 1, "reason": "Stock count"})
        assert r.status_code == 201, r.text
        req = r.json()
        assert req["status"] == "pending"
        # One request per day worked.
        assert (await me.post("/me/comp-off", json={"work_date": sunday.isoformat(), "days": 1})).status_code == 409
        assert [x["id"] for x in (await me.get("/me/comp-off")).json()] == [req["id"]]

    r = await client.post(f"/hrms/comp-off/{req['id']}/approve", json={"leave_type_id": casual})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"
    assert await _balance(client, tenant.employee_id, "casual") == before + 1
    entries = await owner_fetch("select entry, days from hrms_leave_ledger where employee_id = $1::uuid "
                                "and entry = 'comp_off'", tenant.employee_id)
    assert [(e["entry"], float(e["days"])) for e in entries] == [("comp_off", 1.0)]
    assert (await client.post(f"/hrms/comp-off/{req['id']}/approve", json={"leave_type_id": casual})).status_code == 409


async def test_comp_off_needs_a_day_off_that_was_actually_worked(client, tenant):
    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"emp+{uuid.uuid4().hex[:8]}@example.com")
    monday, sunday = _last(1), _last(7) - timedelta(days=7)
    await _worked(tenant.employee_id, monday)
    async with _portal(token) as me:
        r = await me.post("/me/comp-off", json={"work_date": monday.isoformat(), "days": 1})
        assert r.status_code == 422 and "working day" in r.text
        r = await me.post("/me/comp-off", json={"work_date": sunday.isoformat(), "days": 1})
        assert r.status_code == 422 and "clocked" in r.text                      # no attendance that Sunday
        assert (await me.post("/me/comp-off", json={"work_date": sunday.isoformat(), "days": 0.7})).status_code == 422
        future = (date.today() + timedelta(days=7 - date.today().isoweekday() % 7 or 7)).isoformat()
        assert (await me.post("/me/comp-off", json={"work_date": future, "days": 1})).status_code == 422


async def test_comp_off_is_rejected_with_a_reason_and_nobody_approves_their_own(client, tenant):
    sunday = _last(7)
    await _worked(tenant.employee_id, sunday)
    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"emp+{uuid.uuid4().hex[:8]}@example.com")
    async with _portal(token) as me:
        req = (await me.post("/me/comp-off", json={"work_date": sunday.isoformat(), "days": 0.5})).json()
    # The owner's own login is now that employee: they can't approve their own.
    me_user = (await client.get("/auth/me")).json()["user"]["id"]
    await owner_execute("update hrms_employees set user_id = $1::uuid where id = $2::uuid", me_user, tenant.employee_id)
    casual = await _type_id(client, tenant.employee_id, "casual")
    assert (await client.post(f"/hrms/comp-off/{req['id']}/approve", json={"leave_type_id": casual})).status_code == 403
    rid = await _role(client, [{"permission_key": "hrms.leave.read", "scope": "all"},
                               {"permission_key": "hrms.leave.approve", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert (await mate.post(f"/hrms/comp-off/{req['id']}/reject", json={"note": ""})).status_code == 422
        r = await mate.post(f"/hrms/comp-off/{req['id']}/reject", json={"note": "That Sunday was optional"})
        assert r.status_code == 200 and r.json()["status"] == "rejected"
        assert any(x["id"] == req["id"] for x in (await mate.get("/hrms/comp-off")).json())
    finally:
        await mate.aclose()


async def test_encashing_leave_pays_days_at_a_thirtieth_of_salary_and_takes_them_off(client, tenant):
    e = await new_employee(client, name="Sana", salary_minor=6_000_000, join_date="2025-01-06")
    annual = await _type_id(client, e["id"], "annual")
    before = await _balance(client, e["id"], "annual")
    assert before >= 3
    r = await client.post(f"/hrms/employees/{e['id']}/leave-encashments",
                          json={"leave_type_id": annual, "days": 3, "note": "Year-end encashment"})
    assert r.status_code == 201, r.text
    enc = r.json()
    assert enc["per_day_minor"] == 200_000 and enc["amount_minor"] == 600_000      # 60,000 ÷ 30 × 3
    assert await _balance(client, e["id"], "annual") == before - 3
    one_off = (await owner_fetch("select * from pay_one_offs where id = $1::uuid", enc["one_off_id"]))[0]
    assert (one_off["code"], one_off["amount_minor"], one_off["taxable"]) == ("LEAVE_ENCASH", 600_000, True)
    listed = (await client.get(f"/hrms/employees/{e['id']}/leave-encashments")).json()
    assert [x["id"] for x in listed] == [enc["id"]]

    # Not more than is left, and half days at most.
    big = await client.post(f"/hrms/employees/{e['id']}/leave-encashments", json={"leave_type_id": annual, "days": 99})
    assert big.status_code == 422
    odd = await client.post(f"/hrms/employees/{e['id']}/leave-encashments", json={"leave_type_id": annual, "days": 1.3})
    assert odd.status_code == 422


async def test_encashment_is_pay_so_it_needs_payroll_rights(client, tenant):
    e = await new_employee(client, name="Hamza", join_date="2025-01-06")
    annual = await _type_id(client, e["id"], "annual")
    rid = await _role(client, [{"permission_key": "hrms.leave.read", "scope": "all"},
                               {"permission_key": "hrms.leave.adjust", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        r = await mate.post(f"/hrms/employees/{e['id']}/leave-encashments", json={"leave_type_id": annual, "days": 1})
        assert r.status_code == 403
    finally:
        await mate.aclose()
