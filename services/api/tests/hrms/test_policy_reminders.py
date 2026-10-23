"""Reminders for unacknowledged policies (wave A leftover, H19, 0110).

HR can remind everyone a must-acknowledge notice is for who hasn't
acknowledged it yet (an in-app notification; only staff with a login can
acknowledge). Not more than once in 12 hours. A daily job also reminds them
once a week, at most four times in all, and stops once everyone has
acknowledged.
"""
from __future__ import annotations

import uuid

from httpx import ASGITransport, AsyncClient

from app import jobs
from app.main import app
from app.security import SESSION_COOKIE

from .payroll_helpers import new_employee, owner_execute, owner_fetch
from .test_employee_portal import _link_login


async def _login(tenant, employee_id: str) -> tuple[str, AsyncClient]:
    email = f"emp+{uuid.uuid4().hex[:8]}@example.com"
    token = await _link_login(tenant.tenant_id, employee_id, email)
    return email, AsyncClient(transport=ASGITransport(app=app), base_url="http://test", cookies={SESSION_COOKIE: token})


async def _reminders(email: str) -> int:
    rows = await owner_fetch(
        """select count(*) as n from notifications n join users u on u.id = n.user_id
            where u.email = $1 and n.title like 'Reminder:%'""", email)
    return int(rows[0]["n"])


async def test_hr_reminds_only_those_who_havent_acknowledged(client, tenant):
    a, b = await new_employee(client, name="Asma"), await new_employee(client, name="Babar")
    (ea, ca), (eb, cb) = await _login(tenant, a["id"]), await _login(tenant, b["id"])
    n = (await client.post("/hrms/notices", json={"title": "Leave policy 2027", "body": "Read me",
                                                  "requires_ack": True})).json()
    try:
        assert (await ca.post(f"/me/notices/{n['id']}/acknowledge")).status_code == 200
        r = await client.post(f"/hrms/notices/{n['id']}/remind")
        assert r.status_code == 200, r.text
        assert r.json()["reminded"] >= 1
        assert await _reminders(eb) == 1 and await _reminders(ea) == 0
        # Not again so soon.
        assert (await client.post(f"/hrms/notices/{n['id']}/remind")).status_code == 409
        listed = next(x for x in (await client.get("/hrms/notices")).json() if x["id"] == n["id"])
        assert listed["reminders_sent"] == 1 and listed["last_reminded_at"] is not None
    finally:
        await ca.aclose()
        await cb.aclose()


async def test_only_must_acknowledge_notices_are_reminded(client, tenant):
    n = (await client.post("/hrms/notices", json={"title": "Eid timings", "body": "Shop opens at 2"})).json()
    assert (await client.post(f"/hrms/notices/{n['id']}/remind")).status_code == 409


async def test_the_daily_job_reminds_weekly_up_to_four_times(client, tenant):
    b = await new_employee(client, name="Late reader")
    eb, cb = await _login(tenant, b["id"])
    await cb.aclose()
    n = (await client.post("/hrms/notices", json={"title": "Code of conduct", "body": "Please read",
                                                  "requires_ack": True})).json()
    # Too new for a reminder yet.
    await jobs.HANDLERS["hrms.policy_reminders"]()
    assert await _reminders(eb) == 0
    for expected in (1, 2, 3, 4, 4):
        await owner_execute("""update hrms_notices set created_at = now() - interval '8 days',
                                      last_reminded_at = case when last_reminded_at is null then null
                                                              else now() - interval '8 days' end
                                where id = $1::uuid""", n["id"])
        await jobs.HANDLERS["hrms.policy_reminders"]()
        assert await _reminders(eb) == expected
