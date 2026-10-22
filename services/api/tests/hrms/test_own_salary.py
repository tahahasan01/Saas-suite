"""Nobody sets their own salary (security review of the wave C merge,
2026-10-23). Job changes already refuse it (108ce58); the direct salary
change on the profile must too, or the same raise goes in through it.
"""
from __future__ import annotations

import uuid

from .payroll_helpers import new_employee, owner_execute


async def test_nobody_changes_their_own_salary_directly(client, tenant):
    e = await new_employee(client, name="Self Raiser", salary_minor=5_000_000, join_date="2026-01-01")
    me = uuid.UUID((await client.get("/auth/me")).json()["user"]["id"])
    await owner_execute("update hrms_employees set user_id = $1 where id = $2", me, uuid.UUID(e["id"]))
    r = await client.post(f"/payroll/employees/{e['id']}/compensation", json={
        "effective_from": "2026-06-01", "base_minor": 9_000_000})
    assert r.status_code == 403 and "own" in r.text
