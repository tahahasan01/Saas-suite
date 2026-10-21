"""The lead timeline (St02 §6.5, D-07): one stream of what happened to a record.

Tracked field changes, stage moves, won/lost/restored, notes and finished
activities land in `timeline_events`. Labels are resolved when written, so a
renamed stage doesn't rewrite history; sensitive fields say "changed" without
their values (the audit log keeps those, for admins).
"""
from __future__ import annotations

import uuid

from tests.crm.helpers import q


async def _lead(client) -> dict:
    r = await client.post("/crm/leads", json={"name": "Timeline Lead", "phone": "03001112223",
                                               "value_minor": 100_000, "force": True})
    return r.json()


async def _timeline(client, lead_id: str, **params) -> dict:
    r = await client.get(f"/crm/leads/{lead_id}/timeline", params=params)
    assert r.status_code == 200, r.text
    return r.json()


async def test_stage_moves_are_recorded_with_labels_frozen(client, crm_tenant):
    p = (await client.get("/crm/pipelines")).json()[0]
    lead = await _lead(client)
    target = p["stages"][1]
    await client.patch(f"/crm/leads/{lead['id']}", json={"stage_id": target["id"]})
    await client.patch(f"/crm/pipelines/{p['id']}/stages/{target['id']}", json={"name": "Renamed later"})
    items = (await _timeline(client, lead["id"]))["items"]
    move = next(e for e in items if e["kind"] == "stage_change")
    [change] = [c for c in move["changes"] if c["field"] == "stage_id"]
    assert (change["old_label"], change["new_label"]) == (p["stages"][0]["name"], target["name"])
    assert change["label"] == "Stage"
    assert move["actor_name"] == "Test Owner"


async def test_field_changes_and_masking(client, crm_tenant):
    lead = await _lead(client)
    await client.patch(f"/crm/leads/{lead['id']}", json={"value_minor": 250_000, "phone": "03009998887"})
    items = (await _timeline(client, lead["id"]))["items"]
    ev = next(e for e in items if e["kind"] == "field_change")
    by_field = {c["field"]: c for c in ev["changes"]}
    assert (by_field["value_minor"]["old"], by_field["value_minor"]["new"]) == (100_000, 250_000)
    phone = by_field["phone"]
    assert phone["masked"] is True and phone["old"] is None and phone["new"] is None
    # The raw row never held the number either: masking happens on write.
    raw = await q("select changes::text as c from timeline_events where id=$1", uuid.UUID(ev["id"]))
    assert "03009998887" not in raw[0]["c"] and "03001112223" not in raw[0]["c"]


async def test_an_untracked_or_unchanged_save_writes_nothing(client, crm_tenant):
    lead = await _lead(client)
    before = len((await _timeline(client, lead["id"]))["items"])
    await client.patch(f"/crm/leads/{lead['id']}", json={"value_minor": 100_000})
    assert len((await _timeline(client, lead["id"]))["items"]) == before


async def test_won_lost_restored_and_notes(client, crm_tenant):
    lead = await _lead(client)
    r = await client.post(f"/crm/leads/{lead['id']}/notes", json={"body": "Asked for a call after Eid"})
    assert r.status_code == 201, r.text
    reason = (await client.get("/crm/lost-reasons")).json()[0]
    await client.post(f"/crm/leads/{lead['id']}/lost", json={"lost_reason_id": reason["id"], "lost_note": "Budget cut"})
    await client.post(f"/crm/leads/{lead['id']}/restore")
    await client.post(f"/crm/leads/{lead['id']}/won")
    items = (await _timeline(client, lead["id"]))["items"]
    kinds = [e["kind"] for e in items]
    assert kinds[:4] == ["won", "restored", "lost", "note"]          # newest first
    lost = items[2]
    assert lost["body"] == "Budget cut"
    assert any(c["field"] == "lost_reason_id" and c["new_label"] == reason["name"] for c in lost["changes"])
    assert items[3]["body"] == "Asked for a call after Eid"
    assert (await client.post(f"/crm/leads/{lead['id']}/notes", json={"body": "  "})).status_code == 422


async def test_keyset_pagination(client, crm_tenant):
    lead = await _lead(client)
    for i in range(5):
        await client.post(f"/crm/leads/{lead['id']}/notes", json={"body": f"note {i}"})
    page1 = await _timeline(client, lead["id"], limit=2)
    assert [e["body"] for e in page1["items"]] == ["note 4", "note 3"] and page1["next_cursor"]
    page2 = await _timeline(client, lead["id"], limit=2, cursor=page1["next_cursor"])
    assert [e["body"] for e in page2["items"]] == ["note 2", "note 1"]
    assert (await client.get(f"/crm/leads/{lead['id']}/timeline", params={"cursor": "garbage"})).status_code == 422


async def test_lead_detail_carries_timeline_and_activities(client, crm_tenant):
    lead = await _lead(client)
    await client.post(f"/crm/leads/{lead['id']}/notes", json={"body": "hello"})
    detail = (await client.get(f"/crm/leads/{lead['id']}")).json()
    assert "interactions" not in detail
    assert detail["timeline"][0]["body"] == "hello"
    assert detail["activities"] == []


async def test_another_tenants_lead_has_no_timeline(client, crm_tenant):
    lead = await _lead(client)
    from tests.conftest import _drop, _signup

    other = await _signup(client, ["crm"])
    try:
        assert (await client.get(f"/crm/leads/{lead['id']}/timeline")).status_code == 404
        assert (await client.post(f"/crm/leads/{lead['id']}/notes", json={"body": "x"})).status_code == 404
    finally:
        await _drop(other)
