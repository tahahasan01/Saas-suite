"""Birthdays, work anniversaries and the org chart (wave A, H2/H20, St10, 0088).

Birthdays come from an optional date of birth, never show the year (no ages),
and an employee can opt out. Anniversaries come from the joining date. Every
employee sees the team's celebrations in their space; HR sees them on the
Team page. The org chart is drawn from each employee's manager.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.security import SESSION_COOKIE

from .test_employee_portal import _link_login


def _same_day(years_ago: int, days_ahead: int) -> date:
    d = date.today() + timedelta(days=days_ahead)
    try:
        return d.replace(year=d.year - years_ago)
    except ValueError:                       # 29 Feb
        return d.replace(year=d.year - years_ago, day=28)


async def test_upcoming_birthdays_and_anniversaries_without_ages(client, tenant):
    staff = (await client.get("/hrms/employees")).json()
    a, b = staff[0], staff[1]
    r = await client.patch(f"/hrms/employees/{a['id']}", json={"date_of_birth": str(_same_day(30, 3))})
    assert r.status_code == 200, r.text
    await client.patch(f"/hrms/employees/{b['id']}", json={"join_date": str(_same_day(4, 5))})

    rows = (await client.get("/hrms/celebrations?days=14")).json()
    bday = next(x for x in rows if x["employee_id"] == a["id"] and x["kind"] == "birthday")
    assert bday["date"] == str(date.today() + timedelta(days=3)) and bday["years"] is None   # never an age
    anniv = next(x for x in rows if x["employee_id"] == b["id"] and x["kind"] == "anniversary")
    assert anniv["years"] == 4

    # Every employee sees the same list in their space.
    token = await _link_login(tenant.tenant_id, b["id"], f"emp+{uuid.uuid4().hex[:8]}@example.com")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                           cookies={SESSION_COOKIE: token}) as me:
        mine = (await me.get("/me/celebrations")).json()
        assert {(x["employee_id"], x["kind"]) for x in mine} >= {(a["id"], "birthday"), (b["id"], "anniversary")}
        assert all("date_of_birth" not in x for x in mine)
        # Opting out of birthdays: the employee's own choice.
        assert (await me.put("/me/celebrations/settings", json={"celebrate_birthday": False})).status_code == 200


async def test_an_opted_out_birthday_is_not_shown(client, tenant):
    a = (await client.get("/hrms/employees")).json()[0]
    await client.patch(f"/hrms/employees/{a['id']}", json={"date_of_birth": str(_same_day(25, 2)),
                                                           "celebrate_birthday": False})
    rows = (await client.get("/hrms/celebrations?days=14")).json()
    assert not [x for x in rows if x["employee_id"] == a["id"] and x["kind"] == "birthday"]


async def test_the_org_chart_follows_managers(client, tenant):
    staff = (await client.get("/hrms/employees")).json()
    boss, report = staff[0], staff[1]
    r = await client.patch(f"/hrms/employees/{report['id']}/job", json={"manager_id": boss["id"]})
    assert r.status_code == 200, r.text
    chart = {p["id"]: p for p in (await client.get("/hrms/org-chart")).json()}
    assert chart[report["id"]]["manager_id"] == boss["id"]
    assert chart[boss["id"]]["reports"] >= 1
    assert {"name", "job_title", "department"} <= chart[boss["id"]].keys()
