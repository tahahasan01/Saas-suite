"""Quotes the customer accepts online (wave D, C15, migration 0121).

A quote is a frozen, numbered copy of the deal's lines; making it sends it
(it gets its link at once). A newer quote supersedes the open one. The
customer accepts with their name on the public page, which wins the deal
and lets staff turn the quote into an invoice (invoices v2) from its frozen
lines. The public link's own security is in test_quote_link_security.py."""
from __future__ import annotations

import uuid
from datetime import date, timedelta

import asyncpg
import pytest
import pytest_asyncio

from app.config import settings

from ..conftest import _drop, _signup
from .helpers import login_as_rep, q


@pytest_asyncio.fixture
async def shop(client):
    tenant_id = await _signup(client, ["crm", "pos"])
    yield tenant_id
    await _drop(tenant_id)


LINES = [
    {"description": "Installation", "qty": 2, "unit_price_minor": 50_000_00, "tax_code": "gst_standard"},
    {"description": "Delivery", "qty": 1, "unit_price_minor": 10_000_00, "line_discount_minor": 1_000_00},
]


async def deal(client, name: str = "Bilal Traders", lines: list[dict] | None = None) -> dict:
    r = await client.post("/crm/leads", json={"name": name, "company": f"{name} Pvt", "force": True})
    assert r.status_code == 201, r.text
    lead = r.json()
    r = await client.put(f"/crm/leads/{lead['id']}/lines", json={"lines": LINES if lines is None else lines})
    assert r.status_code == 200, r.text
    return lead


async def quote(client, lead_id: str, **body) -> dict:
    r = await client.post(f"/crm/leads/{lead_id}/quotes", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def token_of(qt: dict) -> str:
    assert qt["link"].startswith("/q/")
    return qt["link"].removeprefix("/q/")


async def accept(client, qt: dict, name: str = "Bilal Ahmed"):
    page = (await client.get(f"/public/quotes/{token_of(qt)}")).json()
    return await client.post(f"/public/quotes/{token_of(qt)}/accept",
                             json={"name": name, "content_hash": page["content_hash"]})


async def test_a_quote_freezes_the_deal_lines_and_gets_a_link(client, shop):
    lead = await deal(client)
    qt = await quote(client, lead["id"], terms="50% advance, rest on delivery")
    assert qt["status"] == "sent" and qt["number"].startswith("QT-")
    assert qt["customer_name"] == "Bilal Traders Pvt"
    assert qt["net_minor"] == 109_000_00 and qt["tax_minor"] == 18_000_00 and qt["total_minor"] == 127_000_00
    assert [ln["description"] for ln in qt["lines"]] == ["Installation", "Delivery"]
    assert len(token_of(qt)) >= 40
    # Valid for 15 days by default (the tenant's business date).
    assert date.fromisoformat(qt["valid_until"]) >= date.today() + timedelta(days=14)

    # Changing the deal afterwards doesn't touch what was sent.
    await client.put(f"/crm/leads/{lead['id']}/lines",
                     json={"lines": [{"description": "Other", "qty": 1, "unit_price_minor": 1}]})
    again = (await client.get(f"/crm/quotes/{qt['id']}")).json()
    assert again["total_minor"] == 127_000_00 and again["link"] == qt["link"]   # the rep can copy it again
    assert [ln["description"] for ln in again["lines"]] == ["Installation", "Delivery"]


async def test_a_quote_needs_products_on_an_open_deal(client, shop):
    lead = await deal(client, lines=[])
    r = await client.post(f"/crm/leads/{lead['id']}/quotes", json={})
    assert r.status_code == 422, r.text
    lead = await deal(client, "Second")
    await client.post(f"/crm/leads/{lead['id']}/won")
    assert (await client.post(f"/crm/leads/{lead['id']}/quotes", json={})).status_code == 409


async def test_validity_must_not_be_in_the_past(client, shop):
    lead = await deal(client)
    r = await client.post(f"/crm/leads/{lead['id']}/quotes", json={"valid_until": "2020-01-01"})
    assert r.status_code == 422, r.text


async def test_a_new_quote_supersedes_the_open_one(client, shop):
    lead = await deal(client)
    first = await quote(client, lead["id"])
    second = await quote(client, lead["id"])
    listed = (await client.get(f"/crm/leads/{lead['id']}/quotes")).json()
    assert [x["id"] for x in listed] == [second["id"], first["id"]]
    assert listed[1]["status"] == "superseded" and listed[1]["link"] is None
    assert (await client.get(f"/public/quotes/{token_of(first)}")).status_code == 404
    assert (await client.get(f"/public/quotes/{token_of(second)}")).status_code == 200
    assert first["number"] != second["number"]


async def test_cancel_kills_the_link(client, shop):
    lead = await deal(client)
    qt = await quote(client, lead["id"])
    r = await client.post(f"/crm/quotes/{qt['id']}/cancel")
    assert r.status_code == 200 and r.json()["status"] == "cancelled" and r.json()["link"] is None
    assert (await client.get(f"/public/quotes/{token_of(qt)}")).status_code == 404
    assert (await client.post(f"/crm/quotes/{qt['id']}/cancel")).status_code == 409


async def test_accepting_wins_the_deal_and_tells_the_owner(client, shop):
    lead = await deal(client)
    qt = await quote(client, lead["id"])
    r = await accept(client, qt)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "accepted" and r.json()["accepted_name"] == "Bilal Ahmed"

    lead_now = (await client.get(f"/crm/leads/{lead['id']}")).json()
    assert lead_now["lead"]["status"] == "won"
    assert any("accepted" in (e.get("body") or "") for e in lead_now["timeline"])
    notes = (await client.get("/notifications")).json()
    items = notes["items"] if isinstance(notes, dict) else notes
    assert any(qt["number"] in n["title"] + n["body"] for n in items)

    staff = (await client.get(f"/crm/quotes/{qt['id']}")).json()
    assert staff["status"] == "accepted" and staff["accepted_name"] == "Bilal Ahmed"
    assert staff["accepted_ip"]


async def test_the_acceptance_is_audited_as_the_public(client, shop):
    lead = await deal(client)
    qt = await quote(client, lead["id"])
    await accept(client, qt)
    rows = await q("select actor_kind from audit_log where tenant_id = $1 and entity = 'crm_quotes' "
                   "and entity_id = $2 and action like '%accept%'", uuid.UUID(shop), qt["id"])
    assert rows and {r["actor_kind"] for r in rows} == {"public"}


async def test_declining_plans_a_follow_up_and_leaves_the_deal_open(client, shop):
    lead = await deal(client)
    qt = await quote(client, lead["id"])
    r = await client.post(f"/public/quotes/{token_of(qt)}/decline", json={"reason": "Too expensive"})
    assert r.status_code == 200 and r.json()["status"] == "declined"
    detail = (await client.get(f"/crm/leads/{lead['id']}")).json()
    assert detail["lead"]["status"] == "open"
    assert any("declined" in a["summary"].lower() for a in detail["activities"])
    assert (await client.get(f"/crm/quotes/{qt['id']}")).json()["decline_reason"] == "Too expensive"


async def test_an_accepted_quote_becomes_an_invoice_once(client, shop):
    lead = await deal(client)
    c = await client.post("/contacts", json={"kind": "company", "name": "Bilal Traders Pvt", "force": True})
    await q("update crm_leads set contact_id = $1 where id = $2", uuid.UUID(c.json()["id"]), uuid.UUID(lead["id"]))
    qt = await quote(client, lead["id"])
    assert (await client.post(f"/crm/quotes/{qt['id']}/invoice")).status_code == 409   # not accepted yet
    await accept(client, qt)
    r = await client.post(f"/crm/quotes/{qt['id']}/invoice")
    assert r.status_code == 201, r.text
    inv = (await client.get(f"/invoices/{r.json()['invoice_id']}")).json()
    assert inv["status"] == "draft" and inv["lead_id"] == lead["id"]
    assert inv["total_minor"] == qt["total_minor"]
    assert [ln["description"] for ln in inv["lines"]] == ["Installation", "Delivery"]
    assert (await client.get(f"/crm/quotes/{qt['id']}")).json()["invoice_id"] == inv["id"]
    assert (await client.post(f"/crm/quotes/{qt['id']}/invoice")).status_code == 409


async def test_the_database_refuses_to_change_a_sent_quote():
    """The trigger backs up the API for code that forgets."""
    conn = await asyncpg.connect(settings.database_url)
    try:
        tx = conn.transaction()
        await tx.start()
        try:
            await conn.execute("set local session_replication_role = replica")   # plant without parents
            tid = await conn.fetchval(
                "insert into tenants (name, industry_type) values ('freeze', 'retail') returning id")
            qid = await conn.fetchval(
                """insert into crm_quotes (tenant_id, lead_id, number, valid_until, subtotal_minor,
                                           line_discount_minor, net_minor, tax_minor, total_minor, content_hash,
                                           token_hash, token_enc)
                   values ($1, gen_random_uuid(), 'QT-T', current_date, 1, 0, 1, 0, 1, repeat('a', 64),
                           repeat('b', 64), '\\x00') returning id""", tid)
            await conn.execute("set local session_replication_role = origin")
            with pytest.raises(asyncpg.RaiseError, match="frozen"):
                await conn.execute("update crm_quotes set total_minor = 2 where id = $1", qid)
        finally:
            await tx.rollback()
    finally:
        await conn.close()


async def test_quotes_follow_crm_rights(client, shop):
    lead = await deal(client)
    qt = await quote(client, lead["id"])
    await login_as_rep(client, shop, ["read"])
    assert (await client.get(f"/crm/leads/{lead['id']}/quotes")).status_code == 200
    assert (await client.get(f"/crm/quotes/{qt['id']}")).status_code == 200
    assert (await client.post(f"/crm/leads/{lead['id']}/quotes", json={})).status_code == 403
    assert (await client.post(f"/crm/quotes/{qt['id']}/cancel")).status_code == 403
