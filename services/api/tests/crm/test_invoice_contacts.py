"""Invoices bill a contact (St02 P0): every new invoice names a contact,
directly or through a qualified lead, and lead_id is optional.

Requests raised before migration 0061 whose lead never got a contact became
invoices (0074) with contact_id null; they still list, approve and print
under the lead's name, and qualifying the lead links them.
"""
from __future__ import annotations

import uuid

import asyncpg
import pytest

from app import db
from app.config import settings

LINE = [{"description": "Services", "qty": 1, "unit_price_minor": 1000}]


async def _contact(client, **body) -> dict:
    body.setdefault("name", "Bill To " + uuid.uuid4().hex[:6])
    body.setdefault("force", True)
    r = await client.post("/contacts", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def _lead(client, **body) -> dict:
    body.setdefault("name", "Lead " + uuid.uuid4().hex[:6])
    body.setdefault("force", True)
    r = await client.post("/crm/leads", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def _invoice(client, **body):
    return await client.post("/invoices", json={"lines": LINE, **body})


async def test_an_invoice_can_bill_a_contact_without_a_lead(client, crm_tenant):
    c = await _contact(client, name="Direct Customer")
    r = await _invoice(client, contact_id=c["id"])
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["contact_id"] == c["id"] and inv["contact_name"] == "Direct Customer"
    assert inv["lead_id"] is None


async def test_a_lead_invoice_bills_the_leads_contact(client, crm_tenant):
    lead = await _lead(client, name="Qualified Lead", phone="03128880001")
    contact = (await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "create"})).json()["contact"]
    r = await _invoice(client, lead_id=lead["id"])
    assert r.status_code == 201, r.text
    assert r.json()["contact_id"] == contact["id"] and r.json()["lead_id"] == lead["id"]


async def test_an_unqualified_lead_must_be_qualified_before_invoicing(client, crm_tenant):
    lead = await _lead(client, name="Not Yet")
    r = await _invoice(client, lead_id=lead["id"])
    assert r.status_code == 422
    assert "qualified" in r.json()["detail"].lower()
    assert (await _invoice(client)).status_code == 422


async def test_foreign_or_archived_contacts_cannot_be_billed(client, crm_tenant):
    assert (await _invoice(client, contact_id=str(uuid.uuid4()))).status_code == 404
    c = await _contact(client, name="Archived Bill To")
    await client.delete(f"/contacts/{c['id']}")
    assert (await _invoice(client, contact_id=c["id"])).status_code == 409


async def test_the_database_refuses_a_new_invoice_without_a_contact(client, crm_tenant):
    with pytest.raises(asyncpg.CheckViolationError):
        async with db.tenant_conn(crm_tenant.tenant_id) as conn:
            await conn.execute("insert into invoices (tenant_id) values ($1)", crm_tenant.tenant_id)


async def test_v1_requests_are_read_only_history(client, crm_tenant):
    lead = (await client.get("/crm/leads")).json()[0]
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        async with db.tenant_conn(crm_tenant.tenant_id) as conn:
            await conn.execute(
                "insert into crm_invoice_requests (tenant_id, lead_id, amount_minor) values ($1, $2, 100)",
                crm_tenant.tenant_id, lead["id"])


async def _legacy_invoice(tenant_id: str, lead_id: str) -> str:
    """A v1 request as it stood before 0061 (a lead, no contact), carried
    over the way 0074 converts them. Bypassing triggers also skips the branch
    fill (0055), so the row names the default branch itself."""
    owner = await asyncpg.connect(settings.database_url)
    try:
        async with owner.transaction():
            await owner.execute("set local session_replication_role = replica")
            rid = str(await owner.fetchval(
                """insert into crm_invoice_requests (tenant_id, lead_id, amount_minor, branch_id)
                   values ($1, $2, 5000, (select id from branches where tenant_id = $1 and is_default))
                   returning id""", uuid.UUID(tenant_id), uuid.UUID(lead_id)))
        await owner.execute("select bos_invoices_from_v1()")
        return rid
    finally:
        await owner.close()


async def test_legacy_invoices_without_a_contact_still_list_and_approve(client, crm_tenant):
    lead = await _lead(client, name="Legacy Lead")
    inv_id = await _legacy_invoice(crm_tenant.tenant_id, lead["id"])
    listed = next(i for i in (await client.get("/invoices")).json() if i["id"] == inv_id)
    assert listed["contact_id"] is None and listed["lead_name"] == "Legacy Lead"
    assert listed["status"] == "pending_approval"
    r = await client.post(f"/invoices/{inv_id}/approve")
    assert r.status_code == 200, r.text
    assert r.json()["bill_to"]["name"] == "Legacy Lead"
    assert (await client.get(f"/invoices/{inv_id}/pdf")).status_code == 200


async def test_qualifying_the_lead_brings_its_legacy_invoices_along(client, crm_tenant):
    lead = await _lead(client, name="Brings Invoices", email="brings@inv.pk")
    inv_id = await _legacy_invoice(crm_tenant.tenant_id, lead["id"])
    report = (await client.post("/contacts/backfill")).json()
    assert report["invoices_linked"] == 1
    cid = (await client.get(f"/crm/leads/{lead['id']}/contact")).json()["id"]
    listed = next(i for i in (await client.get("/invoices")).json() if i["id"] == inv_id)
    assert listed["contact_id"] == cid


async def test_contact_360_lists_invoices(client, crm_tenant):
    c = await _contact(client, name="Invoiced")
    a = (await client.post("/invoices", json={"contact_id": c["id"], "submit": True, "lines": [
        {"description": "Work", "qty": 1, "unit_price_minor": 100000}]})).json()
    await client.post(f"/invoices/{a['id']}/approve")
    voided = (await _invoice(client, contact_id=c["id"])).json()
    await client.post(f"/invoices/{voided['id']}/void", json={"reason": "Mistake"})
    d = (await client.get(f"/contacts/{c['id']}")).json()
    assert sorted(i["id"] for i in d["invoices"]) == sorted([a["id"], voided["id"]])
    assert d["stats"]["invoiced_minor"] == 100000   # void invoices don't count


async def test_deleting_a_lead_keeps_its_invoices(client, crm_tenant):
    """An invoice is a money record: it outlives the lead it came from."""
    c = await _contact(client, name="Outlives")
    lead = await _lead(client, name="Short-lived")
    inv = (await _invoice(client, contact_id=c["id"], lead_id=lead["id"])).json()
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute("delete from crm_leads where id = $1", uuid.UUID(lead["id"]))
        row = await owner.fetchrow("select lead_id, contact_id from invoices where id = $1", uuid.UUID(inv["id"]))
    finally:
        await owner.close()
    assert row is not None and row["lead_id"] is None and str(row["contact_id"]) == c["id"]
