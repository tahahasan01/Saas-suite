"""Invoices v2 (3E, migration 0074): lines with tax snapshots, a gap-free
number at issue, payments, credit notes, void, overdue reminders and a
Unicode PDF. Amounts come from the one pricing function."""
from __future__ import annotations

import json
import uuid
from datetime import date, timedelta

import asyncpg
import pytest

from app import jobs
from app.config import settings

from ..core.test_rbac_v2 import _role, _user_on


async def _owner(sql: str, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _contact(client, name: str = "Bilal Traders", **extra) -> str:
    r = await client.post("/contacts", json={"kind": "company", "name": name, "force": True, **extra})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _draft(client, contact_id: str, **extra) -> dict:
    body = {"contact_id": contact_id, "lines": [
        {"description": "Consulting", "qty": 2, "unit_price_minor": 50_000_00, "tax_code": "gst_standard"},
        {"description": "Travel", "qty": 1, "unit_price_minor": 10_000_00, "line_discount_minor": 1_000_00},
    ], **extra}
    r = await client.post("/invoices", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def _issued(client, contact_id: str, **extra) -> dict:
    inv = await _draft(client, contact_id, **extra)
    assert (await client.post(f"/invoices/{inv['id']}/submit")).status_code == 200
    r = await client.post(f"/invoices/{inv['id']}/approve")
    assert r.status_code == 200, r.text
    return r.json()


async def test_a_draft_is_priced_by_the_one_pricing_function(client, crm_tenant):
    inv = await _draft(client, await _contact(client))
    assert inv["status"] == "draft" and inv["number"] is None
    consulting, travel = inv["lines"]
    assert consulting["net_excl_minor"] == 100_000_00 and consulting["tax_rate_pct"] == 18
    assert consulting["tax_minor"] == 18_000_00 and consulting["total_minor"] == 118_000_00
    assert travel["tax_minor"] == 0 and travel["total_minor"] == 9_000_00
    assert inv["subtotal_minor"] == 110_000_00 and inv["line_discount_minor"] == 1_000_00
    assert inv["tax_minor"] == 18_000_00 and inv["total_minor"] == 127_000_00
    assert inv["unverified_rates"] is True        # every seeded rate awaits the Gazette check


async def test_an_order_discount_is_shared_across_lines(client, crm_tenant):
    inv = await _draft(client, await _contact(client), discount_minor=10_900_00)
    assert inv["discount_minor"] == 10_900_00
    assert sum(line["share_minor"] for line in inv["lines"]) == 10_900_00
    assert inv["total_minor"] == sum(line["total_minor"] for line in inv["lines"])


async def test_issuing_takes_the_next_gap_free_number_and_freezes_the_bill_to(client, crm_tenant):
    cid = await _contact(client, ntn="1234567-8")
    first = await _issued(client, cid)
    second = await _issued(client, cid)
    assert first["status"] == "issued" and first["issue_date"]
    assert first["number"].startswith("INV-") and first["number"].endswith("00001")
    assert second["number"].endswith("00002")
    assert first["bill_to"]["name"] == "Bilal Traders" and first["bill_to"]["ntn"] == "1234567-8"
    # A later rename of the contact doesn't touch the issued invoice.
    await client.patch(f"/contacts/{cid}", json={"name": "Renamed"})
    assert (await client.get(f"/invoices/{first['id']}")).json()["bill_to"]["name"] == "Bilal Traders"


async def test_a_draft_takes_no_number_and_rejection_returns_it_to_draft(client, crm_tenant):
    inv = await _draft(client, await _contact(client))
    await client.post(f"/invoices/{inv['id']}/submit")
    r = await client.post(f"/invoices/{inv['id']}/reject", json={"reason": "Wrong rate"})
    assert r.status_code == 200 and r.json()["status"] == "draft" and r.json()["number"] is None
    issued = await _issued(client, await _contact(client, "Other Co"))
    assert issued["number"].endswith("00001")   # the rejected draft used none


async def test_an_issued_invoice_cannot_be_edited(client, crm_tenant):
    inv = await _issued(client, await _contact(client))
    r = await client.patch(f"/invoices/{inv['id']}", json={"notes": "x", "lines": [
        {"description": "Cheaper", "qty": 1, "unit_price_minor": 1}]})
    assert r.status_code == 409
    with pytest.raises(asyncpg.RaiseError):
        await _owner("update invoices set total_minor = 1 where id = $1", uuid.UUID(inv["id"]))


async def test_payments_move_the_status_and_cannot_overpay(client, crm_tenant):
    inv = await _issued(client, await _contact(client))
    r = await client.post(f"/invoices/{inv['id']}/payments", json={
        "method": "bank", "amount_minor": 27_000_00, "paid_on": date.today().isoformat(), "reference": "IBFT 1"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "partially_paid" and r.json()["balance_minor"] == 100_000_00
    r = await client.post(f"/invoices/{inv['id']}/payments", json={
        "method": "cash", "amount_minor": 100_000_01, "paid_on": date.today().isoformat()})
    assert r.status_code == 422
    r = await client.post(f"/invoices/{inv['id']}/payments", json={
        "method": "cash", "amount_minor": 100_000_00, "paid_on": date.today().isoformat()})
    assert r.json()["status"] == "paid" and r.json()["balance_minor"] == 0
    assert len(r.json()["payments"]) == 2


async def test_a_draft_cannot_take_a_payment(client, crm_tenant):
    inv = await _draft(client, await _contact(client))
    r = await client.post(f"/invoices/{inv['id']}/payments", json={
        "method": "cash", "amount_minor": 100, "paid_on": date.today().isoformat()})
    assert r.status_code == 409


async def test_a_full_credit_note_mirrors_the_lines_and_settles_the_invoice(client, crm_tenant):
    inv = await _issued(client, await _contact(client))
    r = await client.post(f"/invoices/{inv['id']}/credit-notes", json={"reason": "Returned"})
    assert r.status_code == 201, r.text
    cn = r.json()
    assert cn["kind"] == "credit_note" and cn["status"] == "issued" and cn["credit_of_id"] == inv["id"]
    assert cn["number"].startswith("CN-") and cn["total_minor"] == inv["total_minor"]
    assert cn["tax_minor"] == inv["tax_minor"]
    after = (await client.get(f"/invoices/{inv['id']}")).json()
    assert after["credited_minor"] == inv["total_minor"] and after["balance_minor"] == 0
    assert after["status"] == "paid"


async def test_a_partial_credit_cannot_exceed_what_is_left(client, crm_tenant):
    inv = await _issued(client, await _contact(client))
    r = await client.post(f"/invoices/{inv['id']}/credit-notes", json={"reason": "Goodwill", "amount_minor": 7_000_00})
    assert r.status_code == 201 and r.json()["total_minor"] == 7_000_00
    r = await client.post(f"/invoices/{inv['id']}/credit-notes",
                          json={"reason": "Too much", "amount_minor": inv["total_minor"]})
    assert r.status_code == 422


async def test_void_keeps_the_number_and_needs_no_money_against_it(client, crm_tenant):
    inv = await _issued(client, await _contact(client))
    r = await client.post(f"/invoices/{inv['id']}/void", json={"reason": "Raised twice"})
    assert r.status_code == 200 and r.json()["status"] == "void" and r.json()["number"] == inv["number"]
    paid = await _issued(client, await _contact(client, "Paid Co"))
    await client.post(f"/invoices/{paid['id']}/payments", json={
        "method": "cash", "amount_minor": 100, "paid_on": date.today().isoformat()})
    assert (await client.post(f"/invoices/{paid['id']}/void", json={"reason": "x"})).status_code == 409


async def test_approval_needs_the_approve_key(client, crm_tenant):
    clerk_role = await _role(client, [{"permission_key": k, "scope": "all"} for k in (
        "invoicing.invoice.read", "invoicing.invoice.create", "contacts.contact.read")])
    clerk, _, _ = await _user_on(client, [clerk_role])
    try:
        inv = await _draft(clerk, await _contact(client))
        assert (await clerk.post(f"/invoices/{inv['id']}/submit")).status_code == 200
        assert (await clerk.post(f"/invoices/{inv['id']}/approve")).status_code == 403
        assert (await client.post(f"/invoices/{inv['id']}/approve")).status_code == 200
    finally:
        await clerk.aclose()


async def test_an_old_invoice_request_becomes_an_invoice_without_a_new_number(client, crm_tenant):
    tid = uuid.UUID(crm_tenant.tenant_id)
    cid = uuid.UUID(await _contact(client))
    old = (await _owner(
        """insert into crm_invoice_requests (tenant_id, contact_id, amount_minor, discount_pct, status, branch_id)
           values ($1, $2, 10000, 10, 'approved', (select id from branches where tenant_id = $1 and is_default))
           returning id""", tid, cid))[0]["id"]
    await _owner("select bos_invoices_from_v1()")
    inv = (await client.get(f"/invoices/{old}")).json()
    assert inv["status"] == "issued" and inv["number"] is None
    assert inv["legacy_ref"] == str(old)[:8].upper()
    assert inv["total_minor"] == 9000 and inv["lines"][0]["line_discount_minor"] == 1000
    await _owner("select bos_invoices_from_v1()")      # idempotent
    assert len([i for i in (await client.get("/invoices")).json() if i["id"] == str(old)]) == 1


async def test_overdue_invoices_are_reminded_once_through_the_outbox(client, crm_tenant):
    cid = await _contact(client, email="accounts@bilal.pk")
    inv = await _issued(client, cid, due_date=(date.today() + timedelta(days=30)).isoformat())
    await _owner("update invoices set due_date = current_date - 3 where id = $1", uuid.UUID(inv["id"]))
    await jobs.run_invoice_reminders()
    await jobs.run_invoice_reminders()
    rows = await _owner("select payload from outbox where tenant_id = $1 and payload->>'template' = 'invoice_overdue'",
                        uuid.UUID(crm_tenant.tenant_id))
    assert len(rows) == 1 and json.loads(rows[0]["payload"])["to"] == "accounts@bilal.pk"


async def test_the_pdf_prints_urdu_names_the_rupee_sign_and_dashes(client, crm_tenant):
    cid = await _contact(client, "بلال ٹریڈرز — Bilal ₨")
    inv = await _issued(client, cid, notes="Thank you — شکریہ")
    r = await client.get(f"/invoices/{inv['id']}/pdf")
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    draft = await _draft(client, cid)
    assert (await client.get(f"/invoices/{draft['id']}/pdf")).status_code == 409


async def test_a_credit_note_cannot_be_voided(client, crm_tenant):
    """Voiding it would leave the invoice credited for a cancelled document."""
    inv = await _issued(client, await _contact(client))
    cn = (await client.post(f"/invoices/{inv['id']}/credit-notes", json={"reason": "x", "amount_minor": 100})).json()
    assert (await client.post(f"/invoices/{cn['id']}/void", json={"reason": "oops"})).status_code == 409
    assert (await client.get(f"/invoices/{inv['id']}")).json()["credited_minor"] == 100


async def test_a_lead_named_beside_a_contact_must_be_this_tenants(client, crm_tenant):
    other = (await _owner(
        """select l.id from crm_leads l where l.tenant_id <> $1 limit 1""", uuid.UUID(crm_tenant.tenant_id)))
    foreign_lead = str(other[0]["id"]) if other else str(uuid.uuid4())
    r = await client.post("/invoices", json={"contact_id": await _contact(client), "lead_id": foreign_lead,
                                             "lines": [{"description": "x", "qty": 1, "unit_price_minor": 1}]})
    assert r.status_code == 404
