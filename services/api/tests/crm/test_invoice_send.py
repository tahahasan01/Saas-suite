"""Send an invoice by email (TRD /invoices/{id}/send; research sweep 2026-10-23).

The request only queues an outbox row naming the invoice and the address;
the worker builds the PDF at delivery and attaches it, so SMTP being down
never fails the request and no PDF sits in the outbox."""
from __future__ import annotations

import json
import uuid

import pytest

from app import email

from .helpers import login_as_rep, q


@pytest.fixture
def attached(monkeypatch):
    out: list[tuple[str, str, str, list]] = []

    async def capture(to, subject, body, attachments):
        out.append((to, subject, body, attachments))

    monkeypatch.setattr(email, "_send_attached", capture)
    return out


async def issued(client, email_addr: str = "accounts@bilal.example") -> dict:
    c = (await client.post("/contacts", json={"kind": "company", "name": "Bilal Traders", "email": email_addr,
                                              "force": True})).json()
    inv = (await client.post("/invoices", json={"contact_id": c["id"], "submit": True, "lines": [
        {"description": "Consulting", "qty": 1, "unit_price_minor": 50_000_00}]})).json()
    r = await client.post(f"/invoices/{inv['id']}/approve")
    assert r.status_code == 200, r.text
    return r.json()


async def rows(tenant_id: str) -> list[dict]:
    got = await q("select * from outbox where tenant_id = $1 and kind = 'email.send' "
                  "and payload->>'template' = 'invoice' order by id", uuid.UUID(tenant_id))
    return [{**dict(r), "payload": json.loads(r["payload"])} for r in got]


async def test_sending_queues_the_invoice_to_the_customer_and_attaches_the_pdf(client, crm_tenant, attached):
    inv = await issued(client)
    r = await client.post(f"/invoices/{inv['id']}/send", json={})
    assert r.status_code == 202, r.text
    assert r.json()["to"] == "accounts@bilal.example"
    [row] = await rows(crm_tenant.tenant_id)
    # Only a pointer is queued: the PDF is built when the email goes.
    assert row["payload"] == {"template": "invoice", "to": "accounts@bilal.example", "invoice_id": inv["id"]}

    await q("update outbox set run_after = now() where id = $1", row["id"])
    assert await email.process_outbox() >= 1
    [(to, subject, body, files)] = attached
    assert to == "accounts@bilal.example" and inv["number"] in subject
    assert inv["number"] in body and "50,000" in body
    [(name, data, mime)] = files
    assert name == f"{inv['number']}.pdf" and mime == "application/pdf" and data.startswith(b"%PDF")
    detail = (await client.get(f"/invoices/{inv['id']}")).json()
    assert detail["last_sent_at"] is not None


async def test_another_address_can_be_given(client, crm_tenant):
    inv = await issued(client, email_addr="")
    assert (await client.post(f"/invoices/{inv['id']}/send", json={})).status_code == 422   # nowhere to send
    assert (await client.post(f"/invoices/{inv['id']}/send", json={"to": "not-an-email"})).status_code == 422
    r = await client.post(f"/invoices/{inv['id']}/send", json={"to": "Owner@Shop.example"})
    assert r.status_code == 202 and r.json()["to"] == "owner@shop.example"


async def test_only_an_issued_invoice_is_sent(client, crm_tenant):
    c = (await client.post("/contacts", json={"name": "Draft Co", "email": "d@example.com", "force": True})).json()
    draft = (await client.post("/invoices", json={"contact_id": c["id"], "lines": [
        {"description": "X", "qty": 1, "unit_price_minor": 100}]})).json()
    assert (await client.post(f"/invoices/{draft['id']}/send", json={})).status_code == 409


async def test_sending_needs_invoice_rights(client, crm_tenant):
    inv = await issued(client)
    await login_as_rep(client, crm_tenant.tenant_id, ["read"])
    assert (await client.post(f"/invoices/{inv['id']}/send", json={})).status_code == 403
