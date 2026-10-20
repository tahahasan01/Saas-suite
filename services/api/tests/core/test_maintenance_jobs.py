"""The worker's maintenance jobs (migration 0048): audit partitions, retention
and detaching, and finalising attendance days nobody checked out of.

Each handler is called the way the worker calls it (inside a job context) and
is checked to do its work, and to find nothing left to do the second time.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

import asyncpg
import pytest_asyncio

from app import context, db, jobs
from app.config import settings
from app.routers import hrms

PKT = timezone(timedelta(hours=5))


async def _owner() -> asyncpg.Connection:
    return await asyncpg.connect(settings.database_url)


def _month_name(months_ahead: int) -> str:
    today = datetime.now(timezone.utc).date().replace(day=1)
    y, m = divmod(today.month - 1 + months_ahead, 12)
    return f"audit_log_y{today.year + y}m{m + 1:02d}"


async def _run(code: str, handler):
    """As the worker runs it: actor_kind 'job', request_id job:<code>:<run>."""
    with context.job(code, "4242"):
        return await handler()


@pytest_asyncio.fixture
async def pools():
    """The handlers use the app's pools (the client fixture opens them too)."""
    await db.connect()
    yield
    await db.disconnect()


# ── The schedule ────────────────────────────────────────────────────────────
async def test_the_maintenance_jobs_are_scheduled():
    conn = await _owner()
    try:
        rows = {r["code"]: r for r in await conn.fetch(
            """select code, run_every, active from scheduled_jobs
                where code in ('audit.partitions', 'audit.retention', 'audit.detach',
                               'hrms.finalise_open_days')""")}
    finally:
        await conn.close()
    assert {c: r["run_every"] for c, r in rows.items()} == {
        "audit.partitions": timedelta(days=1),
        # asyncpg reads '1 month' as 30 days; the database keeps calendar months.
        "audit.retention": timedelta(days=30),
        "audit.detach": timedelta(days=30),
        "hrms.finalise_open_days": timedelta(hours=1),
    }
    assert all(r["active"] for r in rows.values())
    assert {"audit.partitions", "audit.retention", "audit.detach", "hrms.finalise_open_days"} <= set(jobs.HANDLERS)


# ── Audit maintenance ───────────────────────────────────────────────────────
async def test_the_partitions_job_creates_the_months_ahead_once(pools):
    far = _month_name(3)
    conn = await _owner()
    try:   # as if the job had been down: the third month ahead is missing
        if await conn.fetchval("select to_regclass($1) is not null", far):
            await conn.execute(f"alter table audit_log detach partition {far}")
            await conn.execute(f"drop table {far}")
    finally:
        await conn.close()

    created = await _run("audit.partitions", jobs.run_audit_partitions)
    again = await _run("audit.partitions", jobs.run_audit_partitions)

    conn = await _owner()
    try:
        attached = {r[0] for r in await conn.fetch(
            "select inhrelid::regclass::text from pg_inherits where inhparent = 'audit_log'::regclass")}
    finally:
        await conn.close()
    assert far in created and again == []
    assert {_month_name(i) for i in range(4)} <= attached


async def test_the_retention_job_deletes_what_the_plan_no_longer_keeps_once(pools):
    t = uuid.uuid4()   # a tenant without a subscription: the Starter window (13 months)
    conn = await _owner()
    try:
        await conn.execute("insert into tenants (id, name, industry_type) values ($1, 'ret', 'retail')", t)
        for months in (2, 24):
            await conn.execute(
                """insert into audit_log (tenant_id, occurred_at, entity, entity_id, action)
                   values ($1, now() - make_interval(months => $2::int), 'user', $3, 'update')""",
                t, months, f"user-{months}")
    finally:
        await conn.close()

    deleted = await _run("audit.retention", jobs.run_audit_retention)
    again = await _run("audit.retention", jobs.run_audit_retention)

    conn = await _owner()
    try:
        kept = {r[0] for r in await conn.fetch(
            "select entity_id from audit_log where tenant_id=$1 and action='update'", t)}
        await conn.execute("delete from tenants where id=$1", t)
    finally:
        await conn.close()
    assert deleted >= 1 and again == 0
    assert kept == {"user-2"}


async def test_the_detach_job_detaches_expired_months_and_names_them_once(pools, caplog):
    conn = await _owner()
    try:
        await conn.execute("select audit_log_create_partition('2015-01-01')")
    finally:
        await conn.close()
    try:
        with caplog.at_level(logging.WARNING, logger="jobs"):
            detached = await _run("audit.detach", jobs.run_audit_detach)
        again = await _run("audit.detach", jobs.run_audit_detach)
        conn = await _owner()
        try:
            attached = await conn.fetchval(
                """select exists (select 1 from pg_inherits where inhparent = 'audit_log'::regclass
                                   and inhrelid = 'audit_log_y2015m01'::regclass)""")
            kept = await conn.fetchval("select to_regclass('audit_log_y2015m01') is not null")
        finally:
            await conn.close()
    finally:
        conn = await _owner()
        try:
            await conn.execute("drop table if exists audit_log_y2015m01")
        finally:
            await conn.close()
    assert "audit_log_y2015m01" in detached and again == []
    assert not attached and kept          # detached, never dropped by the job
    assert "audit_log_y2015m01" in caplog.text


# ── Attendance ──────────────────────────────────────────────────────────────
async def _stale_open_day(client, tenant) -> uuid.UUID:
    """A check-in with no check-out on a long-past shift day, left as it was
    derived at 09:00 that morning (open, counted present)."""
    emp = tenant.employee_id
    r = await client.post("/hrms/shifts", json={"name": f"S-{uuid.uuid4().hex[:6]}",
                                                 "start_time": "09:00", "end_time": "18:00"})
    assert r.status_code == 201, r.text
    r = await client.post(f"/hrms/shifts/{r.json()['id']}/assign",
                          json={"employee_id": emp, "date_from": "2025-01-01"})
    assert r.status_code == 201, r.text
    async with db.tenant_conn(tenant.tenant_id) as conn:
        row = await hrms._do_checkin(conn, emp, method="web", at=datetime(2025, 10, 7, 9, 0, tzinfo=PKT))
    conn = await _owner()
    try:
        await conn.execute("""update hrms_attendance set status='present', missing_checkout=false,
                                     final=false where id=$1""", row["id"])
    finally:
        await conn.close()
    return row["id"]


async def _day(att_id):
    conn = await _owner()
    try:
        return await conn.fetchrow("select status, missing_checkout, final from hrms_attendance where id=$1",
                                   att_id)
    finally:
        await conn.close()


async def test_the_attendance_job_judges_open_days_in_every_hrms_tenant_once(client, tenant):
    att = await _stale_open_day(client, tenant)
    first = await _run("hrms.finalise_open_days", jobs.run_finalise_open_days)
    assert tuple(await _day(att)) == ("absent", True, True)
    assert first["days"] >= 1 and first["failed"] == 0
    again = await _run("hrms.finalise_open_days", jobs.run_finalise_open_days)
    assert again["days"] == 0           # nothing left open in any tenant


async def test_the_attendance_job_skips_tenants_without_hrms(client, tenant):
    att = await _stale_open_day(client, tenant)
    conn = await _owner()
    try:
        await conn.execute("update entitlements set enabled=false where tenant_id=$1 and section_key='hrms'",
                           uuid.UUID(tenant.tenant_id))
    finally:
        await conn.close()
    await _run("hrms.finalise_open_days", jobs.run_finalise_open_days)
    assert tuple(await _day(att)) == ("present", False, False)


async def test_the_attendance_job_runs_as_the_job_in_each_tenant(client, tenant, monkeypatch):
    """Each tenant's pass opens a job_conn: RLS-scoped, audited as this run."""
    seen: list[tuple[str, str, str]] = []
    real = jobs.attendance.finalise_open_days

    async def spy(conn, *a, **kw):
        seen.append(tuple(await conn.fetchrow(
            """select current_setting('app.tenant_id', true), current_setting('app.actor_kind', true),
                      current_setting('app.request_id', true)""")))
        return await real(conn, *a, **kw)

    monkeypatch.setattr(jobs.attendance, "finalise_open_days", spy)
    await _run("hrms.finalise_open_days", jobs.run_finalise_open_days)
    mine = [s for s in seen if s[0] == tenant.tenant_id]
    assert mine == [(tenant.tenant_id, "job", "job:hrms.finalise_open_days:4242")]
