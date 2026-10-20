"""`interaction.logged` is a trigger the automations screen offers, so logging
an interaction must emit it (P1-14). It becomes `activity.done` in Phase 3."""
from __future__ import annotations


async def test_logging_an_interaction_fires_its_workflows(client, crm_tenant):
    r = await client.post("/workflows", json={
        "name": "Hot call", "trigger": "interaction.logged",
        "conditions": [{"field": "outcome", "op": "eq", "value": "interested"}],
        "actions": [{"type": "notify", "recipient": "actor", "message": "Interested: {name} via {channel}"}],
    })
    assert r.status_code == 201, r.text
    lead = (await client.get("/crm/leads")).json()[0]
    before = (await client.get("/notifications")).json()["items"]

    await client.post(f"/crm/leads/{lead['id']}/interactions", json={"channel": "call", "outcome": "busy"})
    assert len((await client.get("/notifications")).json()["items"]) == len(before)   # condition not met

    r = await client.post(f"/crm/leads/{lead['id']}/interactions",
                          json={"channel": "whatsapp", "outcome": "interested"})
    assert r.status_code == 201
    titles = [n["title"] for n in (await client.get("/notifications")).json()["items"]]
    assert f"Interested: {lead['name']} via whatsapp" in titles
