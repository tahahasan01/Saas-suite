"""Lead tags share the contacts tag list (record_tags, St02 P1)."""
from __future__ import annotations

import uuid


async def _tag(client, name: str) -> dict:
    r = await client.post("/tags", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()


async def test_a_lead_is_tagged_on_create_and_edit_and_filtered_by_tag(client, crm_tenant):
    hot, vip = await _tag(client, "Hot"), await _tag(client, "VIP")
    r = await client.post("/crm/leads", json={"name": "Tagged", "force": True, "tag_ids": [hot["id"]]})
    assert r.status_code == 201, r.text
    lead = r.json()
    assert [t["name"] for t in lead["tags"]] == ["Hot"]
    other = (await client.post("/crm/leads", json={"name": "Plain", "force": True})).json()
    assert other["tags"] == []

    r = await client.patch(f"/crm/leads/{lead['id']}", json={"tag_ids": [vip["id"], hot["id"], hot["id"]]})
    assert r.status_code == 200, r.text
    assert [t["name"] for t in r.json()["tags"]] == ["Hot", "VIP"]
    detail = (await client.get(f"/crm/leads/{lead['id']}")).json()
    assert [t["name"] for t in detail["lead"]["tags"]] == ["Hot", "VIP"]

    ids = [x["id"] for x in (await client.get(f"/crm/leads?tag_id={vip['id']}")).json()]
    assert ids == [lead["id"]]
    assert other["id"] in [x["id"] for x in (await client.get("/crm/leads")).json()]

    r = await client.patch(f"/crm/leads/{lead['id']}", json={"tag_ids": []})
    assert r.json()["tags"] == []


async def test_an_unknown_tag_is_404(client, crm_tenant):
    r = await client.post("/crm/leads", json={"name": "X", "force": True, "tag_ids": [str(uuid.uuid4())]})
    assert r.status_code == 404
    lead = (await client.post("/crm/leads", json={"name": "Y", "force": True})).json()
    r = await client.patch(f"/crm/leads/{lead['id']}", json={"tag_ids": [str(uuid.uuid4())]})
    assert r.status_code == 404
