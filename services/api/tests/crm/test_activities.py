"""Activities: planned, typed work with a due date, separate from history (D-32).

An activity is open until done or cancelled; its state (overdue / today /
planned) is computed against the tenant's business day, never stored.
Finishing one writes an `activity_done` timeline event and fires
`activity.done`. My Day reads `GET /activities` and the nav badge
`GET /activities/summary`.
"""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

import pytest

SEEDED = ["Call", "WhatsApp", "Meeting", "Visit", "To-do", "Send quote", "Collect payment"]


def _today() -> dt.date:
    return dt.datetime.now(ZoneInfo("Asia/Karachi")).date()


async def _lead(client, name: str = "Activity Lead") -> dict:
    return (await client.post("/crm/leads", json={"name": name, "force": True})).json()


async def _types(client) -> dict[str, str]:
    return {t["name"]: t["id"] for t in (await client.get("/activity-types")).json()}


async def _plan(client, lead: dict, days: int = 0, type_name: str = "Call", **extra) -> dict:
    types = await _types(client)
    r = await client.post("/activities", json={
        "entity_type": "lead", "entity_id": lead["id"], "type_id": types[type_name],
        "summary": f"{type_name} {lead['name']}", "due_date": str(_today() + dt.timedelta(days=days)), **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def test_activity_types_are_seeded_in_order(client, crm_tenant):
    names = [t["name"] for t in (await client.get("/activity-types")).json()]
    assert names == SEEDED


async def test_activity_types_can_be_added_and_retired(client, crm_tenant):
    r = await client.post("/activity-types", json={"name": "Home visit", "icon": "visit", "default_days": 2})
    assert r.status_code == 201, r.text
    t = r.json()
    assert (await client.patch(f"/activity-types/{t['id']}", json={"name": "House visit"})).json()["name"] == "House visit"
    assert (await client.post("/activity-types", json={"name": "house VISIT"})).status_code == 409
    assert (await client.delete(f"/activity-types/{t['id']}")).status_code == 204
    assert "House visit" not in [x["name"] for x in (await client.get("/activity-types")).json()]
    lead = await _lead(client)
    r = await client.post("/activities", json={"entity_type": "lead", "entity_id": lead["id"], "type_id": t["id"],
                                               "due_date": str(_today())})
    assert r.status_code == 422          # a retired type can't be planned


async def test_plan_and_list_my_activities_with_state(client, crm_tenant):
    lead = await _lead(client)
    late = await _plan(client, lead, days=-2)
    today = await _plan(client, lead, days=0, type_name="WhatsApp")
    later = await _plan(client, lead, days=3, type_name="Meeting")
    assert late["state"] == "overdue" and today["state"] == "today" and later["state"] == "planned"
    assert late["assigned_to"] == (await client.get("/auth/me")).json()["user"]["id"]
    assert late["entity_name"] == "Activity Lead" and late["type_name"] == "Call"

    mine = (await client.get("/activities")).json()
    assert [a["id"] for a in mine] == [late["id"], today["id"], later["id"]]      # due first
    due = (await client.get("/activities", params={"state": "overdue,today"})).json()
    assert {a["id"] for a in due} == {late["id"], today["id"]}
    assert (await client.get("/activities", params={"state": "someday"})).status_code == 422

    s = (await client.get("/activities/summary")).json()
    assert (s["overdue"], s["today"], s["planned"]) == (1, 1, 1)


async def test_summary_counts_only_my_open_activities(client, crm_tenant):
    from tests.crm.helpers import add_teammate

    lead = await _lead(client)
    mate, _ = await add_teammate(client, ["read", "write"])
    await _plan(client, lead, days=0, assigned_to=mate)
    done = await _plan(client, lead, days=0)
    await client.post(f"/activities/{done['id']}/done", json={})
    s = (await client.get("/activities/summary")).json()
    assert (s["overdue"], s["today"]) == (0, 0)
    team = (await client.get("/activities", params={"assigned": "all"})).json()
    assert mate in [a["assigned_to"] for a in team]


async def test_done_writes_the_timeline_fires_the_event_and_can_chain(client, crm_tenant):
    await client.post("/workflows", json={
        "name": "done", "trigger": "activity.done",
        "conditions": [{"field": "outcome", "op": "eq", "value": "interested"}],
        "actions": [{"type": "notify", "recipient": "actor", "message": "Done: {summary} on {name}"}]})
    lead = await _lead(client)
    act = await _plan(client, lead, days=-1)
    types = await _types(client)
    r = await client.post(f"/activities/{act['id']}/done", json={
        "outcome": "interested", "feedback": "Wants a quote by Friday",
        "next": {"type_id": types["Send quote"], "due_date": str(_today() + dt.timedelta(days=2)),
                 "summary": "Send the quote"}})
    assert r.status_code == 200, r.text
    assert r.json()["state"] == "done" and r.json()["done_at"]
    timeline = (await client.get(f"/crm/leads/{lead['id']}/timeline")).json()["items"]
    ev = next(e for e in timeline if e["kind"] == "activity_done")
    assert ev["body"] == "Wants a quote by Friday"
    assert ev["payload"]["type_name"] == "Call" and ev["payload"]["outcome"] == "interested"
    titles = [n["title"] for n in (await client.get("/notifications")).json()["items"]]
    assert f"Done: {act['summary']} on Activity Lead" in titles
    open_ = (await client.get("/activities", params={"entity_id": lead["id"]})).json()
    assert [a["summary"] for a in open_] == ["Send the quote"]
    assert (await client.post(f"/activities/{act['id']}/done", json={})).status_code == 409


async def test_snooze_and_cancel(client, crm_tenant):
    lead = await _lead(client)
    act = await _plan(client, lead, days=0)
    r = await client.post(f"/activities/{act['id']}/snooze", json={"days": 3})
    assert r.status_code == 200 and r.json()["due_date"] == str(_today() + dt.timedelta(days=3))
    assert (await client.post(f"/activities/{act['id']}/snooze", json={"days": 0})).status_code == 422
    assert (await client.post(f"/activities/{act['id']}/cancel")).status_code == 200
    assert act["id"] not in [a["id"] for a in (await client.get("/activities")).json()]
    assert (await client.post(f"/activities/{act['id']}/snooze", json={"days": 1})).status_code == 409


async def test_edit_an_open_activity(client, crm_tenant):
    lead = await _lead(client)
    act = await _plan(client, lead, days=1)
    r = await client.patch(f"/activities/{act['id']}", json={"summary": "Call about delivery", "note": "after 5pm"})
    assert r.status_code == 200 and (r.json()["summary"], r.json()["note"]) == ("Call about delivery", "after 5pm")


async def test_losing_a_lead_cancels_its_open_activities(client, crm_tenant):
    lead = await _lead(client)
    await _plan(client, lead, days=1)
    await client.post(f"/crm/leads/{lead['id']}/lost", json={})
    assert (await client.get("/activities", params={"entity_id": lead["id"]})).json() == []


async def test_the_lead_list_shows_the_worst_open_activity(client, crm_tenant):
    calm, hot = await _lead(client, "Calm"), await _lead(client, "Hot")
    await _plan(client, calm, days=4)
    await _plan(client, hot, days=4)
    await _plan(client, hot, days=-1)
    rows = {x["id"]: x for x in (await client.get("/crm/leads")).json()}
    assert rows[calm["id"]]["activity_state"] == "planned"
    assert rows[hot["id"]]["activity_state"] == "overdue"
    assert rows[hot["id"]]["next_activity_date"] == str(_today() - dt.timedelta(days=1))


@pytest.mark.parametrize("bad", [{"entity_type": "spaceship"}, {"due_date": "tomorrow"}])
async def test_activity_input_is_validated(client, crm_tenant, bad):
    lead = await _lead(client)
    types = await _types(client)
    body = {"entity_type": "lead", "entity_id": lead["id"], "type_id": types["Call"], "due_date": str(_today()), **bad}
    assert (await client.post("/activities", json=body)).status_code == 422


async def test_logging_an_interaction_now_lands_on_the_timeline(client, crm_tenant):
    """The old drawer form keeps working for API callers: a done contact becomes
    a timeline event and a follow-up time becomes a planned activity."""
    lead = await _lead(client)
    follow = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=2)).isoformat()
    r = await client.post(f"/crm/leads/{lead['id']}/interactions",
                          json={"channel": "whatsapp", "outcome": "callback", "note": "Busy at shop",
                                "next_follow_up_at": follow})
    assert r.status_code == 201, r.text
    timeline = (await client.get(f"/crm/leads/{lead['id']}/timeline")).json()["items"]
    ev = next(e for e in timeline if e["kind"] == "call")
    assert ev["body"] == "Busy at shop" and ev["payload"]["channel"] == "whatsapp"
    [planned] = (await client.get("/activities", params={"entity_id": lead["id"]})).json()
    assert planned["type_name"] == "WhatsApp" and planned["due_at"] is not None
