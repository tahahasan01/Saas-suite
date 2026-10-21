"""Invoices bill a contact (St02 P0): contact_id is required on every new
invoice request and lead_id becomes optional.

Requests raised before migration 0061 whose lead never got a contact keep
contact_id null and still list, approve and print under the lead's name.
"""
from __future__ import annotations

import uuid

import asyncpg
import pytest

from app import db
from app.config import settings


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


async def test_an_invoice_can_bill_a_contact_without_a_lead(client, crm_tenant):
    c = await _contact(client, name="Direct Customer")
    r = await client.post("/crm/invoices", json={"contact_id": c["id"], "amount_minor": 150000})
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["contact_id"] == c["id"] and inv["contact_name"] == "Direct Customer"
    assert inv["lead_id"] is None and inv["bill_to"] == "Direct Customer"


async def test_a_lead_invoice_bills_the_leads_contact(client, crm_tenant):
    lead = await _lead(client, name="Qualified Lead", phone="03128880001")
    contact = (await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "create"})).json()["contact"]
    r = await client.post("/crm/invoices", json={"lead_id": lead["id"], "amount_minor": 1000})
    assert r.status_code == 201, r.text
    assert r.json()["contact_id"] == contact["id"] and r.json()["lead_id"] == lead["id"]


async def test_an_unqualified_lead_must_be_qualified_before_invoicing(client, crm_tenant):
    lead = await _lead(client, name="Not Yet")
    r = await client.post("/crm/invoices", json={"lead_id": lead["id"], "amount_minor": 1000})
    assert r.status_code == 422
    assert "qualify" in r.json()["detail"].lower()
    assert (await client.post("/crm/invoices", json={"amount_minor": 1000})).status_code == 422


async def test_foreign_or_archived_contacts_cannot_be_billed(client, crm_tenant):
    r = await client.post("/crm/invoices", json={"contact_id": str(uuid.uuid4()), "amount_minor": 1000})
    assert r.status_code == 404
    c = await _contact(client, name="Archived Bill To")
    await client.delete(f"/contacts/{c['id']}")
    r = await client.post("/crm/invoices", json={"contact_id": c["id"], "amount_minor": 1000})
    assert r.status_code == 409


async def test_the_database_refuses_a_new_invoice_without_a_contact(client, crm_tenant):
    lead = (await client.get("/crm/leads")).json()[0]
    with pytest.raises(asyncpg.NotNullViolationError):
        async with db.tenant_conn(crm_tenant.tenant_id) as conn:
            await conn.execute(
                "insert into crm_invoice_requests (tenant_id, lead_id, amount_minor) values ($1, $2, 100)",
                crm_tenant.tenant_id, lead["id"])


async def _legacy_invoice(tenant_id: str, lead_id: str) -> str:
    """A request as it stood before 0061: a lead, no contact (the trigger is
    bypassed the way the migration found such rows). Bypassing triggers also
    skips the branch fill (0055), so the row names the default branch itself."""
    owner = await asyncpg.connect(settings.database_url)
    try:
        async with owner.transaction():
            await owner.execute("set local session_replication_role = replica")
            return str(await owner.fetchval(
                """insert into crm_invoice_requests (tenant_id, lead_id, amount_minor, branch_id)
                   values ($1, $2, 5000, (select id from branches where tenant_id = $1 and is_default))
                   returning id""", uuid.UUID(tenant_id), uuid.UUID(lead_id)))
    finally:
        await owner.close()


async def test_legacy_invoices_without_a_contact_still_list_and_approve(client, crm_tenant):
    lead = await _lead(client, name="Legacy Lead")
    inv_id = await _legacy_invoice(crm_tenant.tenant_id, lead["id"])
    listed = next(i for i in (await client.get("/crm/invoices")).json() if i["id"] == inv_id)
    assert listed["contact_id"] is None and listed["bill_to"] == "Legacy Lead"
    r = await client.post(f"/crm/invoices/{inv_id}/approve")
    assert r.status_code == 200, r.text
    assert (await client.get(f"/crm/invoices/{inv_id}/pdf")).status_code == 200


async def test_qualifying_the_lead_brings_its_legacy_invoices_along(client, crm_tenant):
    lead = await _lead(client, name="Brings Invoices", email="brings@inv.pk")
    inv_id = await _legacy_invoice(crm_tenant.tenant_id, lead["id"])
    report = (await client.post("/contacts/backfill")).json()
    assert report["invoices_linked"] == 1
    cid = (await client.get(f"/crm/leads/{lead['id']}/contact")).json()["id"]
    listed = next(i for i in (await client.get("/crm/invoices")).json() if i["id"] == inv_id)
    assert listed["contact_id"] == cid


async def test_contact_360_lists_invoices(client, crm_tenant):
    c = await _contact(client, name="Invoiced")
    a = (await client.post("/crm/invoices", json={"contact_id": c["id"], "amount_minor": 100000})).json()
    rejected = (await client.post("/crm/invoices", json={"contact_id": c["id"], "amount_minor": 5000})).json()
    await client.post(f"/crm/invoices/{rejected['id']}/reject")
    d = (await client.get(f"/contacts/{c['id']}")).json()
    assert sorted(i["id"] for i in d["invoices"]) == sorted([a["id"], rejected["id"]])
    assert d["stats"]["invoiced_minor"] == 100000   # rejected requests don't count


async def test_deleting_a_lead_keeps_its_invoices(client, crm_tenant):
    """An invoice is a money record: it outlives the lead it came from."""
    c = await _contact(client, name="Outlives")
    lead = await _lead(client, name="Short-lived")
    inv = (await client.post("/crm/invoices", json={"contact_id": c["id"], "lead_id": lead["id"],
                                                    "amount_minor": 1000})).json()
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute("delete from crm_leads where id = $1", uuid.UUID(lead["id"]))
        row = await owner.fetchrow("select lead_id, contact_id from crm_invoice_requests where id = $1",
                                   uuid.UUID(inv["id"]))
    finally:
        await owner.close()
    assert row is not None and row["lead_id"] is None and str(row["contact_id"]) == c["id"]
