"""Worker jobs over activities: follow-up reminders and the overdue event.

`crm.followup_reminders` now reads planned activities with an exact time;
`crm.activity_overdue` fires `activity.overdue` (and tells the assignee) once
per activity whose due day has passed.
"""
from __future__ import annotations

import datetime as dt
import uuid

from app import jobs
from tests.crm.helpers import q


async def _lead_and_type(client) -> tuple[dict, str]:
    lead = (await client.post("/crm/leads", json={"name": "Job Lead", "force": True})).json()
    types = {t["name"]: t["id"] for t in (await client.get("/activity-types")).json()}
    return lead, types["Call"]


async def _titles(client) -> list[str]:
    return [n["title"] for n in (await client.get("/notifications")).json()["items"]]


async def test_overdue_activities_fire_once(client, crm_tenant):
    await client.post("/workflows", json={
        "name": "late", "trigger": "activity.overdue",
        "actions": [{"type": "notify", "recipient": "owner", "message": "Late rule: {summary}"}]})
    lead, call = await _lead_and_type(client)
    yesterday = str(dt.date.today() - dt.timedelta(days=2))
    r = await client.post("/activities", json={"entity_type": "lead", "entity_id": lead["id"], "type_id": call,
                                               "summary": "Ring back", "due_date": yesterday})
    act = r.json()

    await jobs.run_activity_overdue()
    titles = await _titles(client)
    assert "Overdue: Ring back" in titles
    assert "Late rule: Ring back" in titles
    [row] = await q("select overdue_notified_at from activities where id=$1", uuid.UUID(act["id"]))
    assert row["overdue_notified_at"] is not None

    await jobs.run_activity_overdue()
    assert (await _titles(client)).count("Overdue: Ring back") == 1


async def test_a_done_or_future_activity_is_never_overdue(client, crm_tenant):
    lead, call = await _lead_and_type(client)
    past = str(dt.date.today() - dt.timedelta(days=3))
    done = (await client.post("/activities", json={"entity_type": "lead", "entity_id": lead["id"],
                                                   "type_id": call, "summary": "Finished", "due_date": past})).json()
    await client.post(f"/activities/{done['id']}/done", json={})
    await client.post("/activities", json={"entity_type": "lead", "entity_id": lead["id"], "type_id": call,
                                           "summary": "Next week", "due_date": str(dt.date.today() + dt.timedelta(days=7))})
    await jobs.run_activity_overdue()
    titles = await _titles(client)
    assert "Overdue: Finished" not in titles and "Overdue: Next week" not in titles


async def test_follow_up_reminders_read_activities(client, crm_tenant):
    lead, call = await _lead_and_type(client)
    soon = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5)
    act = (await client.post("/activities", json={
        "entity_type": "lead", "entity_id": lead["id"], "type_id": call, "summary": "Call at 5",
        "due_date": str(soon.date()), "due_at": soon.isoformat()})).json()
    await jobs.run_followup_reminders()
    assert "Follow-up due: Job Lead" in await _titles(client)
    [row] = await q("select reminder_sent_at from activities where id=$1", uuid.UUID(act["id"]))
    assert row["reminder_sent_at"] is not None
    await jobs.run_followup_reminders()
    assert (await _titles(client)).count("Follow-up due: Job Lead") == 1


async def test_the_overdue_job_is_seeded(client, crm_tenant):
    rows = await q("select code from scheduled_jobs where code='crm.activity_overdue'")
    assert rows and "crm.activity_overdue" in jobs.HANDLERS
