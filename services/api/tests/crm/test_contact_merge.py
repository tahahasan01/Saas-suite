"""Soft merge (D-33, St02 §6.6 and risk 8).

The losing contacts are archived and point at the winner; everything that
referenced them moves over in one transaction; at most five records; the
losers are snapshotted on the winner's timeline. A schema scan fails the
build when a column referencing contacts isn't registered with the merge
re-pointer, so a module added later can't be silently missed by merges.
"""
from __future__ import annotations

import json
import uuid

import asyncpg
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import contact_merge
from app.config import settings
from app.main import app

PASSWORD = "Sup3rSecret!23"


async def _contact(client, **body) -> dict:
    body.setdefault("name", "C " + uuid.uuid4().hex[:6])
    body.setdefault("force", True)
    r = await client.post("/contacts", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def _merge(client, winner: dict, *losers: dict, **extra):
    return await client.post("/contacts/merge", json={
        "winner_id": winner["id"], "loser_ids": [x["id"] for x in losers], **extra})


async def _owner():
    return await asyncpg.connect(settings.database_url)


# ── The registry guard (St02 risk 8) ────────────────────────────────────────
_REFERENCING = """
    select c.relname as tbl, a.attname as col
      from pg_attribute a join pg_class c on c.oid = a.attrelid
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relispartition
       and a.attnum > 0 and not a.attisdropped
       and (a.attname = 'contact_id'
            or exists (select 1 from pg_constraint k
                        where k.conrelid = c.oid and k.contype = 'f'
                          and k.confrelid = 'contacts'::regclass and a.attnum = any(k.conkey)))"""


async def test_every_column_referencing_contacts_is_registered_with_the_merge_repointer():
    conn = await _owner()
    try:
        found = {(r["tbl"], r["col"]) for r in await conn.fetch(_REFERENCING)}
    finally:
        await conn.close()
    unregistered = found - set(contact_merge.REGISTRY)
    assert not unregistered, (
        f"register these in app/contact_merge.py REGISTRY (repoint, or follow for append-only): {sorted(unregistered)}")
    stale = set(contact_merge.REGISTRY) - found
    assert not stale, f"REGISTRY names columns that don't exist: {sorted(stale)}"


def test_registry_strategies_are_known():
    assert set(contact_merge.REGISTRY.values()) <= {"repoint", "follow"}
    assert contact_merge.REGISTRY[("timeline_events", "contact_id")] == "follow"  # append-only


# ── Merging ─────────────────────────────────────────────────────────────────
async def test_merge_moves_everything_to_the_winner_and_archives_the_losers(client, crm_tenant):
    await client.patch("/entitlements/pos", json={"enabled": True})
    winner = await _contact(client, name="Ayesha Malik", phone="03001110001", roles=["customer"])
    loser = await _contact(client, name="Ayesha M.", phone="0300-1110001", email="ayesha@malik.pk",
                           city="Lahore", roles=["supplier"])
    vip = (await client.post("/tags", json={"name": "VIP merge"})).json()
    await client.patch(f"/contacts/{loser['id']}", json={"tag_ids": [vip["id"]]})
    await client.post(f"/contacts/{winner['id']}/addresses", json={"line1": "12 Mall Road", "city": "Lahore"})
    await client.post(f"/contacts/{loser['id']}/addresses", json={"line1": "12 mall road", "city": "LAHORE"})
    await client.post(f"/contacts/{loser['id']}/addresses", json={"line1": "7 Canal View", "city": "Lahore"})
    lead = (await client.post("/crm/leads", json={"name": "Deal", "force": True})).json()
    await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "link", "contact_id": loser["id"]})
    product = (await client.post("/pos/products", json={"name": "Widget", "price_minor": 1000})).json()
    sale = (await client.post("/pos/sales", json={"items": [{"product_id": product["id"], "qty": 1}],
                                                  "contact_id": loser["id"]})).json()
    inv = (await client.post("/crm/invoices", json={"contact_id": loser["id"], "amount_minor": 1000})).json()
    await client.post(f"/contacts/{loser['id']}/notes", json={"body": "Prefers WhatsApp"})

    r = await _merge(client, winner, loser)
    assert r.status_code == 200, r.text
    body = r.json()
    w = body["winner"]
    assert w["id"] == winner["id"] and w["name"] == "Ayesha Malik"       # winner's value kept
    assert w["email"] == "ayesha@malik.pk" and w["city"] == "Lahore"      # filled from the loser
    assert sorted(w["roles"]) == ["customer", "supplier"]
    assert [t["name"] for t in w["tags"]] == ["VIP merge"]
    assert body["moved"]["crm_leads.contact_id"] == 1
    assert body["moved"]["pos_sales.contact_id"] == 1
    assert body["moved"]["crm_invoice_requests.contact_id"] == 1

    d = (await client.get(f"/contacts/{winner['id']}")).json()
    assert [x["id"] for x in d["deals"]] == [lead["id"]]
    assert [x["id"] for x in d["sales"]] == [sale["id"]]
    assert [x["id"] for x in d["invoices"]] == [inv["id"]]
    assert sorted(a["line1"] for a in d["addresses"]) == ["12 Mall Road", "7 Canal View"]  # duplicate dropped
    assert (await client.get(f"/crm/leads/{lead['id']}/contact")).json()["id"] == winner["id"]

    gone = (await client.get(f"/contacts/{loser['id']}")).json()["contact"]
    assert gone["merged_into_id"] == winner["id"] and gone["archived_at"] is not None
    assert (await client.patch(f"/contacts/{loser['id']}", json={"name": "x"})).status_code == 409
    lookup = (await client.get("/contacts/lookup", params={"phone": "03001110001"})).json()
    assert [m["id"] for m in lookup["matches"]] == [winner["id"]]

    timeline = (await client.get(f"/contacts/{winner['id']}/timeline")).json()
    assert any(e["kind"] == "note" and e["body"] == "Prefers WhatsApp" for e in timeline)  # loser's history
    assert any(e["kind"] == "merge" for e in timeline)


async def test_the_losers_are_snapshotted_on_the_merge_event(client, crm_tenant):
    winner = await _contact(client, name="Keep")
    loser = await _contact(client, name="Lose", phone="03001110002", notes="old notes")
    assert (await _merge(client, winner, loser)).status_code == 200
    conn = await _owner()
    try:
        payload = await conn.fetchval(
            """select payload from timeline_events where entity_type = 'contact' and entity_id = $1
                 and kind = 'merge'""", uuid.UUID(winner["id"]))
    finally:
        await conn.close()
    payload = json.loads(payload) if isinstance(payload, str) else payload
    snap = payload["losers"][0]
    assert snap["id"] == loser["id"] and snap["name"] == "Lose" and snap["notes"] == "old notes"


async def test_field_choices_pick_the_value_and_ntn_conflicts_need_one(client, crm_tenant):
    a = await _contact(client, kind="company", name="Khan Traders", ntn="1111111-1")
    b = await _contact(client, kind="company", name="Khan Traders Pvt", ntn="2222222-2")
    r = await _merge(client, a, b)
    assert r.status_code == 409 and "NTN" in r.text
    r = await _merge(client, a, b, field_choices={"ntn": b["id"], "name": b["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["winner"]["ntn"] == "2222222-2" and r.json()["winner"]["name"] == "Khan Traders Pvt"


async def test_merging_companies_moves_their_people(client, crm_tenant):
    a = await _contact(client, kind="company", name="Noor Ent")
    b = await _contact(client, kind="company", name="Noor Enterprises")
    person = await _contact(client, name="Fatima", company_id=b["id"])
    assert (await _merge(client, a, b)).status_code == 200
    moved = (await client.get(f"/contacts/{person['id']}")).json()["contact"]
    assert moved["company_id"] == a["id"]


async def test_a_second_merge_flattens_the_chain(client, crm_tenant):
    a, b, c = [await _contact(client, name=n) for n in ("A", "B", "C")]
    await client.post(f"/contacts/{a['id']}/notes", json={"body": "note on A"})
    assert (await _merge(client, b, a)).status_code == 200
    assert (await _merge(client, c, b)).status_code == 200
    first = (await client.get(f"/contacts/{a['id']}")).json()["contact"]
    assert first["merged_into_id"] == c["id"]
    timeline = (await client.get(f"/contacts/{c['id']}/timeline")).json()
    assert any(e["body"] == "note on A" for e in timeline)


async def test_merge_rules(client, crm_tenant):
    w = await _contact(client, name="W")
    many = [await _contact(client, name=f"L{i}") for i in range(5)]
    assert (await _merge(client, w, *many)).status_code == 422               # six records: over five
    assert (await _merge(client, w)).status_code == 422                      # nothing to merge
    assert (await _merge(client, w, w)).status_code == 422                   # winner among losers
    company = await _contact(client, kind="company", name="Co")
    assert (await _merge(client, w, company)).status_code == 422             # person with company
    r = await client.post("/contacts/merge", json={"winner_id": w["id"], "loser_ids": [str(uuid.uuid4())]})
    assert r.status_code == 404
    assert (await _merge(client, w, many[0])).status_code == 200
    assert (await _merge(client, w, many[0])).status_code == 409             # already merged
    archived = await _contact(client, name="Archived winner")
    await client.delete(f"/contacts/{archived['id']}")
    assert (await _merge(client, archived, many[1])).status_code == 409
    assert (await _merge(client, w, many[1], field_choices={"name": str(uuid.uuid4())})).status_code == 422
    assert (await _merge(client, w, many[1], field_choices={"password": many[1]["id"]})).status_code == 422


async def test_another_tenants_contact_cannot_be_merged_in(client, crm_tenant):
    conn = await _owner()
    try:
        other = await conn.fetchval("insert into tenants (name, industry_type) values ('Other', 'retail') returning id")
        foreign = await conn.fetchval(
            "insert into contacts (tenant_id, name) values ($1, 'Theirs') returning id", other)
        w = await _contact(client, name="Mine")
        r = await client.post("/contacts/merge", json={"winner_id": w["id"], "loser_ids": [str(foreign)]})
        assert r.status_code == 404
        assert await conn.fetchval("select merged_into_id from contacts where id = $1", foreign) is None
    finally:
        await conn.execute("delete from tenants where id = $1", other)
        await conn.close()


async def test_preview_lists_differences_and_what_would_move(client, crm_tenant):
    a = await _contact(client, name="Same", email="a@x.pk")
    b = await _contact(client, name="Same", email="b@x.pk")
    lead = (await client.post("/crm/leads", json={"name": "Deal", "force": True})).json()
    await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "link", "contact_id": b["id"]})
    r = await client.post("/contacts/merge/preview", json={"ids": [a["id"], b["id"]]})
    assert r.status_code == 200, r.text
    p = r.json()
    assert [c["id"] for c in p["contacts"]] == [a["id"], b["id"]]
    assert "email" in p["differing_fields"] and "name" not in p["differing_fields"]
    assert p["counts"][b["id"]]["leads"] == 1 and p["counts"][a["id"]]["leads"] == 0


# ── Who may merge ───────────────────────────────────────────────────────────
@pytest_asyncio.fixture
async def sales_rep(client, crm_tenant):
    role = (await client.post("/team/roles", json={"name": "Rep", "permissions": {"crm": ["read", "write"]}})).json()
    email = f"rep+{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/team/users", json={"name": "Rep", "email": email, "password": PASSWORD, "role_id": role["id"]})
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    await c.post("/auth/login", json={"email": email, "password": PASSWORD})
    yield c
    await c.aclose()


async def test_merging_needs_the_merge_key(client, crm_tenant, sales_rep):
    a, b = await _contact(client, name="A1"), await _contact(client, name="B1")
    assert (await _merge(sales_rep, a, b)).status_code == 403
    assert (await sales_rep.post("/contacts/merge/preview", json={"ids": [a["id"], b["id"]]})).status_code == 403
