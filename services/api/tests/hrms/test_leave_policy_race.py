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
from app.routers import hrms


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
    """Returns once some backend is waiting on a lock while inserting the policy row."""
    owner = await _owner()
    try:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        while loop.time() < deadline:
            n = await owner.fetchval(
                """select count(*) from pg_stat_activity
                    where wait_event_type = 'Lock'
                      and query ilike 'insert into hrms_leave_policies%'""")
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


async def test_loader_tolerates_a_row_inserted_by_another_connection(client, tenant):
    """Deterministic version of the race: connection A creates the row and holds
    its transaction open; B's loader runs, misses the uncommitted row and blocks
    on the insert; A commits. B must return the row, not raise UniqueViolation."""
    await _drop_policy(tenant.tenant_id)

    async def second_loader():
        async with db.tenant_conn(tenant.tenant_id) as b:
            return await hrms._policy(b, tenant.tenant_id)

    async with db.tenant_conn(tenant.tenant_id) as a:
        first = await hrms._policy(a, tenant.tenant_id)
        task = asyncio.create_task(second_loader())
        await _wait_for_blocked_insert()
    # A has committed; B is now released.
    second = await asyncio.wait_for(task, timeout=5)
    assert second["tenant_id"] == first["tenant_id"]
    assert second["annual_days"] == 14


async def test_loader_returns_an_existing_row(client, tenant):
    async with db.tenant_conn(tenant.tenant_id) as conn:
        a = await hrms._policy(conn, tenant.tenant_id)
        b = await hrms._policy(conn, tenant.tenant_id)
    assert a == b


async def test_concurrent_approvals_on_a_tenant_without_a_policy_row(client, tenant):
    employees = (await client.get("/hrms/employees")).json()
    assert len(employees) >= 2, "sample data should seed several employees"
    base = date.today() + timedelta(days=60)
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
