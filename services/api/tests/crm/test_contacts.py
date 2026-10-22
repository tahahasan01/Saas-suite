"""Contacts (D-30, St02 P0): one table for CRM, POS and invoicing.

People and companies, one level deep; phone stored raw and as an E.164 key
that is deliberately NOT unique (families and shops share numbers); archive
instead of delete; tags; addresses.
"""
from __future__ import annotations

import uuid

import asyncpg
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app

PASSWORD = "Sup3rSecret!23"


async def _new(client, **body) -> dict:
    body.setdefault("name", "Ali Raza")
    r = await client.post("/contacts", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def _login_with_role(owner, name: str, permissions: dict) -> AsyncClient:
    role = (await owner.post("/team/roles", json={"name": name, "permissions": permissions})).json()
    email = f"staff+{uuid.uuid4().hex[:8]}@example.com"
    r = await owner.post("/team/users", json={"name": name, "email": email,
                                              "password": PASSWORD, "role_id": role["id"]})
    assert r.status_code == 201, r.text
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    r = await c.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return c


@pytest_asyncio.fixture
async def cashier(client, crm_tenant):
    c = await _login_with_role(client, "Cashier", {"pos": ["read", "write"]})
    yield c
    await c.aclose()


# ── Create, read, list ──────────────────────────────────────────────────────
async def test_a_person_is_stored_with_raw_and_e164_phone(client, crm_tenant):
    c = await _new(client, name="Bilal Khan", phone="0300-5551234", email=" Bilal@KhanTraders.PK ")
    assert c["kind"] == "person"
    assert c["phone"] == "0300-5551234"
    assert c["phone_e164"] == "+923005551234"
    assert c["email"] == "Bilal@KhanTraders.PK"
    got = (await client.get(f"/contacts/{c['id']}")).json()
    assert got["contact"]["phone_e164"] == "+923005551234"


async def test_an_unplaceable_phone_keeps_only_the_raw_text(client, crm_tenant):
    c = await _new(client, phone="ext 12")
    assert c["phone"] == "ext 12" and c["phone_e164"] is None


async def test_search_finds_a_number_typed_another_way(client, crm_tenant):
    c = await _new(client, name="Sana Malik", phone="03334445566")
    r = await client.get("/contacts", params={"q": "+92 333 4445566"})
    assert r.status_code == 200
    assert [x["id"] for x in r.json()] == [c["id"]]
    assert r.headers["X-Total-Count"] == "1"
    by_name = (await client.get("/contacts", params={"q": "sana"})).json()
    assert c["id"] in [x["id"] for x in by_name]


async def test_unknown_roles_and_kinds_are_422(client, crm_tenant):
    assert (await client.post("/contacts", json={"name": "X", "roles": ["wizard"]})).status_code == 422
    assert (await client.post("/contacts", json={"name": "X", "kind": "family"})).status_code == 422
    ok = await _new(client, name="Y", roles=["customer", "supplier"])
    assert sorted(ok["roles"]) == ["customer", "supplier"]


# ── Companies, one level ────────────────────────────────────────────────────
async def test_a_person_belongs_to_one_company_and_reads_its_tax_numbers(client, crm_tenant):
    co = await _new(client, kind="company", name="Khan Traders", ntn="1234567-8", strn="17-00-1234-567-89")
    person = await _new(client, name="Bilal", company_id=co["id"])
    assert person["company_id"] == co["id"]
    assert person["company_name"] == "Khan Traders"
    assert person["effective_ntn"] == "1234567-8"
    detail = (await client.get(f"/contacts/{co['id']}")).json()
    assert [p["id"] for p in detail["people"]] == [person["id"]]


async def test_companies_do_not_nest_and_people_are_not_parents(client, crm_tenant):
    co = await _new(client, kind="company", name="Parent Co")
    r = await client.post("/contacts", json={"kind": "company", "name": "Child Co", "company_id": co["id"]})
    assert r.status_code == 422
    person = await _new(client, name="Not a company")
    r = await client.post("/contacts", json={"name": "Z", "company_id": person["id"]})
    assert r.status_code == 422


async def test_another_tenants_company_is_not_found(client, crm_tenant):
    owner = await asyncpg.connect(settings.database_url)
    try:
        other_tenant = await owner.fetchval(
            "insert into tenants (name, industry_type) values ('Other', 'retail') returning id")
        foreign = await owner.fetchval(
            "insert into contacts (tenant_id, kind, name) values ($1, 'company', 'Theirs') returning id",
            other_tenant)
        r = await client.post("/contacts", json={"name": "Mine", "company_id": str(foreign)})
        assert r.status_code == 404
        assert (await client.get(f"/contacts/{foreign}")).status_code == 404
    finally:
        await owner.execute("delete from tenants where id = $1", other_tenant)
        await owner.close()


# ── Duplicates (create) ─────────────────────────────────────────────────────
async def test_same_phone_any_spelling_is_a_409_with_the_match(client, crm_tenant):
    first = await _new(client, name="Bilal", phone="03005550000")
    r = await client.post("/contacts", json={"name": "Bilal K", "phone": "+92 300 5550000"})
    assert r.status_code == 409
    dups = r.json()["detail"]["duplicates"]
    assert [d["id"] for d in dups] == [first["id"]]
    assert dups[0]["reason"] == "phone"
    forced = await client.post("/contacts", json={"name": "Bilal K", "phone": "+92 300 5550000", "force": True})
    assert forced.status_code == 201  # phone_e164 is NOT unique


async def test_archived_contacts_still_count_as_duplicates(client, crm_tenant):
    old = await _new(client, name="Old", email="old@shop.pk")
    assert (await client.delete(f"/contacts/{old['id']}")).status_code == 204
    r = await client.post("/contacts", json={"name": "New", "email": "OLD@shop.pk"})
    assert r.status_code == 409
    dup = r.json()["detail"]["duplicates"][0]
    assert dup["id"] == old["id"] and dup["archived"] is True


async def test_a_key_shared_by_more_than_five_contacts_is_ignored(client, crm_tenant):
    for i in range(6):
        await _new(client, name=f"Family {i}", phone="042 35761234", force=True)
    r = await client.post("/contacts", json={"name": "Family 7", "phone": "04235761234"})
    assert r.status_code == 201, r.text


# ── Archive, restore ────────────────────────────────────────────────────────
async def test_archive_hides_from_the_list_and_restore_brings_back(client, crm_tenant):
    c = await _new(client, name="Archived Person")
    assert (await client.delete(f"/contacts/{c['id']}")).status_code == 204
    ids = [x["id"] for x in (await client.get("/contacts")).json()]
    assert c["id"] not in ids
    ids = [x["id"] for x in (await client.get("/contacts", params={"include_archived": True})).json()]
    assert c["id"] in ids
    r = await client.post(f"/contacts/{c['id']}/restore")
    assert r.status_code == 200 and r.json()["archived_at"] is None


async def test_update_renormalises_the_phone(client, crm_tenant):
    c = await _new(client, name="P", phone="03005556666")
    r = await client.patch(f"/contacts/{c['id']}", json={"phone": "0321 7654321", "city": "Lahore"})
    assert r.status_code == 200
    assert r.json()["phone_e164"] == "+923217654321" and r.json()["city"] == "Lahore"
    assert (await client.patch(f"/contacts/{c['id']}", json={"bogus": 1})).status_code == 422


# ── Tags and addresses ──────────────────────────────────────────────────────
async def test_tags_attach_and_filter(client, crm_tenant):
    vip = (await client.post("/tags", json={"name": "VIP", "color": "amber"})).json()
    a = await _new(client, name="Tagged", tag_ids=[vip["id"]])
    await _new(client, name="Untagged")
    assert [t["name"] for t in a["tags"]] == ["VIP"]
    listed = (await client.get("/contacts", params={"tag": vip["id"]})).json()
    assert [x["id"] for x in listed] == [a["id"]]
    assert (await client.post("/tags", json={"name": "vip"})).status_code == 409
    r = await client.patch(f"/contacts/{a['id']}", json={"tag_ids": []})
    assert r.json()["tags"] == []


async def test_addresses_crud(client, crm_tenant):
    c = await _new(client, name="Addressed")
    r = await client.post(f"/contacts/{c['id']}/addresses",
                          json={"kind": "billing", "line1": "12 Mall Road", "city": "Lahore", "is_default": True})
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    r = await client.patch(f"/contacts/{c['id']}/addresses/{aid}", json={"line2": "Gulberg"})
    assert r.json()["line2"] == "Gulberg"
    detail = (await client.get(f"/contacts/{c['id']}")).json()
    assert [a["id"] for a in detail["addresses"]] == [aid]
    assert (await client.delete(f"/contacts/{c['id']}/addresses/{aid}")).status_code == 204
    assert (await client.post(f"/contacts/{c['id']}/addresses", json={"kind": "moon", "line1": "x"})).status_code == 422


# ── Lookup at checkout ──────────────────────────────────────────────────────
async def test_lookup_by_phone_returns_every_live_holder(client, crm_tenant):
    a = await _new(client, name="Dad", phone="03001112222")
    b = await _new(client, name="Son", phone="0300-111-2222", force=True)
    gone = await _new(client, name="Gone", phone="03001112222", force=True)
    await client.delete(f"/contacts/{gone['id']}")
    r = await client.get("/contacts/lookup", params={"phone": "+923001112222"})
    assert r.status_code == 200
    body = r.json()
    assert body["phone_e164"] == "+923001112222"
    assert sorted(m["id"] for m in body["matches"]) == sorted([a["id"], b["id"]])
    assert body["shared"] is False
    assert (await client.get("/contacts/lookup", params={"phone": "garbage"})).json()["matches"] == []


async def test_a_cashier_can_look_up_and_add_a_customer_but_not_browse_contacts(client, crm_tenant, cashier):
    await client.patch("/entitlements/pos", json={"enabled": True})
    await _new(client, name="Walk-in regular", phone="03451234567")
    r = await cashier.get("/contacts/lookup", params={"phone": "03451234567"})
    assert r.status_code == 200 and len(r.json()["matches"]) == 1
    r = await cashier.post("/contacts", json={"name": "New customer", "phone": "03459876543"})
    assert r.status_code == 201, r.text
    assert (await cashier.get("/contacts")).status_code == 403
    assert (await cashier.get(f"/contacts/{r.json()['id']}")).status_code == 403


async def test_a_till_only_duplicate_answer_reveals_no_one(client, crm_tenant, cashier):
    """A cashier may add a customer, but the duplicate check must not become
    a way to read the contact book: phone only, a count, no names, emails
    or tax numbers (security review, MEDIUM)."""
    await client.patch("/entitlements/pos", json={"enabled": True})
    await _new(client, name="Secret Name", phone="03457770001", email="secret@hidden.pk", ntn="7654321-0")
    r = await cashier.post("/contacts", json={"name": "Probe", "phone": "0345-7770001"})
    assert r.status_code == 409
    text = r.text
    assert "Secret Name" not in text and "secret@hidden.pk" not in text and "7654321" not in text
    assert r.json()["detail"]["match_count"] == 1
    assert "duplicates" not in r.json()["detail"]
    # Email and NTN aren't matched for the till, so probing them says nothing.
    r = await cashier.post("/contacts", json={"name": "Probe 2", "email": "secret@hidden.pk"})
    assert r.status_code == 201


async def test_a_till_only_caller_sets_only_name_phone_and_email(client, crm_tenant, cashier):
    await client.patch("/entitlements/pos", json={"enabled": True})
    co = await _new(client, kind="company", name="Some Co")
    tag = (await client.post("/tags", json={"name": "Till probe"})).json()
    me = (await client.get("/auth/me")).json()["user"]["id"]
    for extra in ({"company_id": co["id"]}, {"tag_ids": [tag["id"]]}, {"owner_id": me},
                  {"kind": "company"}, {"ntn": "1234567-1"}, {"notes": "x"}, {"roles": ["supplier"]}):
        r = await cashier.post("/contacts", json={"name": "Limited", **extra})
        assert r.status_code == 403, (extra, r.text)
    r = await cashier.post("/contacts", json={"name": "Allowed", "phone": "03457770002", "email": "a@b.pk"})
    assert r.status_code == 201, r.text


async def test_contact_360_shows_sales_only_to_those_who_can_read_pos(client, crm_tenant):
    """Contacts read is not POS read: sales and spend stay hidden without it."""
    await client.patch("/entitlements/pos", json={"enabled": True})
    c = await _new(client, name="Big Spender", phone="03457770003")
    product = (await client.post("/pos/products", json={"name": "Widget", "price_minor": 1000, "stock_qty": 10})).json()
    sale = await client.post("/pos/sales", json={"items": [{"product_id": product["id"], "qty": 1}],
                                                 "contact_id": c["id"]})
    assert sale.status_code == 201
    sales_rep = await _login_with_role(client, "Sales rep", {"crm": ["read"]})
    try:
        d = (await sales_rep.get(f"/contacts/{c['id']}")).json()
    finally:
        await sales_rep.aclose()
    assert d["sales"] == []
    assert d["stats"]["sales_count"] == 0 and d["stats"]["lifetime_spend_minor"] == 0
    assert d["stats"]["last_visit_at"] is None
    owner_view = (await client.get(f"/contacts/{c['id']}")).json()
    assert len(owner_view["sales"]) == 1


def test_timeline_entities_follow_their_modules_read_keys():
    from app.routers.contacts import visible_entity_types

    everything = {"contacts.contact.read", "crm.lead.read", "invoicing.invoice.read", "pos.sale.read"}
    assert {"contact", "lead", "invoice_request", "pos_sale"} <= visible_entity_types(everything)
    only_contacts = visible_entity_types({"contacts.contact.read"})
    assert "contact" in only_contacts
    assert not {"lead", "invoice_request", "pos_sale"} & only_contacts
    # An entity type nobody registered is hidden, not shown by default.
    assert "payslip" not in visible_entity_types(everything)


async def test_without_crm_or_pos_access_contacts_are_403(client, tenant):
    # An HRMS-only tenant: neither CRM nor POS is switched on.
    assert (await client.get("/contacts")).status_code == 403
    assert (await client.get("/contacts/lookup", params={"phone": "03001234567"})).status_code == 403
