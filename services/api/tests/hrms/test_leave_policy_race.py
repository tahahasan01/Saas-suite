"""The leave-policy row must never 500 on a race.

The loader used to select the row and insert it when missing. Two requests on a
tenant without a row (e.g. two managers approving leave at once) both saw
"missing", both inserted, and the loser hit `hrms_leave_policies_pkey`.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import date, timedelta

import asyncpg

from app import db
from app.config import settings
from app import leave


async def _owner():
    return await asyncpg.connect(settings.database_url)


async def _drop_policy(tenant_id: str) -> None:
    """Puts the tenant back in the 'no policy row yet' state (pre-signup-seeding
    tenants are still in it)."""
    owner = await _owner()
    try:
        await owner.execute("delete from hrms_leave_policies where tenant_id=$1", uuid.UUID(tenant_id))
    finally:
        await owner.close()


async def _wait_for_blocked_insert(timeout: float = 5.0) -> None:
    """Returns once some backend is waiting on a lock while seeding leave types."""
    owner = await _owner()
    try:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        while loop.time() < deadline:
            n = await owner.fetchval(
                """select count(*) from pg_stat_activity
                    where wait_event_type = 'Lock'
                      and query ilike 'select hrms_seed_leave_types%'""")
            if n:
                return
            await asyncio.sleep(0.02)
        raise AssertionError("second loader never reached the insert")
    finally:
        await owner.close()


async def test_signup_creates_the_policy_row(client, tenant):
    owner = await _owner()
    try:
        row = await owner.fetchrow("select * from hrms_leave_policies where tenant_id=$1",
                                   uuid.UUID(tenant.tenant_id))
    finally:
        await owner.close()
    assert row is not None
    assert (row["annual_days"], row["sick_days"], row["casual_days"]) == (14, 10, 10)


# Since 0068 the quotas live on hrms_leave_types, seeded on first use; the
# same race (two first uses at once) must not 500 there either.
async def test_seeding_tolerates_types_inserted_by_another_connection(client, tenant):
    """Connection A seeds the types and holds its transaction open; B's seed
    blocks on the same rows; A commits. B must carry on, not raise
    UniqueViolation, and the tenant ends with one row per code."""
    owner = await _owner()
    try:
        await owner.execute("delete from hrms_leave_types where tenant_id=$1", uuid.UUID(tenant.tenant_id))
    finally:
        await owner.close()

    async def second_loader():
        async with db.tenant_conn(tenant.tenant_id) as b:
            await leave.ensure_types(b, tenant.tenant_id)
            return await b.fetchval("select count(*) from hrms_leave_types")

    async with db.tenant_conn(tenant.tenant_id) as a:
        await leave.ensure_types(a, tenant.tenant_id)
        task = asyncio.create_task(second_loader())
        await _wait_for_blocked_insert()
    assert await asyncio.wait_for(task, timeout=5) == 6


async def test_seeding_twice_changes_nothing(client, tenant):
    async with db.tenant_conn(tenant.tenant_id) as conn:
        await leave.ensure_types(conn, tenant.tenant_id)
        first = await conn.fetch("select code, days_per_year from hrms_leave_types order by code")
        await leave.ensure_types(conn, tenant.tenant_id)
        again = await conn.fetch("select code, days_per_year from hrms_leave_types order by code")
    assert first == again
    assert dict((r["code"], r["days_per_year"]) for r in first)["annual"] == 14


async def test_concurrent_approvals_on_a_tenant_without_a_policy_row(client, tenant):
    employees = (await client.get("/hrms/employees")).json()
    assert len(employees) >= 2, "sample data should seed several employees"
    base = date.today() + timedelta(days=60)
    while base.weekday() != 0:   # a Monday: a Sunday-only request is now refused as no working days (0068)
        base += timedelta(days=1)
    for attempt in range(5):
        await _drop_policy(tenant.tenant_id)
        ids = []
        for i, emp in enumerate(employees[:2]):
            d = (base + timedelta(days=attempt * 7 + i)).isoformat()
            r = await client.post("/hrms/leave", json={
                "employee_id": emp["id"], "request_type": "leave", "leave_type": "annual",
                "from_date": d, "to_date": d,
            })
            assert r.status_code == 201, r.text
            ids.append(r.json()["id"])
        results = await asyncio.gather(*(client.post(f"/hrms/leave/{i}/approve") for i in ids))
        assert [r.status_code for r in results] == [200, 200], [r.text for r in results]
