"""Business time is the tenant's local time (decision D-11, audit P1-2).

Every "today", every "late" and every report day used the database's UTC
clock: a 9:30 check-in in Karachi was judged at 4:30, and "late" meant after
10:00 UTC — 3 pm in Pakistan. Each tenant's transactions now run in its own
timezone, and lateness compares local time with the tenant's own threshold.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone

import asyncpg
import pytest

from app import db
from app.config import settings
from app.routers import hrms


async def _set_tenant(tenant_id: str, **cols) -> None:
    owner = await asyncpg.connect(settings.database_url)
    try:
        for col, val in cols.items():
            await owner.execute(f"update tenants set {col}=$1 where id=$2", val, uuid.UUID(tenant_id))
    finally:
        await owner.close()


async def test_a_tenants_transactions_run_in_its_timezone(client, tenant):
    async with db.tenant_conn(tenant.tenant_id) as conn:
        assert await conn.fetchval("select extract(timezone_hour from now())::int") == 5  # Asia/Karachi
    await _set_tenant(tenant.tenant_id, timezone="Asia/Dubai")
    async with db.tenant_conn(tenant.tenant_id) as conn:
        assert await conn.fetchval("select extract(timezone_hour from now())::int") == 4


async def test_late_is_judged_in_local_time_against_the_tenants_threshold(client, tenant):
    owner = await asyncpg.connect(settings.database_url)
    try:
        local_now = await owner.fetchval("select (now() at time zone 'Asia/Karachi')::time")
    finally:
        await owner.close()
    now_dt = datetime.combine(datetime(2000, 1, 1), local_now)
    if not (timedelta(hours=1) < now_dt - datetime(2000, 1, 1) < timedelta(hours=23)):
        pytest.skip("too close to local midnight to move the threshold either side of now")
    first, second = [e["id"] for e in (await client.get("/hrms/employees")).json()][:2]

    await _set_tenant(tenant.tenant_id, late_after=(now_dt - timedelta(hours=1)).time())
    r = await client.post("/hrms/attendance/checkin", json={"employee_id": first})
    assert r.json()["status"] == "late"

    await _set_tenant(tenant.tenant_id, late_after=(now_dt + timedelta(hours=1)).time())
    r = await client.post("/hrms/attendance/checkin", json={"employee_id": second})
    assert r.json()["status"] == "present"


# ── Boundaries with a frozen clock (checklist §6.6, St03 risk 5) ─────────────
# The punch instant is passed in, so these run the real SQL — the tenant's
# session timezone does the conversion — at any wall-clock time.
def _utc(*args) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


async def _punch(tenant_id: str, employee_id: str, at: datetime):
    async with db.tenant_conn(tenant_id) as conn:
        row = await hrms._do_checkin(conn, employee_id, method="web", at=at)
        return await conn.fetchrow("select work_date, status from hrms_attendance where id=$1", row["id"])


async def _staff(client) -> list[str]:
    return [e["id"] for e in (await client.get("/hrms/employees")).json()]


async def test_a_punch_at_0130_pkt_belongs_to_the_new_local_day(client, tenant):
    rec = await _punch(tenant.tenant_id, tenant.employee_id, _utc(2026, 10, 19, 20, 30))
    assert rec["work_date"] == date(2026, 10, 20)  # still the 19th in UTC
    assert rec["status"] == "present"


async def test_late_is_0916_pkt_not_1000_utc(client, tenant):
    """Shift 09:00 with 15 minutes' grace. The old check flagged late only
    after 10:00 UTC, i.e. 15:00 in Pakistan."""
    await _set_tenant(tenant.tenant_id, late_after=time(9, 15))
    a, b = (await _staff(client))[:2]
    late = await _punch(tenant.tenant_id, a, _utc(2026, 10, 20, 4, 16))     # 09:16 PKT
    on_time = await _punch(tenant.tenant_id, b, _utc(2026, 10, 20, 4, 10))  # 09:10 PKT
    assert (late["work_date"], late["status"]) == (date(2026, 10, 20), "late")
    assert (on_time["work_date"], on_time["status"]) == (date(2026, 10, 20), "present")


async def test_a_dubai_tenant_runs_on_dubai_time(client, tenant):
    await _set_tenant(tenant.tenant_id, timezone="Asia/Dubai", late_after=time(9, 15))
    a, b, c = (await _staff(client))[:3]
    assert (await _punch(tenant.tenant_id, a, _utc(2026, 10, 20, 5, 16)))["status"] == "late"    # 09:16 GST
    assert (await _punch(tenant.tenant_id, b, _utc(2026, 10, 20, 4, 16)))["status"] == "present"  # 08:16 GST
    # 00:30 in Dubai is already the 20th there, still the 19th in UTC.
    assert (await _punch(tenant.tenant_id, c, _utc(2026, 10, 19, 20, 30)))["work_date"] == date(2026, 10, 20)


async def test_a_london_tenant_follows_daylight_saving(client, tenant):
    """British Summer Time ends on 25 Oct 2026: the same UTC hour is a
    different local day and a different lateness either side of it."""
    await _set_tenant(tenant.tenant_id, timezone="Europe/London", late_after=time(9, 15))
    a, b = (await _staff(client))[:2]
    # 23:30Z on 19 Oct is 00:30 BST on the 20th; on 26 Oct it is 23:30 GMT the same day.
    assert (await _punch(tenant.tenant_id, a, _utc(2026, 10, 19, 23, 30)))["work_date"] == date(2026, 10, 20)
    assert (await _punch(tenant.tenant_id, b, _utc(2026, 10, 26, 23, 30)))["work_date"] == date(2026, 10, 26)
    # 08:16Z is 09:16 BST (late) in summer and 08:16 GMT (on time) in winter.
    assert (await _punch(tenant.tenant_id, a, _utc(2026, 10, 21, 8, 16)))["status"] == "late"
    assert (await _punch(tenant.tenant_id, b, _utc(2026, 10, 28, 8, 16)))["status"] == "present"


async def test_a_punch_at_0030_pkt_on_the_1st_counts_in_that_month(client, tenant):
    """00:00–05:00 PKT is still the previous day in UTC; payroll must count
    it in the new month."""
    await _punch(tenant.tenant_id, tenant.employee_id, _utc(2025, 9, 30, 19, 30))  # 00:30 PKT, 1 Oct

    def slip(run):
        return next(p for p in run["payslips"] if p["employee_id"] == tenant.employee_id)

    october = (await client.get("/hrms/payroll?month=2025-10")).json()
    september = (await client.get("/hrms/payroll?month=2025-09")).json()
    assert slip(october)["present_days"] == 1
    assert slip(september)["present_days"] == 0


async def test_tenant_today_is_the_local_date(client, tenant):
    await _set_tenant(tenant.tenant_id, timezone="Pacific/Kiritimati")  # UTC+14
    async with db.tenant_conn(tenant.tenant_id) as conn:
        today, local, direct = await conn.fetchrow(
            """select tenant_today('Pacific/Kiritimati'), current_date,
                      (now() at time zone 'Pacific/Kiritimati')::date""")
    assert today == local == direct


async def test_tenant_settings_are_typed_and_checked(client, tenant):
    owner = await asyncpg.connect(settings.database_url)
    try:
        row = await owner.fetchrow(
            "select timezone, fy_start_month from tenants where id=$1", uuid.UUID(tenant.tenant_id))
        assert (row["timezone"], row["fy_start_month"]) == ("Asia/Karachi", 7)  # July–June
        with pytest.raises(asyncpg.CheckViolationError):
            await owner.execute("update tenants set timezone='Mars/Olympus' where id=$1",
                                uuid.UUID(tenant.tenant_id))
        with pytest.raises(asyncpg.CheckViolationError):
            await owner.execute("update tenants set fy_start_month=13 where id=$1",
                                uuid.UUID(tenant.tenant_id))
        # The work day is written explicitly as the punch's local date; a
        # column default would quietly use whatever clock the session has.
        default = await owner.fetchval(
            """select column_default from information_schema.columns
                where table_name='hrms_attendance' and column_name='work_date'""")
        assert default is None
    finally:
        await owner.close()
