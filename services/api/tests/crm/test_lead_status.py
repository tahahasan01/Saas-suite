"""Lost is a status with a reason and a note, not a stage (D-31, §6.3).

A lead is open, won or lost. Won follows the stage's `is_won` flag (or the
Won action); lost keeps the stage the deal died in, for the funnel; restore
reopens it. Probability is automatic from the stage unless set by hand.
"""
from __future__ import annotations

import pytest


async def _pipeline(client) -> dict:
    return (await client.get("/crm/pipelines")).json()[0]


async def _new_lead(client, **extra) -> dict:
    r = await client.post("/crm/leads", json={"name": "Status Lead", "force": True, **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def _get(client, lead_id: str) -> dict:
    return (await client.get(f"/crm/leads/{lead_id}")).json()["lead"]


async def _rule(client, trigger: str) -> None:
    r = await client.post("/workflows", json={
        "name": trigger, "trigger": trigger,
        "actions": [{"type": "notify", "recipient": "actor", "message": f"{trigger}: {{name}}"}]})
    assert r.status_code == 201, r.text


async def _titles(client) -> list[str]:
    return [n["title"] for n in (await client.get("/notifications")).json()["items"]]


async def test_a_new_lead_is_open_with_the_stage_probability(client, crm_tenant):
    p = await _pipeline(client)
    lead = await _new_lead(client, value_minor=1_000_000)
    assert lead["status"] == "open"
    assert lead["probability"] == p["stages"][0]["default_probability"]
    assert lead["probability_is_manual"] is False
    assert lead["weighted_value_minor"] == 1_000_000 * lead["probability"] // 100
    assert lead["priority"] == 0 and lead["expected_close_date"] is None


async def test_moving_into_a_won_stage_wins_the_lead_and_fires_lead_won(client, crm_tenant):
    await _rule(client, "lead.won")
    p = await _pipeline(client)
    won = next(s for s in p["stages"] if s["is_won"])
    lead = await _new_lead(client)
    r = await client.patch(f"/crm/leads/{lead['id']}", json={"stage_id": won["id"]})
    assert r.status_code == 200
    got = r.json()
    assert (got["status"], got["probability"]) == ("won", 100) and got["won_at"]
    titles = await _titles(client)
    assert "lead.won: Status Lead" in titles
    assert "Deal won: Status Lead" in titles     # the seeded automation still works


async def test_moving_a_won_lead_back_reopens_it(client, crm_tenant):
    p = await _pipeline(client)
    won = next(s for s in p["stages"] if s["is_won"])
    lead = await _new_lead(client)
    await client.patch(f"/crm/leads/{lead['id']}", json={"stage_id": won["id"]})
    got = (await client.patch(f"/crm/leads/{lead['id']}", json={"stage_id": p["stages"][1]["id"]})).json()
    assert got["status"] == "open" and got["won_at"] is None
    assert got["probability"] == p["stages"][1]["default_probability"]


async def test_the_won_action_moves_to_the_won_stage(client, crm_tenant):
    p = await _pipeline(client)
    lead = await _new_lead(client)
    r = await client.post(f"/crm/leads/{lead['id']}/won")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "won"
    assert r.json()["stage_id"] == next(s for s in p["stages"] if s["is_won"])["id"]
    assert (await client.post(f"/crm/leads/{lead['id']}/won")).status_code == 409


async def test_lost_keeps_the_stage_and_records_reason_and_note(client, crm_tenant):
    await _rule(client, "lead.lost")
    p = await _pipeline(client)
    reasons = (await client.get("/crm/lost-reasons")).json()
    assert len(reasons) >= 5
    lead = await _new_lead(client, stage_id=p["stages"][2]["id"])
    r = await client.post(f"/crm/leads/{lead['id']}/lost",
                          json={"lost_reason_id": reasons[0]["id"], "lost_note": "Went with the cheaper shop"})
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["status"] == "lost" and got["lost_at"] and got["probability"] == 0
    assert got["stage_id"] == p["stages"][2]["id"]
    assert (got["lost_reason_id"], got["lost_reason"]) == (reasons[0]["id"], reasons[0]["name"])
    assert got["lost_note"] == "Went with the cheaper shop"
    assert "lead.lost: Status Lead" in await _titles(client)
    assert (await client.post(f"/crm/leads/{lead['id']}/lost", json={})).status_code == 409


async def test_a_reason_is_optional_by_default(client, crm_tenant):
    lead = await _new_lead(client)
    r = await client.post(f"/crm/leads/{lead['id']}/lost", json={})
    assert r.status_code == 200 and r.json()["lost_reason_id"] is None


async def test_restore_reopens_a_lost_lead(client, crm_tenant):
    await _rule(client, "lead.restored")
    p = await _pipeline(client)
    lead = await _new_lead(client, stage_id=p["stages"][1]["id"])
    await client.patch(f"/crm/leads/{lead['id']}", json={"probability": 70})
    reason = (await client.get("/crm/lost-reasons")).json()[0]
    await client.post(f"/crm/leads/{lead['id']}/lost", json={"lost_reason_id": reason["id"], "lost_note": "x"})
    r = await client.post(f"/crm/leads/{lead['id']}/restore")
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["status"] == "open"
    assert (got["lost_at"], got["lost_reason_id"], got["lost_note"]) == (None, None, None)
    assert got["probability_is_manual"] is False
    assert got["probability"] == p["stages"][1]["default_probability"]
    assert "lead.restored: Status Lead" in await _titles(client)
    assert (await client.post(f"/crm/leads/{lead['id']}/restore")).status_code == 409


async def test_status_filters_the_lead_list(client, crm_tenant):
    lead = await _new_lead(client)
    await client.post(f"/crm/leads/{lead['id']}/lost", json={})
    all_ids = [x["id"] for x in (await client.get("/crm/leads")).json()]
    board_ids = [x["id"] for x in (await client.get("/crm/leads?status=open,won")).json()]
    lost_ids = [x["id"] for x in (await client.get("/crm/leads?status=lost")).json()]
    assert lead["id"] in all_ids and lead["id"] in lost_ids and lead["id"] not in board_ids
    assert (await client.get("/crm/leads?status=deleted")).status_code == 422


async def test_summary_counts_by_status(client, crm_tenant):
    before = (await client.get("/crm/summary")).json()
    lead = await _new_lead(client, value_minor=500_000)
    await client.post(f"/crm/leads/{lead['id']}/lost", json={})
    after = (await client.get("/crm/summary")).json()
    assert after["open_leads"] == before["open_leads"]
    win = await _new_lead(client, value_minor=700_000)
    await client.post(f"/crm/leads/{win['id']}/won")
    assert (await client.get("/crm/summary")).json()["won_value_minor"] == before["won_value_minor"] + 700_000


# ── Probability, priority, expected close ───────────────────────────────────
async def test_a_manual_probability_survives_stage_moves_until_reset(client, crm_tenant):
    p = await _pipeline(client)
    lead = await _new_lead(client, value_minor=333)
    got = (await client.patch(f"/crm/leads/{lead['id']}", json={"probability": 50})).json()
    assert (got["probability"], got["probability_is_manual"]) == (50, True)
    assert got["weighted_value_minor"] == 167          # 166.5 paisa, half-up
    got = (await client.patch(f"/crm/leads/{lead['id']}", json={"stage_id": p["stages"][2]["id"]})).json()
    assert got["probability"] == 50
    got = (await client.patch(f"/crm/leads/{lead['id']}", json={"probability_auto": True})).json()
    assert got["probability_is_manual"] is False
    assert got["probability"] == p["stages"][2]["default_probability"]


@pytest.mark.parametrize("bad", [{"probability": 101}, {"probability": -1}, {"priority": 4},
                                 {"priority": -1}, {"expected_close_date": "soon"}])
async def test_lead_field_bounds(client, crm_tenant, bad):
    lead = await _new_lead(client)
    assert (await client.patch(f"/crm/leads/{lead['id']}", json=bad)).status_code == 422


async def test_priority_and_expected_close_are_saved(client, crm_tenant):
    lead = await _new_lead(client, priority=2, expected_close_date="2027-01-31")
    assert (lead["priority"], lead["expected_close_date"]) == (2, "2027-01-31")
    got = (await client.patch(f"/crm/leads/{lead['id']}", json={"priority": 3})).json()
    assert got["priority"] == 3


# ── Lost reasons (an editable list) ─────────────────────────────────────────
async def test_lost_reasons_can_be_added_renamed_and_retired(client, crm_tenant):
    r = await client.post("/crm/lost-reasons", json={"name": "Moved abroad"})
    assert r.status_code == 201, r.text
    reason = r.json()
    r = await client.patch(f"/crm/lost-reasons/{reason['id']}", json={"name": "Moved away"})
    assert r.status_code == 200 and r.json()["name"] == "Moved away"
    assert (await client.post("/crm/lost-reasons", json={"name": "moved AWAY"})).status_code == 409

    lead = await _new_lead(client)
    await client.post(f"/crm/leads/{lead['id']}/lost", json={"lost_reason_id": reason["id"]})
    # In use: retired (hidden from the picker), never deleted, so history keeps its words.
    assert (await client.delete(f"/crm/lost-reasons/{reason['id']}")).status_code == 204
    assert reason["id"] not in [x["id"] for x in (await client.get("/crm/lost-reasons")).json()]
    assert reason["id"] in [x["id"] for x in (await client.get("/crm/lost-reasons?include_retired=true")).json()]
    assert (await _get(client, lead["id"]))["lost_reason"] == "Moved away"
    # A retired reason can't be picked for a new loss.
    other = await _new_lead(client)
    assert (await client.post(f"/crm/leads/{other['id']}/lost",
                              json={"lost_reason_id": reason["id"]})).status_code == 422

    unused = (await client.post("/crm/lost-reasons", json={"name": "Spam"})).json()
    assert (await client.delete(f"/crm/lost-reasons/{unused['id']}")).status_code == 204
    assert unused["id"] not in [x["id"] for x in
                                (await client.get("/crm/lost-reasons?include_retired=true")).json()]


async def test_a_rep_can_mark_lost_but_not_edit_reasons(client, crm_tenant):
    from tests.crm.helpers import login_as_rep

    lead = await _new_lead(client)
    await login_as_rep(client, crm_tenant.tenant_id, actions=["read", "write"])
    assert (await client.post(f"/crm/leads/{lead['id']}/lost", json={})).status_code == 200
    assert (await client.post("/crm/lost-reasons", json={"name": "Nope"})).status_code == 403
