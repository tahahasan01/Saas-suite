"""Bulk and recurring invoices: fee vouchers (PRD INV-08, migration 0126).

A plan says what to bill, to whom (a tag or a saved list) and when it is
due. A run makes one draft per contact for review; issuing the run gives
every remaining draft its own number. One run per plan and month, made by
hand or by the daily job on the plan's day. Issued runs download as a ZIP
of PDFs."""
from __future__ import annotations

import io
import uuid
import zipfile
from datetime import date

import pytest_asyncio

from app import jobs

from ..conftest import _drop, _signup
from .helpers import login_as_rep, q


@pytest_asyncio.fixture
async def school(client):
    tenant_id = await _signup(client, ["crm"])
    yield tenant_id
    await _drop(tenant_id)


FEES = [{"description": "Tuition fee", "qty": 1, "unit_price_minor": 8_000_00},
        {"description": "Computer lab", "qty": 1, "unit_price_minor": 500_00}]


async def students(client, n: int, tag_name: str = "Class 5") -> tuple[str, list[dict]]:
    tag = (await client.post("/tags", json={"name": tag_name})).json()["id"]
    out = []
    for i in range(n):
        r = await client.post("/contacts", json={"name": f"Student {i}", "force": True, "tag_ids": [tag],
                                                 "roles": ["student"]})
        assert r.status_code == 201, r.text
        out.append(r.json())
    return tag, out


async def plan(client, **body) -> dict:
    r = await client.post("/invoices/plans", json={"name": "Class 5 monthly fee", "lines": FEES, "due_day": 10,
                                                   **body})
    assert r.status_code == 201, r.text
    return r.json()


async def run(client, plan_id: str, period: str = "2026-11") -> dict:
    r = await client.post(f"/invoices/plans/{plan_id}/runs", json={"period": period})
    assert r.status_code == 201, r.text
    return r.json()


async def test_a_run_makes_one_draft_per_student_for_review(client, school):
    tag, kids = await students(client, 3)
    await client.delete(f"/contacts/{kids[2]['id']}")          # archived: left the school
    r = await run(client, (await plan(client, tag_id=tag))["id"])
    assert r["status"] == "draft" and r["invoice_count"] == 2 and r["total_minor"] == 2 * 8_500_00
    invs = (await client.get(f"/invoices/runs/{r['id']}")).json()["invoices"]
    assert {i["contact_id"] for i in invs} == {kids[0]["id"], kids[1]["id"]}
    assert all(i["status"] == "draft" and i["number"] is None for i in invs)
    assert {i["due_date"] for i in invs} == {"2026-11-10"}
    one = (await client.get(f"/invoices/{invs[0]['id']}")).json()
    assert [ln["description"] for ln in one["lines"]] == ["Tuition fee", "Computer lab"]


async def test_one_run_per_plan_and_month(client, school):
    tag, _ = await students(client, 1)
    p = await plan(client, tag_id=tag)
    await run(client, p["id"], "2026-11")
    assert (await client.post(f"/invoices/plans/{p['id']}/runs", json={"period": "2026-11"})).status_code == 409
    assert (await client.post(f"/invoices/plans/{p['id']}/runs", json={"period": "2026-12"})).status_code == 201


async def test_issuing_numbers_every_remaining_draft(client, school):
    tag, _ = await students(client, 3)
    r = await run(client, (await plan(client, tag_id=tag))["id"])
    invs = (await client.get(f"/invoices/runs/{r['id']}")).json()["invoices"]
    assert (await client.post(f"/invoices/{invs[0]['id']}/void", json={"reason": "Fee waived"})).status_code == 200
    out = await client.post(f"/invoices/runs/{r['id']}/issue")
    assert out.status_code == 200, out.text
    assert out.json()["status"] == "issued" and out.json()["invoice_count"] == 2
    after = (await client.get(f"/invoices/runs/{r['id']}")).json()["invoices"]
    numbers = sorted(i["number"] for i in after if i["status"] == "issued")
    assert len(numbers) == 2 and len(set(numbers)) == 2
    assert [i["status"] for i in after if i["id"] == invs[0]["id"]] == ["void"]
    assert (await client.post(f"/invoices/runs/{r['id']}/issue")).status_code == 409


async def test_an_issued_run_downloads_as_a_zip_of_pdfs(client, school):
    tag, _ = await students(client, 2)
    r = await run(client, (await plan(client, tag_id=tag))["id"])
    assert (await client.get(f"/invoices/runs/{r['id']}/pdfs")).status_code == 409   # drafts have no PDF
    await client.post(f"/invoices/runs/{r['id']}/issue")
    z = await client.get(f"/invoices/runs/{r['id']}/pdfs")
    assert z.status_code == 200 and z.headers["content-type"] == "application/zip"
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    assert len(names) == 2 and all(n.endswith(".pdf") for n in names)
    assert all(zipfile.ZipFile(io.BytesIO(z.content)).read(n).startswith(b"%PDF") for n in names)


async def test_a_saved_list_can_be_the_audience(client, school):
    tag, kids = await students(client, 2)
    await client.patch(f"/contacts/{kids[1]['id']}", json={"city": "Multan"})
    seg = (await client.post("/crm/segments", json={"name": "Multan class 5",
                                                    "filter": {"tag_ids": [tag], "city": "multan"}})).json()
    r = await run(client, (await plan(client, segment_id=seg["id"]))["id"])
    assert r["invoice_count"] == 1


async def test_plans_are_checked(client, school):
    tag, _ = await students(client, 1)
    seg = (await client.post("/crm/segments", json={"name": "All", "filter": {}})).json()["id"]
    bad = [{"name": "No audience", "lines": FEES},
           {"name": "Both", "lines": FEES, "tag_id": tag, "segment_id": seg},
           {"name": "No lines", "lines": [], "tag_id": tag},
           {"name": "Late", "lines": FEES, "tag_id": tag, "due_day": 31}]
    for body in bad:
        assert (await client.post("/invoices/plans", json=body)).status_code == 422, body["name"]
    r = await client.post("/invoices/plans", json={"name": "Foreign", "lines": FEES, "tag_id": str(uuid.uuid4())})
    assert r.status_code == 404


async def test_the_daily_job_makes_this_months_run_once(client, school):
    tag, _ = await students(client, 2)
    [t] = await q("select tenant_today(timezone) as d from tenants where id = $1", uuid.UUID(school))
    today: date = t["d"]
    # A day already reached this month counts (on the 29th-31st, day 28 has passed).
    p = await plan(client, tag_id=tag, run_day=min(today.day, 28))
    first = await jobs.run_recurring_invoices()
    again = await jobs.run_recurring_invoices()
    assert first.get(school) == 1 and not again.get(school)
    runs = (await client.get(f"/invoices/plans/{p['id']}/runs")).json()
    assert [r["period"] for r in runs] == [today.replace(day=1).isoformat()]
    notes = (await client.get("/notifications")).json()
    items = notes["items"] if isinstance(notes, dict) else notes
    assert any("Class 5 monthly fee" in n["title"] + n["body"] for n in items)


async def test_making_runs_is_invoice_work_and_issuing_is_approval(client, school):
    tag, _ = await students(client, 1)
    p = await plan(client, tag_id=tag)
    r = await run(client, p["id"])
    await login_as_rep(client, school, ["read", "write"])
    assert (await client.post(f"/invoices/plans/{p['id']}/runs", json={"period": "2027-01"})).status_code == 201
    assert (await client.post(f"/invoices/runs/{r['id']}/issue")).status_code == 403
