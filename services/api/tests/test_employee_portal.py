"""Employee self-service portal.

The security property that matters most: a portal login can only ever touch its
own record, and is locked out of every admin endpoint. Everything else is
convenience.
"""
from __future__ import annotations

import uuid

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import db
from app.config import settings
from app.main import app
from app.security import SESSION_COOKIE, hash_session_token


async def _link_login(tenant_id: str, employee_id: str, email: str) -> str:
    """Create a portal login for an employee the way accept-invite would, and
    return a raw session token for it. Done directly against the DB so the test
    doesn't depend on the email-delivery side of the invite flow."""
    owner = await asyncpg.connect(settings.database_url)
    try:
        role_id = await owner.fetchval(
            """insert into roles (tenant_id, name, is_system) values ($1,'Employee',true)
               on conflict (tenant_id, name) do update set name=excluded.name returning id""",
            uuid.UUID(tenant_id))
        user_id = await owner.fetchval(
            """insert into users (tenant_id, email, password_hash, name, role_id)
               values ($1,$2,'x','Emp',$3) returning id""",
            uuid.UUID(tenant_id), email, role_id)
        await owner.execute("update hrms_employees set user_id=$1 where id=$2",
                            user_id, uuid.UUID(employee_id))
        raw = "portal-" + uuid.uuid4().hex
        await owner.execute(
            """insert into sessions (id, user_id, tenant_id, expires_at)
               values ($1,$2,$3, now() + interval '1 day')""",
            hash_session_token(raw), user_id, uuid.UUID(tenant_id))
        return raw
    finally:
        await owner.close()


@pytest_asyncio.fixture
async def portal(client, tenant):
    """`client` stays the admin; returns a second client authed as an employee
    linked to the admin tenant's first sample employee."""
    token = await _link_login(tenant.tenant_id, tenant.employee_id,
                              f"emp+{uuid.uuid4().hex[:8]}@example.com")
    transport = ASGITransport(app=app)
    emp = AsyncClient(transport=transport, base_url="http://test",
                      cookies={SESSION_COOKIE: token})
    yield emp
    await emp.aclose()


async def test_portal_sees_its_own_profile(portal, tenant):
    r = await portal.get("/me/profile")
    assert r.status_code == 200
    assert r.json()["id"] == tenant.employee_id


async def test_auth_me_flags_the_portal(portal):
    assert (await portal.get("/auth/me")).json()["employee_portal"] is True


async def test_admin_login_is_not_a_portal(client, tenant):
    assert (await client.get("/auth/me")).json()["employee_portal"] is False


async def test_portal_is_locked_out_of_admin_endpoints(portal):
    """The Employee role has no permissions, so every admin guard 403s it."""
    assert (await portal.get("/hrms/employees")).status_code == 403      # whole roster
    assert (await portal.get("/hrms/payroll")).status_code == 403        # everyone's pay
    assert (await portal.get("/crm/leads")).status_code == 403


async def test_portal_can_clock_itself_in(portal, tenant):
    r = await portal.post("/me/attendance/checkin")
    assert r.status_code == 201
    assert r.json()["employee_id"] == tenant.employee_id
    # And it shows up in their own month view.
    assert any(a["employee_id"] == tenant.employee_id
               for a in (await portal.get("/me/attendance")).json())


async def test_portal_requests_leave_for_itself_only(portal, tenant):
    from datetime import date, timedelta
    d = (date.today() + timedelta(days=5)).isoformat()
    # Even if it tries to file for someone else, the id is forced to the caller.
    r = await portal.post("/me/leave", json={
        "employee_id": "00000000-0000-0000-0000-000000000000",
        "request_type": "leave", "leave_type": "annual", "from_date": d, "to_date": d,
    })
    assert r.status_code == 201
    assert r.json()["employee_id"] == tenant.employee_id


async def test_portal_sees_only_its_own_payslip(portal, tenant):
    slips = (await portal.get("/me/payslips")).json()
    assert len(slips) == 1
    assert slips[0]["employee_id"] == tenant.employee_id


async def test_portal_balances_are_its_own(portal):
    balances = (await portal.get("/me/leave/balances")).json()
    assert {b["leave_type"] for b in balances} == {"annual", "sick", "casual"}


async def test_a_login_with_no_employee_link_is_403(client, tenant):
    """The admin owner is a valid login but not an employee — /me must refuse."""
    assert (await client.get("/me/profile")).status_code == 403
