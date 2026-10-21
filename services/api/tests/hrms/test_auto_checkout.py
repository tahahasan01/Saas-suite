"""Auto check-out per shift policy and overtime (St03 P1, checklist 3F).

A day left open is closed by a `method='auto'` punch at the policy's time.
Phase 2's rule stands: a day without a real check-out is never paid as
present, so the auto-closed interval counts 0 minutes, the day is flagged
`auto_closed` (and `missing_checkout`) and earns no overtime, until an
approved correction supplies the real time."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import asyncpg

from app import attendance, db
from app.config import settings
from app.routers import hrms

PKT = timezone(timedelta(hours=5))


def pkt(y, mo, d, h, mi=0) -> datetime:
    return datetime(y, mo, d, h, mi, tzinfo=PKT)


async def _shift(client, emp, **policy) -> dict:
    r = await client.post("/hrms/shifts", json={"name": f"S-{uuid.uuid4().hex[:6]}",
                                                "start_time": "09:00", "end_time": "18:00"})
    shift = r.json()
    if policy:
        r = await client.patch(f"/hrms/shifts/{shift['id']}/policy", json=policy)
        assert r.status_code == 200, r.text
        shift = r.json()
    r = await client.post(f"/hrms/shifts/{shift['id']}/assign", json={"employee_id": emp, "date_from": "2025-01-01"})
    assert r.status_code == 201, r.text
    return shift


async def _in(tenant, emp, when):
    async with db.tenant_conn(tenant.tenant_id) as conn:
        await hrms._do_checkin(conn, emp, method="web", at=when)


async def _out(tenant, emp, when):
    async with db.tenant_conn(tenant.tenant_id) as conn:
        await hrms._do_checkout(conn, emp, at=when)


async def _auto(tenant, now) -> int:
    async with db.tenant_conn(tenant.tenant_id) as conn:
        return await attendance.auto_checkout(conn, now=now)


async def _day(tenant, emp, d):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetchrow("select * from hrms_attendance where employee_id=$1 and work_date=$2",
                                   uuid.UUID(emp), d)
    finally:
        await conn.close()


async def _punches(emp):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch("select kind, method, at from hrms_punches where employee_id=$1 order by at",
                                uuid.UUID(emp))
    finally:
        await conn.close()


async def test_policy_fields_show_on_the_shift(client, tenant):
    shift = await _shift(client, tenant.employee_id, auto_checkout="shift_end", overtime_after_min=45)
    assert (shift["auto_checkout"], shift["overtime_after_min"]) == ("shift_end", 45)
    listed = next(s for s in (await client.get("/hrms/shifts")).json() if s["id"] == shift["id"])
    assert listed["auto_checkout"] == "shift_end"
    r = await client.patch(f"/hrms/shifts/{shift['id']}/policy", json={"auto_checkout": "sometimes"})
    assert r.status_code == 422


async def test_shift_end_policy_closes_the_day_at_the_end(client, tenant):
    emp = tenant.employee_id
    await _shift(client, emp, auto_checkout="shift_end")
    await _in(tenant, emp, pkt(2030, 10, 22, 9, 0))
    assert await _auto(tenant, pkt(2030, 10, 22, 17, 0)) == 0          # shift not over yet
    assert await _auto(tenant, pkt(2030, 10, 22, 19, 0)) == 1
    assert await _auto(tenant, pkt(2030, 10, 22, 20, 0)) == 0          # idempotent
    punches = await _punches(emp)
    assert [(p["kind"], p["method"]) for p in punches] == [("in", "web"), ("out", "auto")]
    assert punches[1]["at"] == pkt(2030, 10, 22, 18, 0)
    day = await _day(tenant, emp, pkt(2030, 10, 22, 12).date())
    assert day["auto_closed"] and day["missing_checkout"]
    assert day["worked_min"] == 0 and day["overtime_min"] == 0
    assert day["status"] == "absent"                       # never paid as present without a check-out


async def test_max_hours_policy_closes_after_n_minutes(client, tenant):
    emp = tenant.employee_id
    await _shift(client, emp, auto_checkout="max_hours", auto_checkout_after_min=600)
    await _in(tenant, emp, pkt(2030, 10, 22, 8, 0))
    assert await _auto(tenant, pkt(2030, 10, 22, 17, 59)) == 0
    assert await _auto(tenant, pkt(2030, 10, 22, 18, 1)) == 1
    assert (await _punches(emp))[-1]["at"] == pkt(2030, 10, 22, 18, 0)


async def test_policy_off_leaves_the_day_to_finalising(client, tenant):
    emp = tenant.employee_id
    await _shift(client, emp)
    await _in(tenant, emp, pkt(2030, 10, 22, 9, 0))
    assert await _auto(tenant, pkt(2030, 10, 23, 9, 0)) == 0
    assert [p["kind"] for p in await _punches(emp)] == ["in"]


async def test_a_closed_day_is_left_alone(client, tenant):
    emp = tenant.employee_id
    await _shift(client, emp, auto_checkout="shift_end")
    await _in(tenant, emp, pkt(2030, 10, 22, 9, 0))
    await _out(tenant, emp, pkt(2030, 10, 22, 18, 0))
    assert await _auto(tenant, pkt(2030, 10, 22, 23, 0)) == 0


async def test_overtime_after_the_threshold(client, tenant):
    emp = tenant.employee_id
    await _shift(client, emp, overtime_after_min=30)
    await _in(tenant, emp, pkt(2030, 10, 22, 9, 0))
    await _out(tenant, emp, pkt(2030, 10, 22, 19, 15))
    day = await _day(tenant, emp, pkt(2030, 10, 22, 12).date())
    assert day["overtime_min"] == 45 and not day["auto_closed"]


async def test_a_real_check_out_after_the_auto_one_counts(client, tenant):
    """Someone still working when the job closed the day punches out later:
    the real time wins and the flag clears."""
    emp = tenant.employee_id
    await _shift(client, emp, auto_checkout="shift_end", overtime_after_min=30)
    await _in(tenant, emp, pkt(2030, 10, 22, 9, 0))
    await _auto(tenant, pkt(2030, 10, 22, 18, 20))
    await _out(tenant, emp, pkt(2030, 10, 22, 19, 0))
    day = await _day(tenant, emp, pkt(2030, 10, 22, 12).date())
    assert not day["auto_closed"] and day["worked_min"] == 10 * 60
    assert day["overtime_min"] == 30


async def test_the_job_is_registered(client, tenant):
    from app import jobs
    assert "hrms.auto_checkout" in jobs.HANDLERS
    conn = await asyncpg.connect(settings.database_url)
    try:
        every = await conn.fetchval("select run_every from scheduled_jobs where code='hrms.auto_checkout'")
    finally:
        await conn.close()
    assert every == timedelta(minutes=15)
