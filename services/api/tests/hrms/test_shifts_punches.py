"""Shifts and the punch log against a real database (D-43, checklist 2I).

Punches are the evidence and append-only; the daily hrms_attendance row is
derived from them per the employee's shift in the tenant's timezone. Punch
instants are passed in, so the boundaries are tested at any wall-clock time.
PKT is UTC+5 with no daylight saving.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone

import asyncpg
import pytest

from app import attendance, db
from app.config import settings
from app.routers import hrms


PKT = timezone(timedelta(hours=5))


def pkt(y, mo, d, h, mi=0, s=0) -> datetime:
    """A Pakistan wall-clock time, as an instant."""
    return datetime(y, mo, d, h, mi, s, tzinfo=PKT)


async def _staff(client) -> list[str]:
    return [e["id"] for e in (await client.get("/hrms/employees")).json()]


async def _shift(client, employee_id: str, *, date_from="2025-01-01", **body) -> dict:
    r = await client.post("/hrms/shifts", json={"name": f"S-{uuid.uuid4().hex[:6]}", **body})
    assert r.status_code == 201, r.text
    shift = r.json()
    r = await client.post(f"/hrms/shifts/{shift['id']}/assign",
                          json={"employee_id": employee_id, "date_from": date_from})
    assert r.status_code == 201, r.text
    return shift


async def _in(tenant, emp, when, **kw):
    async with db.tenant_conn(tenant.tenant_id) as conn:
        row = await hrms._do_checkin(conn, emp, method=kw.pop("method", "web"), at=when, **kw)
        return await conn.fetchrow("select * from hrms_attendance where id=$1", row["id"])


async def _out(tenant, emp, when):
    async with db.tenant_conn(tenant.tenant_id) as conn:
        row = await hrms._do_checkout(conn, emp, at=when)
        return None if row is None else await conn.fetchrow(
            "select * from hrms_attendance where id=$1", row["id"])


async def _punches(tenant, emp):
    async with db.tenant_conn(tenant.tenant_id) as conn:
        return await conn.fetch(
            "select kind, at, work_date, method from hrms_punches where employee_id=$1 order by at", emp)


def test_pkt_helper():
    assert pkt(2030, 10, 22, 9, 16) == datetime(2030, 10, 22, 4, 16, tzinfo=timezone.utc)
    assert pkt(2030, 10, 22, 0, 30) == datetime(2030, 10, 21, 19, 30, tzinfo=timezone.utc)


# ── The punch log ───────────────────────────────────────────────────────────
async def test_every_punch_is_kept_and_the_day_is_derived_from_them(client, tenant):
    emp = tenant.employee_id
    await _in(tenant, emp, pkt(2030, 10, 22, 9, 0))
    await _in(tenant, emp, pkt(2030, 10, 22, 9, 30))           # a double tap
    await _out(tenant, emp, pkt(2030, 10, 22, 13, 0))
    day = await _out(tenant, emp, pkt(2030, 10, 22, 18, 0))     # a second check-out
    kinds = [p["kind"] for p in await _punches(tenant, emp)]
    assert kinds == ["in", "in", "out", "out"]                  # nothing overwritten
    assert day["check_in"] == pkt(2030, 10, 22, 9, 0)           # the first in …
    assert day["check_out"] == pkt(2030, 10, 22, 18, 0)         # … and the last out
    assert day["worked_min"] == 9 * 60


async def test_punches_are_append_only_for_the_app(client, tenant):
    await _in(tenant, tenant.employee_id, pkt(2030, 10, 22, 9, 0))
    for sql in ("update hrms_punches set at = now()", "delete from hrms_punches"):
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with db.tenant_conn(tenant.tenant_id) as conn:
                await conn.execute(sql)
    assert len(await _punches(tenant, tenant.employee_id)) == 1


async def test_the_api_check_in_and_out_write_punches(client, tenant):
    emp = tenant.employee_id
    r = await client.post("/hrms/attendance/checkin", json={"employee_id": emp, "method": "mobile",
                                                            "lat": 31.5, "lng": 74.3})
    assert r.status_code == 200, r.text
    r = await client.post("/hrms/attendance/checkout", json={"employee_id": emp})
    assert r.status_code == 200, r.text
    assert r.json()["check_out"] is not None
    punches = await _punches(tenant, emp)
    assert [(p["kind"], p["method"]) for p in punches] == [("in", "mobile"), ("out", "web")]


async def test_check_out_without_a_check_in_is_refused_and_leaves_no_punch(client, tenant):
    assert await _out(tenant, tenant.employee_id, pkt(2030, 10, 22, 18, 0)) is None
    assert await _punches(tenant, tenant.employee_id) == []
    r = await client.post("/hrms/attendance/checkout", json={"employee_id": tenant.employee_id})
    assert r.status_code == 409


# ── Shift boundaries (09:00–18:00, 15 min late grace, 10 min early grace) ───
async def test_late_and_early_at_the_shift_boundaries(client, tenant):
    a, b, c = (await _staff(client))[:3]
    for e in (a, b, c):
        await _shift(client, e, start_time="09:00", end_time="18:00", grace_in_min=15, grace_out_min=10)

    on_time = await _in(tenant, a, pkt(2030, 10, 22, 9, 15))
    late = await _in(tenant, b, pkt(2030, 10, 22, 9, 16))
    assert (on_time["status"], on_time["late_min"]) == ("present", 0)
    assert (late["status"], late["late_min"]) == ("late", 1)
    assert late["shift_id"] is not None

    left_ok = await _out(tenant, a, pkt(2030, 10, 22, 17, 50))
    left_early = await _out(tenant, b, pkt(2030, 10, 22, 17, 49))
    assert left_ok["early_min"] == 0
    assert left_early["early_min"] == 1
    assert left_early["status"] == "late"                      # early is a flag, not a status

    # Half day below 240 worked minutes, absent below 120 (the defaults).
    await _in(tenant, c, pkt(2030, 10, 22, 9, 0))
    assert (await _out(tenant, c, pkt(2030, 10, 22, 12, 59)))["status"] == "half_day"


async def test_a_very_short_day_is_an_absence_and_payroll_agrees(client, tenant):
    emp = tenant.employee_id
    await _shift(client, emp, start_time="09:00", end_time="18:00")
    await _in(tenant, emp, pkt(2025, 10, 7, 9, 0))
    day = await _out(tenant, emp, pkt(2025, 10, 7, 10, 0))
    assert (day["status"], day["worked_min"]) == ("absent", 60)

    slip = next(p for p in (await client.get("/hrms/payroll?month=2025-10")).json()["payslips"]
                if p["employee_id"] == emp)
    assert slip["present_days"] == 0                           # an hour is not a day's evidence


async def test_a_half_day_costs_half_a_days_pay(client, tenant):
    emp = tenant.employee_id
    await _shift(client, emp, start_time="09:00", end_time="18:00")
    await _in(tenant, emp, pkt(2025, 10, 7, 9, 0))
    await _out(tenant, emp, pkt(2025, 10, 7, 12, 0))           # 180 min: a half day
    run = (await client.get("/hrms/payroll?month=2025-10")).json()
    slip = next(p for p in run["payslips"] if p["employee_id"] == emp)
    assert slip["half_days"] == 1
    assert slip["present_days"] == 1
    # The tenant was created today, so no October 2025 day is judged absent;
    # the only deduction is the half day.
    assert slip["absent_days"] == 0
    assert slip["absence_deduction_minor"] == round(0.5 * slip["gross_minor"] / run["working_days"])


# ── Overnight shifts and the 00:00–05:00 PKT edge ───────────────────────────
async def test_an_overnight_shift_keeps_the_night_on_its_start_date(client, tenant):
    night, day_worker, late_night = (await _staff(client))[:3]
    await _shift(client, night, start_time="22:00", end_time="06:00", grace_in_min=15)
    await _shift(client, late_night, start_time="22:00", end_time="06:00", grace_in_min=15)

    start = await _in(tenant, night, pkt(2030, 10, 21, 22, 20))
    assert (start["work_date"], start["status"], start["late_min"]) == (date(2030, 10, 21), "late", 5)
    # 06:00 on the 22nd closes the 21st's shift — no 409 for "no check-in today".
    end = await _out(tenant, night, pkt(2030, 10, 22, 6, 0))
    assert end is not None and end["id"] == start["id"]
    assert (end["work_date"], end["worked_min"], end["early_min"]) == (date(2030, 10, 21), 460, 0)
    assert {p["work_date"] for p in await _punches(tenant, night)} == {date(2030, 10, 21)}

    # 00:30 PKT is the 21st in UTC and the 22nd locally. On a night shift it
    # is 2.5 hours late for the 21st's 22:00 start …
    rec = await _in(tenant, late_night, pkt(2030, 10, 22, 0, 30))
    assert (rec["work_date"], rec["late_min"]) == (date(2030, 10, 21), 135)
    # … and with no shift it is simply the 22nd, as before (test_tenant_clock).
    rec = await _in(tenant, day_worker, pkt(2030, 10, 22, 0, 30))
    assert (rec["work_date"], rec["status"]) == (date(2030, 10, 22), "present")


async def test_after_the_cutoff_a_night_worker_starts_the_new_night(client, tenant):
    emp = tenant.employee_id
    await _shift(client, emp, start_time="22:00", end_time="06:00")
    # 21:50 on the 22nd: early for the 22nd's shift, not late for the 21st's.
    rec = await _in(tenant, emp, pkt(2030, 10, 22, 21, 50))
    assert (rec["work_date"], rec["status"]) == (date(2030, 10, 22), "present")


async def test_a_day_shift_punch_at_0030_belongs_to_the_new_day(client, tenant):
    emp = tenant.employee_id
    await _shift(client, emp, start_time="09:00", end_time="18:00")
    rec = await _in(tenant, emp, pkt(2030, 10, 1, 0, 30))      # 30 Sep 19:30 UTC
    assert rec["work_date"] == date(2030, 10, 1)
    assert rec["status"] == "present"                          # before the start is never late


# ── Shift API and assignments ───────────────────────────────────────────────
async def test_shifts_are_created_listed_and_assigned(client, tenant):
    r = await client.post("/hrms/shifts", json={"name": "Night", "start_time": "22:00", "end_time": "06:00"})
    assert r.status_code == 201, r.text
    night = r.json()
    assert night["overnight"] is True
    assert (night["grace_in_min"], night["half_day_below_min"], night["absent_below_min"]) == (15, 240, 120)
    assert [s["name"] for s in (await client.get("/hrms/shifts")).json()] == ["Night"]
    assert (await client.post("/hrms/shifts", json={"name": "Night"})).status_code == 409
    # Thresholds must nest, and a shift can't start when it ends.
    assert (await client.post("/hrms/shifts", json={"name": "Bad", "half_day_below_min": 60,
                                                    "absent_below_min": 120})).status_code == 422
    assert (await client.post("/hrms/shifts", json={"name": "Zero", "start_time": "09:00",
                                                    "end_time": "09:00"})).status_code == 422

    day = (await client.post("/hrms/shifts", json={"name": "Day"})).json()
    emp = tenant.employee_id
    assert (await client.post(f"/hrms/shifts/{night['id']}/assign",
                              json={"employee_id": emp, "date_from": "2026-01-01"})).status_code == 201
    # A later assignment closes the open one the day before it starts.
    assert (await client.post(f"/hrms/shifts/{day['id']}/assign",
                              json={"employee_id": emp, "date_from": "2026-03-01"})).status_code == 201
    rows = (await client.get(f"/hrms/shift-assignments?employee_id={emp}")).json()
    assert [(r["shift_name"], r["date_from"], r["date_to"]) for r in rows] == [
        ("Night", "2026-01-01", "2026-02-28"), ("Day", "2026-03-01", None)]
    # One that would sit inside an existing span is refused.
    r = await client.post(f"/hrms/shifts/{night['id']}/assign",
                          json={"employee_id": emp, "date_from": "2026-01-10", "date_to": "2026-01-20"})
    assert r.status_code == 409

    async with db.tenant_conn(tenant.tenant_id) as conn:
        assert (await attendance.shift_for(conn, emp, date(2026, 2, 28))).name == "Night"
        assert (await attendance.shift_for(conn, emp, date(2026, 3, 1))).name == "Day"
        assert await attendance.shift_for(conn, emp, date(2025, 12, 31)) is None


async def test_assigning_another_tenants_employee_or_shift_is_a_404(client, tenant):
    shift = (await client.post("/hrms/shifts", json={"name": "Day"})).json()
    r = await client.post(f"/hrms/shifts/{shift['id']}/assign",
                          json={"employee_id": str(uuid.uuid4()), "date_from": "2026-01-01"})
    assert r.status_code == 404
    r = await client.post(f"/hrms/shifts/{uuid.uuid4()}/assign",
                          json={"employee_id": tenant.employee_id, "date_from": "2026-01-01"})
    assert r.status_code == 404


async def test_shift_rules_need_hrms_admin(client, tenant):
    from .test_payroll_access import _login_with_role

    clerk = await _login_with_role(client, "HR clerk", {"hrms": ["read", "write"]})
    try:
        assert (await clerk.post("/hrms/shifts", json={"name": "Mine"})).status_code == 403
        shift = (await client.post("/hrms/shifts", json={"name": "Day"})).json()
        assert (await clerk.get("/hrms/shifts")).status_code == 200
        # Rostering is day-to-day HR work: hrms:write assigns.
        r = await clerk.post(f"/hrms/shifts/{shift['id']}/assign",
                             json={"employee_id": tenant.employee_id, "date_from": "2026-01-01"})
        assert r.status_code == 201, r.text
    finally:
        await clerk.aclose()


# ── Locked days ─────────────────────────────────────────────────────────────
async def test_a_locked_day_keeps_its_derivation(client, tenant):
    emp = tenant.employee_id
    day = await _in(tenant, emp, pkt(2030, 10, 22, 9, 0))
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute("update hrms_attendance set locked = true where id=$1", day["id"])
    finally:
        await owner.close()
    after = await _out(tenant, emp, pkt(2030, 10, 22, 18, 0))
    assert after["id"] == day["id"]
    assert after["check_out"] is None                         # the punch is kept, the day is not moved
    assert [p["kind"] for p in await _punches(tenant, emp)] == ["in", "out"]


# ── Backfill (§7.6) and payroll on existing data ────────────────────────────
async def _legacy_rows(tenant, emps) -> None:
    """Rows as the pre-0045 check-in wrote them: no punches, status judged
    against late_after."""
    owner = await asyncpg.connect(settings.database_url)
    try:
        tid = uuid.UUID(tenant.tenant_id)
        await owner.execute(
            """insert into hrms_attendance (tenant_id, employee_id, work_date, check_in, check_out,
                                            status, method, lat, lng, fraud_flag)
               values ($1, $2, '2025-10-07', '2025-10-07 04:00Z', '2025-10-07 13:00Z', 'present', 'mobile', 31.5, 74.3, ''),
                      ($1, $3, '2025-10-07', '2025-10-07 05:30Z', null,               'late',    'web',    null, null, 'mock_gps')""",
            tid, uuid.UUID(emps[0]), uuid.UUID(emps[1]))
    finally:
        await owner.close()


async def _backfill() -> int:
    owner = await asyncpg.connect(settings.database_url)
    try:
        return await owner.fetchval("select hrms_backfill_punches()")
    finally:
        await owner.close()


async def test_backfill_turns_rows_into_punches_once(client, tenant):
    emps = (await _staff(client))[:2]
    await _legacy_rows(tenant, emps)
    assert await _backfill() >= 3
    a, b = await _punches(tenant, emps[0]), await _punches(tenant, emps[1])
    assert [(p["kind"], p["method"], p["work_date"]) for p in a] == [
        ("in", "mobile", date(2025, 10, 7)), ("out", "mobile", date(2025, 10, 7))]
    assert [p["kind"] for p in b] == ["in"]                    # no check-out, no out punch
    async with db.tenant_conn(tenant.tenant_id) as conn:
        carried = await conn.fetchrow(
            "select lat, lng, fraud_flag from hrms_punches where employee_id=$1 and kind='in'", uuid.UUID(emps[1]))
        assert carried["fraud_flag"] == "mock_gps"
        first = await conn.fetchrow(
            "select lat, lng from hrms_punches where employee_id=$1 and kind='in'", uuid.UUID(emps[0]))
        assert (first["lat"], first["lng"]) == (31.5, 74.3)
    assert await _backfill() == 0                              # idempotent
    assert len(await _punches(tenant, emps[0])) == 2


async def test_rederiving_backfilled_days_reproduces_their_status(client, tenant):
    """§7.6: the derivation from punches equals the stored status for rows
    the local-time check-in wrote (late_after 10:00 by default)."""
    emps = (await _staff(client))[:2]
    await _legacy_rows(tenant, emps)
    await _backfill()
    async with db.tenant_conn(tenant.tenant_id) as conn:
        stored = {r["employee_id"]: r["status"] for r in await conn.fetch(
            "select employee_id, status from hrms_attendance where work_date='2025-10-07'")}
        for emp in emps:
            derived = await attendance.preview(conn, emp, date(2025, 10, 7))
            assert derived.status == stored[uuid.UUID(emp)]


async def test_payroll_on_existing_data_is_unchanged_by_the_backfill(client, tenant):
    emps = (await _staff(client))[:2]
    await _legacy_rows(tenant, emps)
    before = (await client.get("/hrms/payroll?month=2025-10")).json()
    await _backfill()
    after = (await client.get("/hrms/payroll?month=2025-10")).json()
    assert after == before
    slips = {p["employee_id"]: p for p in after["payslips"]}
    assert slips[emps[0]]["present_days"] == slips[emps[1]]["present_days"] == 1
    assert slips[emps[0]]["half_days"] == 0


async def test_without_a_shift_late_after_still_decides(client, tenant):
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute("update tenants set late_after=$1 where id=$2", time(9, 15), uuid.UUID(tenant.tenant_id))
    finally:
        await owner.close()
    a, b = (await _staff(client))[:2]
    late = await _in(tenant, a, pkt(2030, 10, 22, 9, 16))
    on_time = await _in(tenant, b, pkt(2030, 10, 22, 9, 10))
    assert (late["status"], late["late_min"], late["shift_id"]) == ("late", 1, None)
    assert (on_time["status"], on_time["late_min"]) == ("present", 0)
    # A short day without a shift is never a half day: there is no threshold.
    assert (await _out(tenant, b, pkt(2030, 10, 22, 9, 30)))["status"] == "present"


# ── Days nobody checked out of (security review: payroll must not fail open) ─
async def _finalise(tenant, emp=None, now=None):
    async with db.tenant_conn(tenant.tenant_id) as conn:
        await attendance.finalise_open_days(conn, emp, now=now)
        return {r["work_date"]: r for r in await conn.fetch(
            "select * from hrms_attendance where ($1::uuid is null or employee_id=$1::uuid)", emp)}


async def test_a_check_in_with_no_check_out_is_judged_once_the_shift_is_over(client, tenant):
    emp = tenant.employee_id
    await _shift(client, emp, start_time="09:00", end_time="18:00", grace_out_min=10)
    day = await _in(tenant, emp, pkt(2025, 10, 7, 9, 0))
    assert day["final"] is True                                # judged on the spot: the day is long over
    assert (day["status"], day["worked_min"], day["missing_checkout"]) == ("absent", 0, True)
    # Payroll does not pay a full day for a check-in alone.
    slip = next(p for p in (await client.get("/hrms/payroll?month=2025-10")).json()["payslips"]
                if p["employee_id"] == emp)
    assert slip["present_days"] == 0


async def test_before_the_shift_ends_an_open_day_is_in_progress(client, tenant):
    emp = tenant.employee_id
    await _shift(client, emp, start_time="09:00", end_time="18:00", grace_out_min=10)
    day = await _in(tenant, emp, pkt(2030, 10, 22, 9, 0))      # a day that hasn't ended
    assert (day["status"], day["missing_checkout"], day["final"]) == ("present", False, False)
    # A worker re-deriving open days at 18:05 changes nothing; at 18:10 the day is over.
    rows = await _finalise(tenant, emp, now=pkt(2030, 10, 22, 18, 5))
    assert (rows[date(2030, 10, 22)]["status"], rows[date(2030, 10, 22)]["final"]) == ("present", False)
    rows = await _finalise(tenant, emp, now=pkt(2030, 10, 22, 18, 10))
    r = rows[date(2030, 10, 22)]
    assert (r["status"], r["missing_checkout"], r["final"]) == ("absent", True, True)


async def test_an_open_overnight_shift_ends_the_next_morning(client, tenant):
    emp = tenant.employee_id
    await _shift(client, emp, start_time="22:00", end_time="06:00", grace_out_min=10)
    await _in(tenant, emp, pkt(2030, 10, 21, 22, 0))
    rows = await _finalise(tenant, emp, now=pkt(2030, 10, 22, 6, 5))
    assert rows[date(2030, 10, 21)]["final"] is False          # still on shift
    rows = await _finalise(tenant, emp, now=pkt(2030, 10, 22, 6, 10))
    r = rows[date(2030, 10, 21)]
    assert (r["status"], r["missing_checkout"]) == ("absent", True)


async def test_the_next_days_check_in_closes_the_previous_day(client, tenant):
    a, b = (await _staff(client))[:2]
    await _shift(client, a, start_time="09:00", end_time="18:00")
    await _in(tenant, a, pkt(2030, 10, 22, 9, 0))
    await _in(tenant, a, pkt(2030, 10, 23, 9, 0))
    async with db.tenant_conn(tenant.tenant_id) as conn:
        prev = await conn.fetchrow(
            "select * from hrms_attendance where employee_id=$1 and work_date='2030-10-22'", uuid.UUID(a))
    assert (prev["status"], prev["missing_checkout"], prev["final"]) == ("absent", True, True)

    # Without a shift there is no threshold to judge, but the gap is flagged.
    await _in(tenant, b, pkt(2030, 10, 22, 9, 0))
    await _in(tenant, b, pkt(2030, 10, 23, 9, 0))
    async with db.tenant_conn(tenant.tenant_id) as conn:
        prev = await conn.fetchrow(
            "select * from hrms_attendance where employee_id=$1 and work_date='2030-10-22'", uuid.UUID(b))
    assert (prev["status"], prev["missing_checkout"]) == ("present", True)


async def test_the_api_shows_the_missing_check_out(client, tenant):
    emp = tenant.employee_id
    await _in(tenant, emp, pkt(2025, 10, 7, 9, 0))
    rows = (await client.get("/hrms/attendance?on=2025-10-07")).json()
    assert [(r["employee_id"], r["missing_checkout"]) for r in rows] == [(emp, True)]


async def test_payroll_finalises_stale_open_days_before_counting(client, tenant):
    """A day derived while still open (at 09:00) and never revisited must not
    count as presence just because nobody ran the worker: the payroll run
    re-derives open past days first."""
    emp = tenant.employee_id
    await _shift(client, emp, start_time="09:00", end_time="18:00")
    day = await _in(tenant, emp, pkt(2025, 10, 7, 9, 0))
    owner = await asyncpg.connect(settings.database_url)
    try:   # as if derived at 09:00 that day and left there
        await owner.execute("""update hrms_attendance set status='present', missing_checkout=false,
                                      final=false where id=$1""", day["id"])
    finally:
        await owner.close()
    slip = next(p for p in (await client.get("/hrms/payroll?month=2025-10")).json()["payslips"]
                if p["employee_id"] == emp)
    assert slip["present_days"] == 0
    week_cells = (await client.get("/hrms/attendance/week")).json()  # also finalises; must not error
    assert week_cells["employees"]
