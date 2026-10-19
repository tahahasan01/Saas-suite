"""Leave decision guards (audit P1-5, P1-6; decision D-44)."""
from __future__ import annotations

import uuid

import asyncpg

from app.config import settings


async def _request(client, employee_id, **over):
    body = {"employee_id": employee_id, "request_type": "leave", "leave_type": "casual",
            "from_date": "2026-11-02", "to_date": "2026-11-02", "reason": "Family"}
    return await client.post("/hrms/leave", json={**body, **over})


async def test_a_decided_request_cannot_be_decided_again(client, tenant):
    leave = (await _request(client, tenant.employee_id)).json()
    assert (await client.post(f"/hrms/leave/{leave['id']}/approve")).status_code == 200
    r = await client.post(f"/hrms/leave/{leave['id']}/reject")
    assert r.status_code == 409
    rows = (await client.get("/hrms/leave")).json()
    assert next(x for x in rows if x["id"] == leave["id"])["status"] == "approved"


async def test_an_unknown_leave_type_is_refused_up_front(client, tenant):
    """It used to be accepted, then crash the approval with a 500 (StopIteration)."""
    r = await _request(client, tenant.employee_id, leave_type="bereavement")
    assert r.status_code == 422


async def test_nobody_approves_their_own_leave(client, tenant):
    me = (await client.get("/auth/me")).json()
    owner = await asyncpg.connect(settings.database_url)
    try:  # the owner is also on staff
        await owner.execute("update hrms_employees set user_id=$1 where id=$2",
                            uuid.UUID(me["user"]["id"]), uuid.UUID(tenant.employee_id))
    finally:
        await owner.close()
    leave = (await _request(client, tenant.employee_id)).json()
    r = await client.post(f"/hrms/leave/{leave['id']}/approve")
    assert r.status_code == 403


async def test_two_approvals_cannot_together_exceed_the_quota(client, tenant):
    """Security review of df354c6: each approval checked the balance before
    either committed, so two requests that fit only one at a time both passed."""
    import asyncio

    a = (await _request(client, tenant.employee_id, from_date="2026-11-02", to_date="2026-11-07")).json()
    b = (await _request(client, tenant.employee_id, from_date="2026-11-10", to_date="2026-11-16")).json()
    # 6 + 6 working days of casual leave against a quota of 10.
    responses = await asyncio.gather(client.post(f"/hrms/leave/{a['id']}/approve"),
                                     client.post(f"/hrms/leave/{b['id']}/approve"))
    assert sorted(r.status_code for r in responses) == [200, 409]


async def test_approvals_for_one_employee_queue_behind_each_other(client, tenant):
    """The mechanism behind the quota guarantee, made deterministic: while
    another transaction holds the employee, an approval must wait for it
    rather than check the balance concurrently."""
    import asyncio

    leave = (await _request(client, tenant.employee_id)).json()
    blocker = await asyncpg.connect(settings.database_url)
    try:
        tx = blocker.transaction()
        await tx.start()
        await blocker.execute("select 1 from hrms_employees where id=$1 for update",
                              uuid.UUID(tenant.employee_id))
        approval = asyncio.create_task(client.post(f"/hrms/leave/{leave['id']}/approve"))
        await asyncio.sleep(0.5)
        waited = not approval.done()
        await tx.commit()
        r = await approval
    finally:
        await blocker.close()
    assert waited
    assert r.status_code == 200
