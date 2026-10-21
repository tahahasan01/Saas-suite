"""New automation triggers and the `create_activity` action (St02 §6.10, P1-14).

Triggers: lead.won, lead.lost, lead.restored, activity.done, activity.overdue
and contact.created (emitted by the contacts module). The action plans an
activity on the record the event is about.
"""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from app.models import WORKFLOW_TRIGGERS
from app.workflow import engine


def test_the_new_triggers_are_offered():
    for t in ("lead.won", "lead.lost", "lead.restored", "activity.done", "activity.overdue", "contact.created"):
        assert t in WORKFLOW_TRIGGERS and t in engine.TRIGGERS


async def test_create_activity_on_won(client, crm_tenant):
    r = await client.post("/workflows", json={
        "name": "Collect after win", "trigger": "lead.won",
        "actions": [{"type": "create_activity", "activity_type": "Collect payment",
                     "summary": "Collect from {name}", "offset_days": 3, "assignee": "owner"}]})
    assert r.status_code == 201, r.text
    lead = (await client.post("/crm/leads", json={"name": "Paying customer", "force": True})).json()
    await client.post(f"/crm/leads/{lead['id']}/won")
    [act] = (await client.get("/activities", params={"entity_id": lead["id"]})).json()
    today = dt.datetime.now(ZoneInfo("Asia/Karachi")).date()
    assert act["type_name"] == "Collect payment"
    assert act["summary"] == "Collect from Paying customer"
    assert act["due_date"] == str(today + dt.timedelta(days=3))
    assert act["automated"] is True
    assert act["assigned_to"] == lead["owner_id"]


async def test_a_create_activity_with_an_unknown_type_falls_back_to_to_do(client, crm_tenant):
    await client.post("/workflows", json={
        "name": "Follow new", "trigger": "lead.created",
        "actions": [{"type": "create_activity", "activity_type": "Telepathy", "summary": "Reach out"}]})
    lead = (await client.post("/crm/leads", json={"name": "Fresh one", "force": True})).json()
    [act] = (await client.get("/activities", params={"entity_id": lead["id"]})).json()
    assert act["type_name"] == "To-do" and act["summary"] == "Reach out"


async def test_create_activity_needs_a_record(client, crm_tenant):
    """An event that names no lead or contact plans nothing (and doesn't fail)."""
    from app import db

    async with db.tenant_conn(crm_tenant.tenant_id) as conn:
        me = await conn.fetchval("select id from users limit 1")
        n = await engine._create_activity(conn, {"type": "create_activity"}, {"name": "x"}, str(me))
    assert n is False
