"""The FBR outbox (D-09, checklist 1C, 6.2, 7.3).

Every sale and return of an FBR tenant writes one `outbox` row in its own
transaction, carrying the frozen FBR document. A worker delivers due rows
with back-off; a row that keeps failing ends in `failed` and alerts the
owners; a request that may have reached FBR without an answer ends in
`unknown` and is reconciled before anything is resent — FBR has no
idempotency key, so a blind resend could file the same sale twice.

FBR is the shared `fake_fbr`; everything else is the real code path.
"""
from __future__ import annotations

import asyncio
import json
import re
import uuid
from pathlib import Path

import asyncpg
import pytest_asyncio

from app import fbr, fbr_submit
from app.config import settings

MIGRATION = Path(__file__).resolve().parents[4] / "infra" / "migrations" / "0035_outbox.sql"
SELLER = {"seller_ntn_cnic": "1234567", "seller_business_name": "Fixture Traders",
          "seller_province": "Punjab", "seller_address": "1 Mall Road, Lahore",
          "token": "sandbox-token"}


@pytest_asyncio.fixture
async def shop(client, pos_tenant, fake_fbr):
    for p in (await client.get("/pos/products")).json():
        await client.patch(f"/pos/products/{p['id']}", json={"hs_code": "0101.2100"})
    (await client.put("/fbr/settings", json={**SELLER, "enabled": True})).raise_for_status()
    p = (await client.get("/pos/products")).json()[0]
    await client.patch(f"/pos/products/{p['id']}", json={"price_minor": 10_000, "stock_qty": 50})
    return {"tenant_id": pos_tenant.tenant_id, "product_id": p["id"]}


async def _q(sql, *args):
    conn = await asyncpg.connect(settings.database_url)
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _sell(client, shop, qty=2):
    r = await client.post("/pos/sales", json={"items": [{"product_id": shop["product_id"], "qty": qty}],
                                              "payment_method": "card"})
    assert r.status_code == 201, r.text
    return r.json()


async def _return_one(client, sale):
    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    r = await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": item["sale_item_id"], "qty": 1}], "reason": "Damaged"})
    assert r.status_code == 201, r.text
    return r.json()


async def _outbox(shop):
    return await _q("select * from outbox where tenant_id=$1 order by id", uuid.UUID(shop["tenant_id"]))


async def _filings(shop):
    return await _q("select * from pos_fbr_invoices where tenant_id=$1 order by created_at",
                    uuid.UUID(shop["tenant_id"]))


async def _due_now(shop):
    """Skip the back-off wait, as if the clock had moved on."""
    await _q("update outbox set run_after = now() where tenant_id=$1", uuid.UUID(shop["tenant_id"]))


async def _alerts(shop):
    return await _q("select title, body, kind, link from notifications where tenant_id=$1 and link='/settings/fbr'",
                    uuid.UUID(shop["tenant_id"]))


# ── One row per document, in the document's transaction ─────────────────────
async def test_a_sale_writes_one_outbox_row_holding_the_frozen_document(client, shop, fake_fbr):
    sale = await _sell(client, shop)
    [row] = await _outbox(shop)
    assert (row["kind"], row["dedup_key"], row["status"], row["attempts"]) == \
        ("fbr.submit_sale", sale["id"], "done", 1)
    doc = row["payload"]["document"]
    assert doc["invoiceType"] == "Sale Invoice"
    assert doc["items"][0]["hsCode"] == "0101.2100"
    [sent] = fake_fbr.payloads
    assert (sent["items"], sent["invoiceDate"]) == (doc["items"], doc["invoiceDate"])
    [filing] = await _filings(shop)
    assert filing["outbox_id"] == row["id"]
    assert (filing["status"], filing["fbr_invoice_number"]) == ("submitted", "FBR-1")


async def test_a_crash_between_commit_and_send_leaves_a_row_the_worker_files_once(
        client, shop, fake_fbr, monkeypatch):
    """P0-4: the process dies after the sale commits, before the fast path runs."""
    async def crashed(outbox_id):
        return fbr_submit.BUSY
    monkeypatch.setattr(fbr_submit, "deliver_now", crashed)
    sale = await _sell(client, shop)
    assert sale["fbr_status"] == "pending"
    assert [r["status"] for r in await _outbox(shop)] == ["pending"]
    assert fake_fbr.payloads == []

    await fbr_submit.process_outbox()
    await fbr_submit.process_outbox()
    assert len(fake_fbr.payloads) == 1
    assert [r["status"] for r in await _outbox(shop)] == ["done"]


async def test_a_return_writes_a_debit_note_row_that_depends_on_its_sale(client, shop):
    sale = await _sell(client, shop)
    ret = await _return_one(client, sale)
    sale_row, note_row = await _outbox(shop)
    assert (note_row["kind"], note_row["dedup_key"]) == ("fbr.submit_debit_note", ret["id"])
    assert note_row["depends_on"] == sale_row["id"]
    assert note_row["status"] == "done"


# ── Back-off, terminal failure, alerts ──────────────────────────────────────
async def test_a_failed_attempt_waits_before_the_next_one(client, shop, fake_fbr):
    fake_fbr.outcomes = ["fail"]
    sale = await _sell(client, shop)
    assert sale["fbr_status"] == "pending"
    [row] = await _q("select status, attempts, run_after - now() as wait from outbox where dedup_key=$1",
                     sale["id"])
    assert (row["status"], row["attempts"]) == ("retry", 1)
    assert row["wait"].total_seconds() > 30     # base 60 s, jittered

    fake_fbr.payloads.clear()
    await fbr_submit.process_outbox()           # not due yet: nothing is sent
    assert fake_fbr.payloads == []


async def test_after_max_attempts_the_row_fails_for_good_and_owners_are_alerted(client, shop, fake_fbr):
    fake_fbr.outcomes = ["fail"]
    sale = await _sell(client, shop)
    await _q("update outbox set attempts = max_attempts - 1, run_after = now() where dedup_key=$1", sale["id"])
    fake_fbr.outcomes = ["fail"]
    await fbr_submit.process_outbox()

    [row] = await _outbox(shop)
    assert (row["status"], row["attempts"]) == ("failed", row["max_attempts"])
    assert [f["status"] for f in await _filings(shop)] == ["failed"]
    [alert] = await _alerts(shop)
    assert alert["kind"] == "error"
    assert "FBR" in alert["title"]

    fake_fbr.payloads.clear()
    await _due_now(shop)
    await fbr_submit.process_outbox()           # terminal: never picked up again
    assert fake_fbr.payloads == []
    assert len(await _alerts(shop)) == 1


# ── Unknown: reconcile before any resend ────────────────────────────────────
async def test_a_timeout_after_sending_is_unknown_and_is_never_blindly_resent(client, shop, fake_fbr):
    fake_fbr.outcomes = ["timeout"]
    sale = await _sell(client, shop)
    assert sale["fbr_status"] == "unknown"
    [row] = await _outbox(shop)
    assert row["status"] == "unknown"
    assert [f["status"] for f in await _filings(shop)] == ["unknown"]

    fake_fbr.payloads.clear()
    for _ in range(2):
        await _due_now(shop)
        await fbr_submit.process_outbox()
    assert fake_fbr.payloads == []              # PRAL offers no lookup: wait for a person
    assert [r["status"] for r in await _outbox(shop)] == ["unknown"]
    assert len(await _alerts(shop)) == 1        # owners told once, not every run


async def test_an_unknown_row_that_fbr_says_it_filed_is_closed_without_resending(
        client, shop, fake_fbr, monkeypatch):
    fake_fbr.outcomes = ["timeout"]
    sale = await _sell(client, shop)

    async def lookup(cfg, document):
        return fbr.LookupResult(status="found", invoice_number="FBR-77")
    monkeypatch.setattr(fbr, "lookup_invoice", lookup)
    fake_fbr.payloads.clear()
    await fbr_submit.process_outbox()

    assert fake_fbr.payloads == []
    assert [r["status"] for r in await _outbox(shop)] == ["done"]
    [filing] = await _filings(shop)
    assert (filing["status"], filing["fbr_invoice_number"]) == ("submitted", "FBR-77")
    assert (await client.get(f"/pos/sales/{sale['id']}")).json()["fbr_invoice_number"] == "FBR-77"


async def test_an_unknown_row_that_fbr_never_received_is_resent_exactly_once(
        client, shop, fake_fbr, monkeypatch):
    fake_fbr.outcomes = ["timeout"]
    await _sell(client, shop)

    async def lookup(cfg, document):
        return fbr.LookupResult(status="not_found")
    monkeypatch.setattr(fbr, "lookup_invoice", lookup)
    fake_fbr.payloads.clear()
    await fbr_submit.process_outbox()
    await fbr_submit.process_outbox()

    assert [p["invoiceType"] for p in fake_fbr.payloads] == ["Sale Invoice"]
    assert [f["status"] for f in await _filings(shop)] == ["submitted"]


async def test_an_owner_can_settle_an_unknown_filing_by_hand(client, shop, fake_fbr):
    fake_fbr.outcomes = ["timeout", "timeout"]
    first = await _sell(client, shop)
    second = await _sell(client, shop)
    by_sale = {str(f["sale_id"]): f for f in await _filings(shop)}

    # Found in IRIS: record FBR's number; nothing is resent.
    r = await client.post(f"/fbr/invoices/{by_sale[first['id']]['id']}/resolve",
                          json={"filed": True, "fbr_invoice_number": "FBR-IRIS-1"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "submitted"
    # Not in IRIS: allow one resend.
    r = await client.post(f"/fbr/invoices/{by_sale[second['id']]['id']}/resolve", json={"filed": False})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending"

    fake_fbr.payloads.clear()
    await fbr_submit.process_outbox()
    assert len(fake_fbr.payloads) == 1
    statuses = {str(f["sale_id"]): (f["status"], f["fbr_invoice_number"]) for f in await _filings(shop)}
    assert statuses[first["id"]] == ("submitted", "FBR-IRIS-1")
    assert statuses[second["id"]][0] == "submitted"

    # Only an unknown filing can be settled by hand.
    r = await client.post(f"/fbr/invoices/{by_sale[first['id']]['id']}/resolve", json={"filed": False})
    assert r.status_code == 409


async def test_a_send_abandoned_mid_flight_becomes_unknown_not_resent(client, shop, fake_fbr, monkeypatch):
    """The worker died holding the row: FBR may or may not have it."""
    async def crashed(outbox_id):
        return fbr_submit.BUSY
    monkeypatch.setattr(fbr_submit, "deliver_now", crashed)
    sale = await _sell(client, shop)
    await _q("""update outbox set status='sending', attempts=1, locked_until = now() - interval '1 second'
                 where dedup_key=$1""", sale["id"])
    await fbr_submit.process_outbox()
    assert fake_fbr.payloads == []
    assert [r["status"] for r in await _outbox(shop)] == ["unknown"]


# ── Debit notes and double processing ───────────────────────────────────────
async def test_a_pending_debit_note_is_retried_as_a_debit_note_after_its_sale(client, shop, fake_fbr):
    fake_fbr.outcomes = ["fail"]                 # FBR down for the sale
    sale = await _sell(client, shop)
    ret = await _return_one(client, sale)
    assert ret["fbr_status"] == "pending"        # waits for the sale's number
    assert len(fake_fbr.payloads) == 1

    fake_fbr.payloads.clear()
    await _due_now(shop)
    await fbr_submit.process_outbox()
    assert [p["invoiceType"] for p in fake_fbr.payloads] == ["Sale Invoice", "Debit Note"]
    assert fake_fbr.payloads[1]["invoiceRefNo"] == "FBR-1"
    assert {r["status"] for r in await _outbox(shop)} == {"done"}


async def test_the_fast_path_and_the_worker_cannot_both_file_a_sale(client, shop, fake_fbr):
    fake_fbr.outcomes = ["fail"]
    sale = await _sell(client, shop)
    await _due_now(shop)
    [row] = await _outbox(shop)
    fake_fbr.payloads.clear()
    fake_fbr.hold = asyncio.Event()
    racers = [asyncio.create_task(fbr_submit.deliver_now(row["id"])),
              asyncio.create_task(fbr_submit.process_outbox()),
              asyncio.create_task(fbr_submit.process_outbox())]
    await asyncio.sleep(0.5)
    fake_fbr.hold.set()
    await asyncio.gather(*racers)
    assert len(fake_fbr.payloads) == 1
    assert [f["status"] for f in await _filings(shop)] == ["submitted"]
    assert sale["id"] == str((await _filings(shop))[0]["sale_id"])


# ── Backfill of rows queued before the outbox (7.3) ─────────────────────────
async def _run_backfill() -> None:
    """The backfill section of migration 0035, run again as the migration would."""
    text = MIGRATION.read_text(encoding="utf-8")
    sql = re.search(r"-- backfill:begin(.*)-- backfill:end", text, re.S).group(1)
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute(sql)   # several statements: simple-query protocol
    finally:
        await conn.close()


async def test_backfill_queues_old_pending_filings_with_the_right_kind(client, shop, fake_fbr):
    """Rows left pending by the old retry job become outbox rows: one per sale
    and per debit note, the note depending on its sale, and an in-flight row
    becomes unknown (the old process may have transmitted it)."""
    fake_fbr.outcomes = ["fail", "fail"]       # the return waits on its sale: no attempt
    sale = await _sell(client, shop)
    await _return_one(client, sale)
    in_flight = await _sell(client, shop)
    tid = uuid.UUID(shop["tenant_id"])
    # Back to the state before 0035: filings, no outbox rows.
    await _q("update pos_fbr_invoices set outbox_id = null where tenant_id=$1", tid)
    await _q("delete from outbox where tenant_id=$1", tid)
    await _q("update pos_fbr_invoices set status='pending' where tenant_id=$1", tid)
    await _q("update pos_fbr_invoices set status='sending' where sale_id=$1", uuid.UUID(in_flight["id"]))

    await _run_backfill()

    rows = await _outbox(shop)
    assert sorted((r["kind"], r["status"]) for r in rows) == [
        ("fbr.submit_debit_note", "pending"), ("fbr.submit_sale", "pending"), ("fbr.submit_sale", "unknown")]
    sale_row = next(r for r in rows if r["dedup_key"] == sale["id"])
    note_row = next(r for r in rows if r["kind"] == "fbr.submit_debit_note")
    assert note_row["depends_on"] == sale_row["id"]
    assert all(f["outbox_id"] is not None for f in await _filings(shop))
    await _run_backfill()                    # idempotent
    assert len(await _outbox(shop)) == 3

    fake_fbr.payloads.clear()
    await fbr_submit.process_outbox()
    assert [p["invoiceType"] for p in fake_fbr.payloads] == ["Sale Invoice", "Debit Note"]
    assert fake_fbr.payloads[0]["items"][0]["hsCode"] == "0101.2100"   # rebuilt from the snapshots
    assert fake_fbr.payloads[1]["invoiceRefNo"] == "FBR-1"
    sale_row = (await _q("select * from outbox where id=$1", sale_row["id"]))[0]
    assert sale_row["payload"]["rebuilt"] is True                     # the document is now frozen


# ── Privileges and isolation ────────────────────────────────────────────────
async def test_the_app_role_can_only_read_and_insert_outbox_rows():
    grants = await _q("""select privilege_type from information_schema.role_table_grants
                          where grantee='app_user' and table_name='outbox'""")
    assert sorted(g["privilege_type"] for g in grants) == ["INSERT", "SELECT"]


async def test_outbox_rows_are_invisible_to_other_tenants(client, shop):
    await _sell(client, shop)
    app = await asyncpg.connect(settings.app_database_url)
    try:
        await app.execute("select set_config('app.tenant_id', $1, false)", str(uuid.uuid4()))
        assert await app.fetchval("select count(*) from outbox") == 0
        await app.execute("select set_config('app.tenant_id', $1, false)", shop["tenant_id"])
        assert await app.fetchval("select count(*) from outbox") == 1
    finally:
        await app.close()
