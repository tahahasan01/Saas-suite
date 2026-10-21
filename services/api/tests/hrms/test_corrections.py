"""Attendance correction requests: an employee asks, their manager (or HR)
decides, never themselves; approval adds correction punches — the log stays
append-only — and re-derives the day (St03 P1, TR-SEC-33)."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import asyncpg
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import db
from app.config import settings
from app.main import app
from app.routers import hrms
from app.security import SESSION_COOKIE

from .test_employee_portal import _link_login

PKT = timezone(timedelta(hours=5))
DAY = date(2030, 10, 22)


def pkt(h, mi=0, d=DAY) -> datetime:
    return datetime(d.year, d.month, d.day, h, mi, tzinfo=PKT)


async def _client_for(tenant, employee_id) -> AsyncClient:
    token = await _link_login(tenant.tenant_id, employee_id, f"c+{uuid.uuid4().hex[:8]}@example.com")
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test", cookies={SESSION_COOKIE: token})


async def make_approver(tenant, employee_id: str) -> None:
    """Move the employee's login onto a supervisor role that carries the
    approve keys (hrms admin, until RBAC v2 narrows it)."""
    conn = await asyncpg.connect(settings.database_url)
    try:
        tid = uuid.UUID(tenant.tenant_id)
        role = await conn.fetchval(
            """insert into roles (tenant_id, name, is_system) values ($1, 'Supervisor', false)
               on conflict (tenant_id, name) do update set name = excluded.name returning id""", tid)
        await conn.execute(
            """insert into permissions (tenant_id, role_id, section, action) values ($1, $2, 'hrms', 'admin')
               on conflict do nothing""", tid, role)
        uid = await conn.fetchval("select user_id from hrms_employees where id=$1", uuid.UUID(employee_id))
        await conn.execute("update users set role_id=$1 where id=$2", role, uid)
        # A role change revokes sessions (D-05); keep the test's session alive.
        await conn.execute(
            "update sessions s set auth_epoch = u.auth_epoch from users u where u.id = s.user_id and u.id = $1", uid)
    finally:
        await conn.close()


@pytest_asyncio.fixture
async def team(client, tenant):
    """(worker client, manager client, worker id, manager id): the worker
    reports to the manager; both have portal logins, and the manager's role
    carries the approve keys."""
    staff = [e["id"] for e in (await client.get("/hrms/employees")).json()]
    worker, manager = staff[0], staff[1]
    await client.patch(f"/hrms/employees/{worker}/job", json={"manager_id": manager})
    w = await _client_for(tenant, worker)
    m = await _client_for(tenant, manager)
    await make_approver(tenant, manager)
    yield w, m, worker, manager
    await w.aclose()
    await m.aclose()


async def _forgot_checkout(tenant, emp):
    async with db.tenant_conn(tenant.tenant_id) as conn:
        await hrms._do_checkin(conn, emp, method="web", at=pkt(9, 0))


async def _day(emp):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetchrow("select * from hrms_attendance where employee_id=$1 and work_date=$2",
                                   uuid.UUID(emp), DAY)
    finally:
        await conn.close()


async def _ask(w, **over):
    body = {"work_date": DAY.isoformat(), "requested_out": pkt(18, 0).isoformat(), "reason": "Forgot to clock out"}
    return await w.post("/me/attendance/corrections", json={**body, **over})


async def test_the_manager_approves_and_the_day_is_rederived(client, tenant, team):
    w, m, worker, _ = team
    await _forgot_checkout(tenant, worker)
    r = await _ask(w)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    assert r.json()["status"] == "pending"
    inbox = (await m.get("/me/approvals")).json()
    assert [c["id"] for c in inbox["corrections"]] == [cid]
    r = await m.post(f"/hrms/attendance/corrections/{cid}/approve", json={"note": "ok"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"
    day = await _day(worker)
    assert day["check_out"] == pkt(18, 0) and day["worked_min"] == 9 * 60
    assert day["corrected"] and not day["missing_checkout"]
    conn = await asyncpg.connect(settings.database_url)
    try:
        kinds = [(p["kind"], p["method"]) for p in await conn.fetch(
            "select kind, method from hrms_punches where employee_id=$1 order by at", uuid.UUID(worker))]
        audited = await conn.fetchval(
            "select count(*) from audit_log where entity='hrms_attendance_corrections' and entity_id=$1", cid)
    finally:
        await conn.close()
    assert kinds == [("in", "web"), ("out", "correction")]          # appended, nothing rewritten
    assert audited >= 2                                              # the request and the decision


async def test_a_correction_replaces_the_wrong_time(client, tenant, team):
    w, m, worker, _ = team
    async with db.tenant_conn(tenant.tenant_id) as conn:
        await hrms._do_checkin(conn, worker, method="web", at=pkt(11, 0))   # clocked in late by mistake
        await hrms._do_checkout(conn, worker, at=pkt(18, 0))
    cid = (await _ask(w, requested_in=pkt(9, 0).isoformat(), requested_out=None)).json()["id"]
    await m.post(f"/hrms/attendance/corrections/{cid}/approve", json={})
    day = await _day(worker)
    assert day["check_in"] == pkt(9, 0) and day["worked_min"] == 9 * 60


async def test_nobody_decides_their_own_correction(client, tenant, team):
    w, _, worker, _ = team
    await _forgot_checkout(tenant, worker)
    cid = (await _ask(w)).json()["id"]
    # The worker has no key and isn't their own manager.
    assert (await w.post(f"/hrms/attendance/corrections/{cid}/approve", json={})).status_code == 403
    # HR who is also the requester can't either.
    me = (await client.get("/auth/me")).json()["user"]["id"]
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute("update hrms_employees set user_id=null where id=$1", uuid.UUID(worker))
        await conn.execute("update hrms_employees set user_id=$1 where id=$2", uuid.UUID(me), uuid.UUID(worker))
    finally:
        await conn.close()
    assert (await client.post(f"/hrms/attendance/corrections/{cid}/approve", json={})).status_code == 403


async def test_being_the_manager_is_not_enough_without_the_approve_key(client, tenant):
    """Security review: the reporting link alone must not grant approval."""
    staff = [e["id"] for e in (await client.get("/hrms/employees")).json()]
    worker, manager = staff[0], staff[1]
    await client.patch(f"/hrms/employees/{worker}/job", json={"manager_id": manager})
    w = await _client_for(tenant, worker)
    m = await _client_for(tenant, manager)       # the zero-permission Employee role
    try:
        await _forgot_checkout(tenant, worker)
        cid = (await _ask(w)).json()["id"]
        assert (await m.post(f"/hrms/attendance/corrections/{cid}/approve", json={})).status_code == 403
        assert (await m.get("/me/approvals")).json()["corrections"] == []
        assert (await _day(worker))["check_out"] is None
    finally:
        await w.aclose()
        await m.aclose()


async def test_someone_elses_manager_cannot_decide(client, tenant, team):
    w, _, worker, _ = team
    staff = [e["id"] for e in (await client.get("/hrms/employees")).json()]
    stranger = await _client_for(tenant, staff[2])
    try:
        await _forgot_checkout(tenant, worker)
        cid = (await _ask(w)).json()["id"]
        assert (await stranger.post(f"/hrms/attendance/corrections/{cid}/approve", json={})).status_code == 403
        assert (await stranger.get("/me/approvals")).json()["corrections"] == []
    finally:
        await stranger.aclose()


async def test_hr_decides_once(client, tenant, team):
    w, _, worker, _ = team
    await _forgot_checkout(tenant, worker)
    cid = (await _ask(w)).json()["id"]
    pending = (await client.get("/hrms/attendance/corrections?status=pending")).json()
    assert [c["id"] for c in pending] == [cid]
    assert (await client.post(f"/hrms/attendance/corrections/{cid}/reject", json={"note": "no"})).status_code == 200
    assert (await client.post(f"/hrms/attendance/corrections/{cid}/approve", json={})).status_code == 409
    assert (await _day(worker))["check_out"] is None                 # a rejection changes nothing


async def test_a_bad_request_is_refused(client, tenant, team):
    w, _, worker, _ = team
    assert (await _ask(w, requested_out=None)).status_code == 422                  # nothing to correct
    r = await _ask(w, requested_in=pkt(18, 0).isoformat(), requested_out=pkt(9, 0).isoformat())
    assert r.status_code == 422                                                    # out before in
    assert (await _ask(w, reason="")).status_code == 422
    await _forgot_checkout(tenant, worker)
    assert (await _ask(w)).status_code == 201
    assert (await _ask(w)).status_code == 409                                      # one pending per day


async def test_a_locked_day_cannot_be_corrected(client, tenant, team):
    w, m, worker, _ = team
    await _forgot_checkout(tenant, worker)
    cid = (await _ask(w)).json()["id"]
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute("update hrms_attendance set locked=true where employee_id=$1", uuid.UUID(worker))
    finally:
        await conn.close()
    assert (await m.post(f"/hrms/attendance/corrections/{cid}/approve", json={})).status_code == 409
