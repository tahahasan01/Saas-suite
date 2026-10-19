"""FBR filing must be exactly-once and never lose a sale (audit P0-3, P0-4).

FBR itself is faked: `fbr.post_invoice` is replaced by a recorder whose
outcomes each test scripts. Everything else — the sale, the return, the retry
job, the database — is the real code path.
"""
from __future__ import annotations

import uuid

import asyncpg
import pytest
import pytest_asyncio

from app import fbr, fbr_submit
from app.config import settings


class FakeFbr:
    """Stands in for PRAL. `outcomes` is consumed in order; when it runs out,
    every call succeeds with a fresh invoice number."""

    def __init__(self):
        self.payloads: list[dict] = []
        self.outcomes: list = []
        self._n = 0

    async def __call__(self, cfg, payload):
        self.payloads.append(payload)
        outcome = self.outcomes.pop(0) if self.outcomes else "ok"
        if isinstance(outcome, Exception):
            raise outcome
        if outcome == "fail":
            return fbr.FbrResult(ok=False, error_code="0401", error="Seller not registered")
        self._n += 1
        return fbr.FbrResult(ok=True, invoice_number=f"FBR-{self._n}")


@pytest.fixture
def fake_fbr(monkeypatch):
    fake = FakeFbr()
    monkeypatch.setattr(fbr, "post_invoice", fake)
    return fake


@pytest_asyncio.fixture
async def fbr_shop(client, pos_tenant, fake_fbr):
    r = await client.put("/fbr/settings", json={
        "seller_ntn_cnic": "1234567", "seller_business_name": "Fixture Traders",
        "seller_province": "Punjab", "seller_address": "1 Mall Road, Lahore",
        "token": "sandbox-token", "enabled": True,
    })
    r.raise_for_status()
    p = (await client.get("/pos/products")).json()[0]
    await client.patch(f"/pos/products/{p['id']}", json={"price_minor": 10_000, "stock_qty": 50})
    return {"product_id": p["id"]}


async def _sell(client, product_id, qty=1):
    return await client.post("/pos/sales", json={
        "items": [{"product_id": product_id, "qty": qty}],
        "paid_minor": 10_000 * qty, "discount_minor": 0, "payment_method": "cash"})


async def _fbr_rows(sale_id: str) -> list[asyncpg.Record]:
    owner = await asyncpg.connect(settings.database_url)
    try:
        return await owner.fetch(
            "select * from pos_fbr_invoices where sale_id=$1 order by created_at", uuid.UUID(sale_id))
    finally:
        await owner.close()


async def test_a_sale_is_queued_for_fbr_even_if_transmission_blows_up(client, fbr_shop, fake_fbr):
    """P0-4: the old code committed the sale, then called FBR outside the
    transaction — a crash in between left a sale no retry could ever find."""
    fake_fbr.outcomes = [ConnectionResetError("PRAL dropped the connection")]
    r = await _sell(client, fbr_shop["product_id"])
    assert r.status_code == 201
    rows = await _fbr_rows(r.json()["id"])
    assert len(rows) == 1
    assert rows[0]["status"] == "pending"


async def test_retrying_a_pending_return_files_a_debit_note_not_another_sale(client, fbr_shop, fake_fbr):
    """P0-3: retry rebuilt the *original sale* for every pending row, so a
    pending debit note was re-filed as a duplicate Sale Invoice every 2 min."""
    sale = (await _sell(client, fbr_shop["product_id"], qty=2)).json()
    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    fake_fbr.outcomes = ["fail"]  # the debit note doesn't land the first time
    r = await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": item["sale_item_id"], "qty": 1}], "reason": "Damaged"})
    assert r.status_code == 201

    fake_fbr.payloads.clear()
    await fbr_submit.retry_pending()

    kinds = [p["invoiceType"] for p in fake_fbr.payloads]
    assert kinds == ["Debit Note"]
    assert fake_fbr.payloads[0]["invoiceRefNo"] == "FBR-1"
    statuses = {(row["return_id"] is None): row["status"] for row in await _fbr_rows(sale["id"])}
    assert statuses == {True: "submitted", False: "submitted"}


async def test_a_filing_that_keeps_failing_ends_in_failed(client, fbr_shop, fake_fbr):
    fake_fbr.outcomes = ["fail"]
    sale = (await _sell(client, fbr_shop["product_id"])).json()
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute("update pos_fbr_invoices set attempts=$1 where sale_id=$2",
                            fbr_submit.MAX_ATTEMPTS - 1, uuid.UUID(sale["id"]))
    finally:
        await owner.close()
    fake_fbr.outcomes = ["fail"]
    await fbr_submit.retry_pending()
    rows = await _fbr_rows(sale["id"])
    assert rows[0]["status"] == "failed"


async def test_a_return_made_before_its_sale_is_filed_waits_then_follows_the_sale(
        client, fbr_shop, fake_fbr):
    """A debit note must reference the sale's FBR invoice number, so it can only
    be filed after the sale. The old code silently skipped such returns forever."""
    fake_fbr.outcomes = ["fail"]  # FBR is down when the sale happens
    sale = (await _sell(client, fbr_shop["product_id"], qty=2)).json()
    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    r = await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": item["sale_item_id"], "qty": 1}], "reason": "Damaged"})
    assert r.status_code == 201

    fake_fbr.payloads.clear()
    await fbr_submit.retry_pending()  # FBR is back

    assert [p["invoiceType"] for p in fake_fbr.payloads] == ["Sale Invoice", "Debit Note"]
    assert fake_fbr.payloads[1]["invoiceRefNo"] == "FBR-1"
    assert {row["status"] for row in await _fbr_rows(sale["id"])} == {"submitted"}
