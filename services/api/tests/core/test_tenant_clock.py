"""Business time is the tenant's local time (decision D-11, audit P1-2).

Every "today", every "late" and every report day used the database's UTC
clock: a 9:30 check-in in Karachi was judged at 4:30, and "late" meant after
10:00 UTC — 3 pm in Pakistan. Each tenant's transactions now run in its own
timezone, and lateness compares local time with the tenant's own threshold.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import asyncpg
import pytest

from app import db
from app.config import settings


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
