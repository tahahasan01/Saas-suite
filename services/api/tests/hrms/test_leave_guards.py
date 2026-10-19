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
