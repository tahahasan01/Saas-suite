"""CRM reports: funnel, lost reasons and sources, each with a CSV export (08).

The funnel counts how many leads *reached* each stage: a won lead counts for
every open stage, an open or lost lead for its stage and every earlier one
(lost keeps the stage it died in, which is what makes this possible).
"""
from __future__ import annotations

import csv
import io


async def _fresh_pipeline(client) -> dict:
    """A pipeline of our own so the sample leads don't blur the counts."""
    return (await client.post("/crm/pipelines", json={"name": "Report pipe"})).json()


async def _lead(client, pipe: dict, stage_index: int, **extra) -> dict:
    r = await client.post("/crm/leads", json={"name": f"R{stage_index}", "pipeline_id": pipe["id"],
                                               "stage_id": pipe["stages"][stage_index]["id"], "force": True, **extra})
    return r.json()


async def test_funnel_counts_leads_that_reached_each_stage(client, crm_tenant):
    pipe = await _fresh_pipeline(client)
    opens = [s for s in pipe["stages"] if not s["is_won"]]
    await _lead(client, pipe, 0, value_minor=100)
    lost = await _lead(client, pipe, 1, value_minor=200)
    await client.post(f"/crm/leads/{lost['id']}/lost", json={})
    win = await _lead(client, pipe, 0, value_minor=400)
    await client.post(f"/crm/leads/{win['id']}/won")

    r = await client.get("/crm/reports/funnel", params={"pipeline_id": pipe["id"]})
    assert r.status_code == 200, r.text
    rows = r.json()["rows"]
    assert [x["stage"] for x in rows] == [s["name"] for s in opens] + ["Won"]
    assert rows[0]["reached"] == 3 and rows[0]["value_minor"] == 700
    assert rows[1]["reached"] == 2                          # the lost one died here, the win passed
    assert rows[2]["reached"] == 1
    assert rows[-1]["reached"] == 1 and rows[-1]["value_minor"] == 400
    assert rows[1]["conversion_pct"] == 67                  # 2 of 3, rounded


async def test_lost_reasons_report(client, crm_tenant):
    pipe = await _fresh_pipeline(client)
    reasons = (await client.get("/crm/lost-reasons")).json()
    for value in (100, 300):
        lead = await _lead(client, pipe, 0, value_minor=value)
        await client.post(f"/crm/leads/{lead['id']}/lost", json={"lost_reason_id": reasons[0]["id"]})
    lead = await _lead(client, pipe, 0, value_minor=50)
    await client.post(f"/crm/leads/{lead['id']}/lost", json={})
    rows = (await client.get("/crm/reports/lost-reasons", params={"pipeline_id": pipe["id"]})).json()["rows"]
    assert rows[0] == {"reason": reasons[0]["name"], "count": 2, "value_minor": 400}
    assert {"reason": "No reason given", "count": 1, "value_minor": 50} in rows


async def test_sources_report(client, crm_tenant):
    pipe = await _fresh_pipeline(client)
    a = await _lead(client, pipe, 0, source="referral", value_minor=1000)
    await client.post(f"/crm/leads/{a['id']}/won")
    b = await _lead(client, pipe, 0, source="referral")
    await client.post(f"/crm/leads/{b['id']}/lost", json={})
    await _lead(client, pipe, 0, source="facebook")
    rows = {x["source"]: x for x in (await client.get("/crm/reports/sources",
                                                      params={"pipeline_id": pipe["id"]})).json()["rows"]}
    assert rows["referral"] == {"source": "referral", "leads": 2, "open": 0, "won": 1, "lost": 1,
                                "won_value_minor": 1000, "win_rate_pct": 50}
    assert rows["facebook"]["open"] == 1 and rows["facebook"]["win_rate_pct"] is None


async def test_reports_export_csv(client, crm_tenant):
    pipe = await _fresh_pipeline(client)
    await _lead(client, pipe, 0, source="referral", value_minor=12345)
    for name in ("funnel", "lost-reasons", "sources"):
        r = await client.get(f"/crm/reports/{name}", params={"pipeline_id": pipe["id"], "format": "csv"})
        assert r.status_code == 200, (name, r.text)
        assert r.headers["content-type"].startswith("text/csv")
        assert f'filename="crm-{name}.csv"' in r.headers["content-disposition"]
        rows = list(csv.reader(io.StringIO(r.text)))
        assert len(rows) >= 1
    funnel = list(csv.DictReader(io.StringIO((await client.get(
        "/crm/reports/funnel", params={"pipeline_id": pipe["id"], "format": "csv"})).text)))
    assert funnel[0]["value"] == "123.45"          # money in rupees for spreadsheets


async def test_reports_filter_by_created_date(client, crm_tenant):
    pipe = await _fresh_pipeline(client)
    await _lead(client, pipe, 0)
    rows = (await client.get("/crm/reports/sources", params={"pipeline_id": pipe["id"], "date_from": "2099-01-01"})).json()
    assert rows["rows"] == []
    assert (await client.get("/crm/reports/sources", params={"date_from": "yesterday"})).status_code == 422


async def test_reports_need_crm_read(client, pos_tenant):
    assert (await client.get("/crm/reports/funnel")).status_code == 403
