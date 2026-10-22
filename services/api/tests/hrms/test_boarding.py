"""Onboarding and offboarding checklists (wave C, H23/H24, St12, 0100).

A template (onboarding or offboarding) lists tasks with an owner and a due
offset in days. Starting a boarding copies them into dated tasks. It
completes only when every task is done or skipped; offboarding records the
last working day (the employee's exit date) and can't complete while an
asset is still out. The exit interview is HR's alone. Employees tick their
own tasks through /me.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.security import SESSION_COOKIE

from ..core.test_rbac_v2 import _role, _user_on
from .test_employee_portal import _link_login


async def _template(client, kind="onboarding", tasks=None) -> dict:
    tasks = tasks or [
        {"title": "Laptop and email account", "owner": "it", "offset_days": -2},
        {"title": "Sign the appointment letter", "owner": "employee", "offset_days": 0},
        {"title": "Meet the team", "owner": "manager", "offset_days": 1},
    ]
    r = await client.post("/hrms/boarding-templates",
                          json={"kind": kind, "name": f"{kind} {uuid.uuid4().hex[:6]}", "tasks": tasks})
    assert r.status_code == 201, r.text
    return r.json()


async def _new_employee(client, **extra) -> str:
    r = await client.post("/hrms/employees", json={"name": f"Joiner {uuid.uuid4().hex[:5]}",
                                                   "join_date": "2026-11-02", **extra})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_a_template_is_copied_into_dated_tasks_and_completes_when_all_are_closed(client, tenant):
    t = await _template(client)
    assert [x["title"] for x in t["tasks"]][0] == "Laptop and email account"
    emp = await _new_employee(client)
    r = await client.post(f"/hrms/employees/{emp}/onboarding", json={"template_id": t["id"]})
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["kind"] == "onboarding" and b["status"] == "open" and b["anchor_date"] == "2026-11-02"
    dues = {x["title"]: x["due_on"] for x in b["tasks"]}
    assert dues == {"Laptop and email account": "2026-10-31", "Sign the appointment letter": "2026-11-02",
                    "Meet the team": "2026-11-03"}
    assert b["done"] == 0 and b["total"] == 3
    # One open onboarding per person.
    assert (await client.post(f"/hrms/employees/{emp}/onboarding", json={"template_id": t["id"]})).status_code == 409

    # Not complete while a task is open.
    assert (await client.post(f"/hrms/boardings/{b['id']}/complete")).status_code == 409
    first, second, third = b["tasks"]
    assert (await client.patch(f"/hrms/boarding-tasks/{first['id']}", json={"status": "done"})).status_code == 200
    # Skipping needs a reason.
    assert (await client.patch(f"/hrms/boarding-tasks/{second['id']}", json={"status": "skipped"})).status_code == 422
    r = await client.patch(f"/hrms/boarding-tasks/{second['id']}", json={"status": "skipped", "note": "Signed on paper"})
    assert r.status_code == 200 and r.json()["status"] == "skipped"
    r = await client.post(f"/hrms/boardings/{b['id']}/tasks",
                          json={"title": "Uniform", "owner": "hr", "due_on": "2026-11-05"})
    assert r.status_code == 201, r.text
    for task in (third, r.json()):
        await client.patch(f"/hrms/boarding-tasks/{task['id']}", json={"status": "done"})

    r = await client.post(f"/hrms/boardings/{b['id']}/complete")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed" and r.json()["done"] == 4
    assert (await client.patch(f"/hrms/boarding-tasks/{first['id']}", json={"status": "open"})).status_code == 409


async def test_without_a_template_the_starter_list_is_used(client, tenant):
    emp = await _new_employee(client)
    r = await client.post(f"/hrms/employees/{emp}/onboarding", json={})
    assert r.status_code == 201, r.text
    assert r.json()["total"] >= 3
    listed = (await client.get("/hrms/boardings", params={"kind": "onboarding", "status": "open"})).json()
    assert any(x["employee_id"] == emp for x in listed)


async def test_offboarding_sets_the_exit_date_and_waits_for_assets(client, tenant):
    t = await _template(client, "offboarding", [{"title": "Hand over files", "owner": "manager", "offset_days": -3}])
    emp = await _new_employee(client)
    asset = (await client.post("/hrms/assets", json={"name": "Office phone", "category": "phone"})).json()
    await client.post(f"/hrms/assets/{asset['id']}/issue", json={"employee_id": emp})

    last = date(2026, 12, 31)
    r = await client.post(f"/hrms/employees/{emp}/offboarding",
                          json={"template_id": t["id"], "reason": "resigned", "notice_date": "2026-12-01",
                                "last_working_day": last.isoformat()})
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["reason"] == "resigned" and b["last_working_day"] == last.isoformat()
    assert b["tasks"][0]["due_on"] == (last - timedelta(days=3)).isoformat()
    assert [a["name"] for a in b["assets_held"]] == ["Office phone"]
    e = (await client.get(f"/hrms/employees/{emp}")).json()
    assert e["exit_date"] == last.isoformat() and e["exit_reason"] == "resigned"

    await client.patch(f"/hrms/boarding-tasks/{b['tasks'][0]['id']}", json={"status": "done"})
    r = await client.post(f"/hrms/boardings/{b['id']}/complete")
    assert r.status_code == 409 and "Office phone" in r.text            # the phone is still out
    await client.post(f"/hrms/assets/{asset['id']}/return", json={"condition": "good"})
    assert (await client.post(f"/hrms/boardings/{b['id']}/complete")).status_code == 200


async def test_cancelling_an_offboarding_keeps_the_employee(client, tenant):
    emp = await _new_employee(client)
    r = await client.post(f"/hrms/employees/{emp}/offboarding",
                          json={"reason": "resigned", "last_working_day": "2026-12-31"})
    assert r.status_code == 201, r.text
    # The last day can't come before the notice.
    bad = await client.post(f"/hrms/employees/{emp}/offboarding",
                            json={"reason": "resigned", "notice_date": "2026-12-31", "last_working_day": "2026-12-01"})
    assert bad.status_code in (409, 422)
    r = await client.post(f"/hrms/boardings/{r.json()['id']}/cancel", json={"note": "Withdrew the resignation"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    e = (await client.get(f"/hrms/employees/{emp}")).json()
    assert e["exit_date"] is None and e["exit_reason"] is None


async def test_the_exit_interview_is_for_boarding_managers_only(client, tenant):
    emp = await _new_employee(client)
    b = (await client.post(f"/hrms/employees/{emp}/offboarding",
                           json={"reason": "resigned", "last_working_day": "2026-12-31"})).json()
    assert (await client.put(f"/hrms/boardings/{b['id']}/exit-interview", json={"rating": 9})).status_code == 422
    r = await client.put(f"/hrms/boardings/{b['id']}/exit-interview",
                         json={"held_on": "2026-12-20", "outcome": "leaving", "rating": 3,
                               "primary_reason": "pay", "would_rejoin": True, "notes": "Better offer elsewhere"})
    assert r.status_code == 200, r.text
    assert (await client.get(f"/hrms/boardings/{b['id']}")).json()["exit_interview"]["primary_reason"] == "pay"

    rid = await _role(client, [{"permission_key": "hrms.boarding.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        seen = (await mate.get(f"/hrms/boardings/{b['id']}")).json()
        assert seen["exit_interview"] is None                       # confidential
        assert (await mate.put(f"/hrms/boardings/{b['id']}/exit-interview", json={"rating": 1})).status_code == 403
        assert (await mate.post(f"/hrms/boardings/{b['id']}/complete")).status_code == 403
    finally:
        await mate.aclose()
    # Onboardings have no exit interview.
    on = (await client.post(f"/hrms/employees/{emp}/onboarding", json={})).json()
    assert (await client.put(f"/hrms/boardings/{on['id']}/exit-interview", json={"rating": 3})).status_code == 409


async def test_an_employee_ticks_only_their_own_tasks(client, tenant):
    t = await _template(client)
    b = (await client.post(f"/hrms/employees/{tenant.employee_id}/onboarding",
                           json={"template_id": t["id"], "anchor_date": "2026-11-02"})).json()
    other = await _new_employee(client)
    ob = (await client.post(f"/hrms/employees/{other}/onboarding", json={"template_id": t["id"]})).json()
    mine = next(x for x in b["tasks"] if x["owner"] == "employee")
    it_task = next(x for x in b["tasks"] if x["owner"] == "it")
    theirs = next(x for x in ob["tasks"] if x["owner"] == "employee")

    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"emp+{uuid.uuid4().hex[:8]}@example.com")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                           cookies={SESSION_COOKIE: token}) as me:
        listed = (await me.get("/me/boarding")).json()
        assert [x["id"] for x in listed] == [mine["id"]]           # only tasks they own
        assert (await me.post(f"/me/boarding-tasks/{mine['id']}/done")).status_code == 200
        assert (await me.post(f"/me/boarding-tasks/{it_task['id']}/done")).status_code == 404
        assert (await me.post(f"/me/boarding-tasks/{theirs['id']}/done")).status_code == 404
        assert (await me.get("/hrms/boardings")).status_code == 403
    done = (await client.get(f"/hrms/boardings/{b['id']}")).json()
    assert next(x for x in done["tasks"] if x["id"] == mine["id"])["status"] == "done"


async def test_templates_are_checked(client, tenant):
    bad = await client.post("/hrms/boarding-templates",
                            json={"kind": "onboarding", "name": "X", "tasks": [{"title": "A", "owner": "cook"}]})
    assert bad.status_code == 422
    assert (await client.post("/hrms/boarding-templates", json={"kind": "joining", "name": "X"})).status_code == 422
    t = await _template(client)
    r = await client.patch(f"/hrms/boarding-templates/{t['id']}",
                           json={"tasks": [{"title": "Only this", "owner": "hr", "offset_days": 0}]})
    assert r.status_code == 200 and [x["title"] for x in r.json()["tasks"]] == ["Only this"]
    r = await client.patch(f"/hrms/boarding-templates/{t['id']}", json={"active": False})
    assert r.status_code == 200 and r.json()["active"] is False
    emp = await _new_employee(client)
    assert (await client.post(f"/hrms/employees/{emp}/onboarding", json={"template_id": t["id"]})).status_code == 409
    # The template's kind must match.
    off = await _template(client, "offboarding")
    assert (await client.post(f"/hrms/employees/{emp}/onboarding", json={"template_id": off["id"]})).status_code == 422
