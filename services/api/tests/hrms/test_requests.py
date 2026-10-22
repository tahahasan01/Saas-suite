"""One request tracker (wave A, H16, St10): every request an employee made
(leave, WFH, attendance corrections, overtime) in one list through /me, and
everything waiting for a manager in one list, limited to the kinds the caller
may approve. A read model over the existing tables; nothing new is stored."""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone

import asyncpg
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app
from app.security import SESSION_COOKIE

from ..core.test_rbac_v2 import _role, _user_on
from .test_employee_portal import _link_login


@pytest_asyncio.fixture
async def asked(client, tenant):
    """The first employee, with a login, has one of each kind of request."""
    t, e = uuid.UUID(tenant.tenant_id), uuid.UUID(tenant.employee_id)
    day = date.today() + timedelta(days=10)
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute(
            """insert into hrms_leave_requests (tenant_id, employee_id, leave_type, request_type, from_date, to_date,
                                                reason, status)
               values ($1, $2, 'casual', 'leave', $3, $3, 'Wedding', 'pending'),
                      ($1, $2, 'casual', 'wfh', $4, $4, 'Plumber', 'approved')""", t, e, day, day + timedelta(days=1))
        await conn.execute(
            """insert into hrms_attendance_corrections (tenant_id, employee_id, work_date, requested_out, reason)
               values ($1, $2, $3, $4, 'Forgot to clock out')""",
            t, e, date.today() - timedelta(days=2),
            datetime.combine(date.today() - timedelta(days=2), time(13), tzinfo=timezone(timedelta(hours=5))))
        await conn.execute(
            """insert into hrms_overtime_claims (tenant_id, employee_id, work_date, minutes, reason)
               values ($1, $2, $3, 90, 'Stock count')""", t, e, date.today() - timedelta(days=3))
    finally:
        await conn.close()
    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"emp+{uuid.uuid4().hex[:8]}@example.com")
    me = AsyncClient(transport=ASGITransport(app=app), base_url="http://test", cookies={SESSION_COOKIE: token})
    yield me
    await me.aclose()


async def test_an_employee_sees_all_their_requests_in_one_list(asked):
    rows = (await asked.get("/me/requests")).json()
    kinds = sorted((r["kind"], r["status"]) for r in rows)
    assert kinds == [("correction", "pending"), ("leave", "pending"), ("overtime", "pending"), ("wfh", "approved")]
    leave = next(r for r in rows if r["kind"] == "leave")
    assert "Casual" in leave["title"] and leave["link"] == "/me/leave"


async def test_a_manager_sees_what_waits_for_them(client, asked):
    rows = (await client.get("/hrms/requests/pending")).json()
    assert sorted(r["kind"] for r in rows) == ["correction", "leave", "overtime"]   # the approved WFH is done
    assert all(r["employee_name"] for r in rows)
    assert {r["kind"]: r["link"] for r in rows}["overtime"] == "/hrms/attendance"


async def test_each_approver_sees_only_the_kinds_they_decide(client, asked):
    rid = await _role(client, [{"permission_key": "hrms.attendance.read", "scope": "all"},
                               {"permission_key": "hrms.attendance.approve", "scope": "all"}])
    lead, _, _ = await _user_on(client, [rid])
    plain = await _role(client, [{"permission_key": "hrms.employee.read", "scope": "all"}])
    viewer, _, _ = await _user_on(client, [plain])
    try:
        assert sorted(r["kind"] for r in (await lead.get("/hrms/requests/pending")).json()) == ["correction", "overtime"]
        assert (await viewer.get("/hrms/requests/pending")).status_code == 403
        assert (await asked.get("/hrms/requests/pending")).status_code == 403
    finally:
        await lead.aclose()
        await viewer.aclose()
