"""What FBR is told about a sale is frozen at the moment of sale (1D, 6.2).

Each sale line snapshots the FBR-relevant product fields (HS code, UoM, the
tax rate that applied, inclusive or exclusive). A retry, a debit note and a
refund's tax all read those snapshots — editing the product afterwards must
not change what gets filed.
"""
from __future__ import annotations

import uuid

import asyncpg
import pytest_asyncio

from app import fbr_submit
from app.config import settings

SELLER = {"seller_ntn_cnic": "1234567", "seller_business_name": "Fixture Traders",
          "seller_province": "Punjab", "seller_address": "1 Mall Road, Lahore",
          "token": "sandbox-token"}


@pytest_asyncio.fixture
async def shop(client, pos_tenant, fake_fbr):
    """One Rs 100 product at 18%, tax-exclusive, HS 0101.2100; FBR on."""
    products = (await client.get("/pos/products")).json()
    for p in products:
        await client.patch(f"/pos/products/{p['id']}", json={"hs_code": "0101.2100"})
    pid = products[0]["id"]
    await client.patch(f"/pos/products/{pid}", json={"price_minor": 10_000, "tax_rate": 18, "stock_qty": 50})
    r = await client.put("/fbr/settings", json={**SELLER, "prices_include_tax": False, "enabled": True})
    r.raise_for_status()
    return pid


async def _sell(client, pid, qty=2):
    r = await client.post("/pos/sales", json={"items": [{"product_id": pid, "qty": qty}],
                                              "payment_method": "card"})
    assert r.status_code == 201, r.text
    return r.json()


async def _owner_fetch(sql, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _edit_product(client, pid):
    """The shop owner fixes the product after the sale: new HS code, new rate, new UoM."""
    r = await client.patch(f"/pos/products/{pid}", json={
        "hs_code": "9999.9999", "tax_rate": 5, "fbr_uom": "KG"})
    assert r.status_code == 200, r.text


async def test_a_sale_line_records_what_fbr_needs_at_the_moment_of_sale(client, shop):
    sale = await _sell(client, shop)
    [line] = await _owner_fetch(
        """select hs_code, fbr_uom, tax_rate, tax_inclusive, excl_minor, tax_minor, total_minor,
                  snapshot_source
             from pos_sale_items where sale_id=$1""", uuid.UUID(sale["id"]))
    assert line["hs_code"] == "0101.2100"
    assert line["fbr_uom"] == "Numbers, pieces, units"
    assert line["tax_rate"] == 18
    assert line["tax_inclusive"] is False
    assert (line["excl_minor"], line["tax_minor"], line["total_minor"]) == (20_000, 3_600, 23_600)
    assert line["snapshot_source"] == "sale"


async def test_a_retry_files_what_was_sold_not_the_edited_product(client, shop, fake_fbr):
    fake_fbr.outcomes = ["fail"]           # FBR is down at the till
    sale = await _sell(client, shop)
    await _edit_product(client, shop)

    fake_fbr.payloads.clear()
    await _owner_fetch("update outbox set run_after = now() where dedup_key=$1", sale["id"])  # skip back-off
    await fbr_submit.process_outbox()

    [doc] = fake_fbr.payloads
    [item] = doc["items"]
    assert (item["hsCode"], item["rate"], item["uoM"]) == ("0101.2100", "18%", "Numbers, pieces, units")
    assert item["salesTaxApplicable"] == 36.0
    assert doc["invoiceType"] == "Sale Invoice"
    assert sale["tax_minor"] == 3_600


async def test_a_debit_note_and_its_refund_tax_use_the_sale_snapshot(client, shop, fake_fbr):
    sale = await _sell(client, shop)       # filed as FBR-1
    await _edit_product(client, shop)
    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]

    r = await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": item["sale_item_id"], "qty": 1}]})
    assert r.status_code == 201, r.text
    ret = r.json()
    assert ret["refund_minor"] == 11_800
    assert ret["tax_minor"] == 1_800       # 18% inside Rs 118, not the edited 5%

    note = fake_fbr.payloads[-1]
    assert note["invoiceType"] == "Debit Note"
    assert (note["items"][0]["hsCode"], note["items"][0]["rate"]) == ("0101.2100", "18%")
