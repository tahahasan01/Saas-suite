"""Overtime rates by kind of day (wave A leftover, H5, 0109).

A company sets one multiplier for ordinary days, one for the weekly day off
and one for public holidays (all ×2 until the founder confirms them). A
claim takes the rate for the kind of day it was worked, and says which; an
approver can still change it with payroll rights (wave A).
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.security import SESSION_COOKIE

from ..core.test_rbac_v2 import _role, _user_on
from .payroll_helpers import owner_execute
from .test_employee_portal import _link_login


def _last(isoweekday: int) -> date:
    d = date.today() - timedelta(days=1)
    while d.isoweekday() != isoweekday:
        d -= timedelta(days=1)
    return d


async def _worked(employee_id: str, day: date, overtime: int = 120) -> None:
    await owner_execute(
        """insert into hrms_attendance (tenant_id, employee_id, work_date, status, worked_min, overtime_min)
           select tenant_id, id, $2, 'present', 480 + $3, $3 from hrms_employees where id = $1::uuid
           on conflict (employee_id, work_date) do update set overtime_min = excluded.overtime_min""",
        employee_id, day, overtime)


async def _claim(tenant, day: date) -> dict:
    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"emp+{uuid.uuid4().hex[:8]}@example.com")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                           cookies={SESSION_COOKIE: token}) as me:
        r = await me.post("/me/overtime", json={"work_date": day.isoformat()})
        assert r.status_code == 201, r.text
        return r.json()


async def test_rates_start_at_double_and_unverified(client, tenant):
    r = await client.get("/hrms/overtime-rates")
    assert r.status_code == 200, r.text
    assert r.json() == {"normal": 2.0, "rest_day": 2.0, "holiday": 2.0, "verified": False}


async def test_a_claim_takes_the_rate_for_its_kind_of_day(client, tenant):
    r = await client.put("/hrms/overtime-rates", json={"normal": 1.5, "rest_day": 2.0, "holiday": 3.0})
    assert r.status_code == 200, r.text
    monday, sunday = _last(1), _last(7)
    holiday = monday - timedelta(days=14)
    assert (await client.post("/hrms/holidays", json={"holiday_date": holiday.isoformat(),
                                                      "name": "Company day off"})).status_code == 201
    for d in (monday, sunday, holiday):
        await _worked(tenant.employee_id, d)
    got = {}
    for d in (monday, sunday, holiday):
        c = await _claim(tenant, d)
        got[c["day_type"]] = c["rate_multiplier"]
    assert got == {"normal": 1.5, "rest_day": 2.0, "holiday": 3.0}


async def test_changing_the_rates_needs_payroll_settings(client, tenant):
    assert (await client.put("/hrms/overtime-rates", json={"normal": 0.5, "rest_day": 2, "holiday": 2})).status_code == 422
    rid = await _role(client, [{"permission_key": "hrms.attendance.read", "scope": "all"},
                               {"permission_key": "hrms.attendance.approve", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert (await mate.get("/hrms/overtime-rates")).status_code == 200
        assert (await mate.put("/hrms/overtime-rates", json={"normal": 3, "rest_day": 3, "holiday": 3})).status_code == 403
    finally:
        await mate.aclose()
