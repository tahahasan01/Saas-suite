"""PRD INV-08's acceptance: 400 students tagged "Class 5" -> 400 numbered
invoices within 2 minutes of issuing the run. Heavy, so it runs only with
BOS_PERF=1 (e.g. before a release):

    BOS_PERF=1 python -m scripts.with_db businessos_x -- python -m pytest tests/crm/test_invoice_runs_perf.py -s
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import pytest_asyncio

from ..conftest import _drop, _signup
from .helpers import q

pytestmark = pytest.mark.skipif(os.environ.get("BOS_PERF") != "1", reason="performance check: set BOS_PERF=1")

STUDENTS = 400
BUDGET_S = 120


@pytest_asyncio.fixture
async def school(client):
    tenant_id = await _signup(client, ["crm"])
    yield tenant_id
    await _drop(tenant_id)


async def test_four_hundred_vouchers_are_drafted_and_issued_within_two_minutes(client, school):
    tag = (await client.post("/tags", json={"name": "Class 5"})).json()["id"]
    tid = uuid.UUID(school)
    # Planted directly: making 400 contacts through the API isn't what's measured.
    await q("""with c as (
                 insert into contacts (tenant_id, name, roles)
                 select $1, 'Student ' || g, array['student'] from generate_series(1, $2) g returning id)
               insert into record_tags (tenant_id, tag_id, entity_type, entity_id)
               select $1, $3, 'contact', id from c""", tid, STUDENTS, uuid.UUID(tag))
    plan = (await client.post("/invoices/plans", json={
        "name": "Class 5 monthly fee", "tag_id": tag, "due_day": 10,
        "lines": [{"description": "Tuition fee", "qty": 1, "unit_price_minor": 8_000_00, "tax_code": "gst_standard"},
                  {"description": "Computer lab", "qty": 1, "unit_price_minor": 500_00}]})).json()

    t0 = time.perf_counter()
    run = await client.post(f"/invoices/plans/{plan['id']}/runs", json={"period": "2027-07"})
    t1 = time.perf_counter()
    assert run.status_code == 201, run.text
    assert run.json()["invoice_count"] == STUDENTS
    issued = await client.post(f"/invoices/runs/{run.json()['id']}/issue")
    t2 = time.perf_counter()
    assert issued.status_code == 200, issued.text

    numbers = await q("select count(distinct number) as n from invoices where run_id = $1 and status = 'issued'",
                      uuid.UUID(run.json()["id"]))
    assert numbers[0]["n"] == STUDENTS
    print(f"\n[perf] {STUDENTS} drafts in {t1 - t0:.1f}s, issued in {t2 - t1:.1f}s, total {t2 - t0:.1f}s")
    assert t2 - t0 < BUDGET_S, f"{STUDENTS} vouchers took {t2 - t0:.0f}s (budget {BUDGET_S}s)"
