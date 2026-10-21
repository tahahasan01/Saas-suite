"""Pipelines and stages are the tenant's to shape (D-31, checklist 3B crm_v2).

CRUD and reorder; a stage holding leads can only be deleted with a `move_to`
target; a pipeline always keeps at least one open and one won stage.
"""
from __future__ import annotations


async def _pipeline(client) -> dict:
    return (await client.get("/crm/pipelines")).json()[0]


async def test_stages_carry_the_v2_flags(client, crm_tenant):
    p = await _pipeline(client)
    names = [s["name"] for s in p["stages"]]
    assert "Lost" not in names                      # lost is a status now, not a column
    won = [s for s in p["stages"] if s["is_won"]]
    assert [s["name"] for s in won] == ["Won"]
    for s in p["stages"]:
        assert {"fold", "rotting_days", "default_probability", "requirements"} <= set(s)
    open_probs = [s["default_probability"] for s in p["stages"] if not s["is_won"]]
    assert open_probs == sorted(open_probs) and all(0 < x < 100 for x in open_probs)
    assert won[0]["default_probability"] == 100


async def test_a_pipeline_can_be_created_renamed_and_deleted(client, crm_tenant):
    r = await client.post("/crm/pipelines", json={"name": "Admissions"})
    assert r.status_code == 201, r.text
    new = r.json()
    assert new["name"] == "Admissions" and not new["is_default"]
    # A new pipeline starts usable: open stages and a won stage.
    assert any(s["is_won"] for s in new["stages"]) and any(not s["is_won"] for s in new["stages"])

    r = await client.patch(f"/crm/pipelines/{new['id']}", json={"name": "Admissions 2027"})
    assert r.status_code == 200 and r.json()["name"] == "Admissions 2027"

    r = await client.delete(f"/crm/pipelines/{new['id']}")
    assert r.status_code == 204
    assert new["id"] not in [p["id"] for p in (await client.get("/crm/pipelines")).json()]


async def test_deleting_a_pipeline_with_leads_needs_a_target(client, crm_tenant):
    new = (await client.post("/crm/pipelines", json={"name": "Wholesale"})).json()
    lead = (await client.post("/crm/leads", json={"name": "Bulk buyer", "pipeline_id": new["id"],
                                                   "force": True})).json()
    r = await client.delete(f"/crm/pipelines/{new['id']}")
    assert r.status_code == 409
    main = next(p for p in (await client.get("/crm/pipelines")).json() if p["is_default"])
    r = await client.delete(f"/crm/pipelines/{new['id']}?move_to={main['id']}")
    assert r.status_code == 204, r.text
    moved = (await client.get(f"/crm/leads/{lead['id']}")).json()["lead"]
    assert moved["pipeline_id"] == main["id"]
    assert moved["stage_id"] == main["stages"][0]["id"]


async def test_the_last_pipeline_cannot_be_deleted(client, crm_tenant):
    p = await _pipeline(client)
    assert (await client.delete(f"/crm/pipelines/{p['id']}")).status_code == 409


async def test_making_another_pipeline_default_unsets_the_old_one(client, crm_tenant):
    new = (await client.post("/crm/pipelines", json={"name": "Second"})).json()
    r = await client.patch(f"/crm/pipelines/{new['id']}", json={"is_default": True})
    assert r.status_code == 200
    defaults = [p["id"] for p in (await client.get("/crm/pipelines")).json() if p["is_default"]]
    assert defaults == [new["id"]]


async def test_stage_crud_and_flags(client, crm_tenant):
    p = await _pipeline(client)
    r = await client.post(f"/crm/pipelines/{p['id']}/stages", json={
        "name": "Site visit", "default_probability": 50, "rotting_days": 7,
        "requirements": "Confirm the address first", "fold": False})
    assert r.status_code == 201, r.text
    st = r.json()
    assert (st["default_probability"], st["rotting_days"], st["requirements"]) == (50, 7, "Confirm the address first")
    # Added at the end of the open stages, before the won column.
    stages = (await _pipeline(client))["stages"]
    assert [s["id"] for s in stages].index(st["id"]) == len(stages) - 2

    r = await client.patch(f"/crm/pipelines/{p['id']}/stages/{st['id']}", json={"name": "Visit", "fold": True})
    assert r.status_code == 200 and r.json()["name"] == "Visit" and r.json()["fold"] is True

    assert (await client.patch(f"/crm/pipelines/{p['id']}/stages/{st['id']}",
                               json={"default_probability": 140})).status_code == 422
    assert (await client.patch(f"/crm/pipelines/{p['id']}/stages/{st['id']}",
                               json={"rotting_days": 0})).status_code == 422

    r = await client.delete(f"/crm/pipelines/{p['id']}/stages/{st['id']}")
    assert r.status_code == 204


async def test_a_stage_with_leads_is_deleted_only_with_move_to(client, crm_tenant):
    p = await _pipeline(client)
    first, second = p["stages"][0], p["stages"][1]
    lead = (await client.post("/crm/leads", json={"name": "Mover", "stage_id": first["id"], "force": True})).json()
    r = await client.delete(f"/crm/pipelines/{p['id']}/stages/{first['id']}")
    assert r.status_code == 409
    assert (await client.delete(
        f"/crm/pipelines/{p['id']}/stages/{first['id']}?move_to={first['id']}")).status_code == 422
    r = await client.delete(f"/crm/pipelines/{p['id']}/stages/{first['id']}?move_to={second['id']}")
    assert r.status_code == 204, r.text
    assert (await client.get(f"/crm/leads/{lead['id']}")).json()["lead"]["stage_id"] == second["id"]


async def test_move_to_must_be_a_stage_of_the_same_pipeline(client, crm_tenant):
    p = await _pipeline(client)
    other = (await client.post("/crm/pipelines", json={"name": "Other"})).json()
    first = p["stages"][0]
    await client.post("/crm/leads", json={"name": "Stay", "stage_id": first["id"], "force": True})
    r = await client.delete(f"/crm/pipelines/{p['id']}/stages/{first['id']}?move_to={other['stages'][0]['id']}")
    assert r.status_code == 422


async def test_a_pipeline_keeps_one_open_and_one_won_stage(client, crm_tenant):
    p = await _pipeline(client)
    won = next(s for s in p["stages"] if s["is_won"])
    assert (await client.delete(f"/crm/pipelines/{p['id']}/stages/{won['id']}")).status_code == 409
    assert (await client.patch(f"/crm/pipelines/{p['id']}/stages/{won['id']}",
                               json={"is_won": False})).status_code == 409
    # Turn every open stage into a won stage except the last one: refused at the last.
    opens = [s for s in p["stages"] if not s["is_won"]]
    for s in opens[:-1]:
        assert (await client.patch(f"/crm/pipelines/{p['id']}/stages/{s['id']}",
                                   json={"is_won": True})).status_code == 200
    assert (await client.patch(f"/crm/pipelines/{p['id']}/stages/{opens[-1]['id']}",
                               json={"is_won": True})).status_code == 409


async def test_toggling_is_won_re_evaluates_the_leads_in_the_stage(client, crm_tenant):
    p = await _pipeline(client)
    stage = p["stages"][1]
    lead = (await client.post("/crm/leads", json={"name": "Flip", "stage_id": stage["id"], "force": True})).json()
    assert lead["status"] == "open"
    await client.patch(f"/crm/pipelines/{p['id']}/stages/{stage['id']}", json={"is_won": True})
    got = (await client.get(f"/crm/leads/{lead['id']}")).json()["lead"]
    assert got["status"] == "won" and got["won_at"] is not None
    await client.patch(f"/crm/pipelines/{p['id']}/stages/{stage['id']}", json={"is_won": False})
    got = (await client.get(f"/crm/leads/{lead['id']}")).json()["lead"]
    assert got["status"] == "open" and got["won_at"] is None


async def test_reorder_takes_the_full_ordered_list(client, crm_tenant):
    p = await _pipeline(client)
    ids = [s["id"] for s in p["stages"]]
    new_order = [ids[1], ids[0], *ids[2:]]
    r = await client.put(f"/crm/pipelines/{p['id']}/stages/order", json={"stage_ids": new_order})
    assert r.status_code == 200, r.text
    assert [s["id"] for s in (await _pipeline(client))["stages"]] == new_order
    # A partial or foreign list is refused, never half-applied.
    assert (await client.put(f"/crm/pipelines/{p['id']}/stages/order",
                             json={"stage_ids": new_order[:-1]})).status_code == 422
    assert [s["id"] for s in (await _pipeline(client))["stages"]] == new_order


async def test_managing_pipelines_needs_the_admin_grant(client, crm_tenant):
    """A sales rep (crm write, no admin) works leads but doesn't redesign the pipeline."""
    from tests.crm.helpers import login_as_rep

    p = await _pipeline(client)
    await login_as_rep(client, crm_tenant.tenant_id, actions=["read", "write"])
    assert (await client.post("/crm/pipelines", json={"name": "Nope"})).status_code == 403
    assert (await client.post(f"/crm/pipelines/{p['id']}/stages", json={"name": "Nope"})).status_code == 403
    assert (await client.get("/crm/pipelines")).status_code == 200
