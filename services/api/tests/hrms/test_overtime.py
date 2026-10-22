"""Overtime claims, paid through payroll (wave A, H5, St10, 0086).

An employee claims overtime for a day they worked past their shift (at most
the minutes attendance derived). A manager approves or rejects it. Approval
prices it once (salary / (working days × shift hours) × hours × multiplier,
integer paisa, half-up) and hands it to payroll as an OVERTIME one-off for
the month, so the run pays it, freezes it on approval and releases it on
reopen like any other one-off.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import asyncpg
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import payroll_engine as eng
from app.config import settings
from app.main import app
from app.security import SESSION_COOKIE

from ..core.test_rbac_v2 import _role, _user_on
from .test_employee_portal import _link_login


async def _owner(sql: str, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


def test_overtime_pay_is_salary_over_hours_times_the_multiplier():
    # PKR 100,000 a month, 26 working days of 8 hours, 2 hours at ×2.
    assert eng.overtime_pay(10_000_000, working_days=26, shift_minutes=480, minutes=120,
                            multiplier=Decimal("2")) == 192_308          # 192,307.69 paisa, half-up
    assert eng.overtime_pay(10_000_000, working_days=26, shift_minutes=480, minutes=0, multiplier=Decimal("2")) == 0
    assert eng.overtime_pay(0, working_days=26, shift_minutes=480, minutes=60, multiplier=Decimal("2")) == 0
    assert eng.overtime_pay(10_000_000, working_days=0, shift_minutes=480, minutes=60, multiplier=Decimal("2")) == 0


@pytest_asyncio.fixture
async def worker(client, tenant):
    """The first sample employee with a login, PKR 100,000 a month, and a day
    last week with 150 minutes of overtime in attendance."""
    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"emp+{uuid.uuid4().hex[:8]}@example.com")
    emp = AsyncClient(transport=ASGITransport(app=app), base_url="http://test", cookies={SESSION_COOKIE: token})
    day = date.today() - timedelta(days=7)
    r = await client.post(f"/payroll/employees/{tenant.employee_id}/compensation",
                          json={"effective_from": str(day - timedelta(days=60)), "base_minor": 10_000_000,
                                "reason": "joining"})
    assert r.status_code == 201, r.text
    await _owner("""insert into hrms_attendance (tenant_id, employee_id, work_date, status, worked_min, overtime_min)
                    values ($1, $2, $3, 'present', 630, 150)""",
                 uuid.UUID(tenant.tenant_id), uuid.UUID(tenant.employee_id), day)
    yield {"client": emp, "day": day}
    await emp.aclose()


async def test_a_claim_is_approved_and_lands_in_payroll(client, tenant, worker):
    me, day = worker["client"], worker["day"]
    r = await me.post("/me/overtime", json={"work_date": str(day), "minutes": 120, "reason": "Stock count"})
    assert r.status_code == 201, r.text
    claim = r.json()
    assert claim["status"] == "pending" and claim["minutes"] == 120
    assert [c["id"] for c in (await me.get("/me/overtime")).json()] == [claim["id"]]

    pending = (await client.get("/hrms/overtime?status=pending")).json()
    assert claim["id"] in [c["id"] for c in pending]
    r = await client.post(f"/hrms/overtime/{claim['id']}/approve", json={})
    assert r.status_code == 200, r.text
    approved = r.json()
    assert approved["status"] == "approved" and approved["amount_minor"] > 0

    # Priced with the month's working days and an 8-hour day (no shift assigned).
    first = day.replace(day=1)
    from app import db, payroll_data
    async with db.tenant_conn(tenant.tenant_id) as conn:
        wd = (await payroll_data.absence_counts(conn, first, [uuid.UUID(tenant.employee_id)]))[tenant.employee_id].working_days
    assert approved["amount_minor"] == eng.overtime_pay(10_000_000, working_days=wd, shift_minutes=480, minutes=120,
                                                        multiplier=Decimal("2"))
    one_offs = [o for o in (await client.get("/payroll/one-offs")).json() if o["code"] == "OVERTIME"]
    assert len(one_offs) == 1
    assert one_offs[0]["amount_minor"] == approved["amount_minor"] and one_offs[0]["status"] == "pending"


async def test_a_claim_is_bounded_by_attendance_and_made_once(client, worker):
    me, day = worker["client"], worker["day"]
    assert (await me.post("/me/overtime", json={"work_date": str(day), "minutes": 200})).status_code == 422
    assert (await me.post("/me/overtime", json={"work_date": str(day - timedelta(days=1)),
                                                "minutes": 30})).status_code == 422      # no overtime that day
    assert (await me.post("/me/overtime", json={"work_date": str(day)})).json()["minutes"] == 150  # all of it
    assert (await me.post("/me/overtime", json={"work_date": str(day), "minutes": 10})).status_code == 409


async def test_a_rejected_claim_pays_nothing_and_can_be_made_again(client, worker):
    me, day = worker["client"], worker["day"]
    claim = (await me.post("/me/overtime", json={"work_date": str(day), "minutes": 60})).json()
    r = await client.post(f"/hrms/overtime/{claim['id']}/reject", json={"note": "Not authorised"})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    assert (await client.post(f"/hrms/overtime/{claim['id']}/approve", json={})).status_code == 409
    assert not [o for o in (await client.get("/payroll/one-offs")).json() if o["code"] == "OVERTIME"]
    assert (await me.post("/me/overtime", json={"work_date": str(day), "minutes": 60})).status_code == 201


async def test_approvers_without_payroll_access_never_see_the_amount(client, worker):
    me, day = worker["client"], worker["day"]
    claim = (await me.post("/me/overtime", json={"work_date": str(day), "minutes": 60})).json()
    rid = await _role(client, [{"permission_key": "hrms.attendance.read", "scope": "all"},
                               {"permission_key": "hrms.attendance.approve", "scope": "all"}])
    lead, _, _ = await _user_on(client, [rid])
    try:
        r = await lead.post(f"/hrms/overtime/{claim['id']}/approve", json={})
        assert r.status_code == 200, r.text
        assert r.json()["amount_minor"] is None
        assert all(c["amount_minor"] is None for c in (await lead.get("/hrms/overtime")).json())
    finally:
        await lead.aclose()
    # The employee can't approve their own claim.
    assert (await me.post(f"/hrms/overtime/{claim['id']}/approve", json={})).status_code == 403
