"""Leads and sales point at contacts (St02 P0, D-31, docs §7.1).

* Qualify links a lead to an existing contact or creates one from it.
* The backfill creates contacts for leads worth keeping (option b: a phone or
  email, or won), dedups on the normalised keys, and sends shared numbers and
  same-number-different-name collisions to a review queue instead of merging.
* A POS sale may name its customer; walk-ins stay null.
"""
from __future__ import annotations

import uuid

import asyncpg

from app.config import settings


async def _lead(client, **body) -> dict:
    body.setdefault("name", "Lead " + uuid.uuid4().hex[:6])
    body.setdefault("force", True)
    r = await client.post("/crm/leads", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def _contact(client, **body) -> dict:
    body.setdefault("force", True)
    r = await client.post("/contacts", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def _lead_contact(client, lead_id: str) -> dict | None:
    r = await client.get(f"/crm/leads/{lead_id}/contact")
    assert r.status_code == 200, r.text
    return r.json()


async def _won_stage(client) -> str:
    pipes = (await client.get("/crm/pipelines")).json()
    return next(s["id"] for s in pipes[0]["stages"] if s["kind"] == "won")


# ── Qualify ─────────────────────────────────────────────────────────────────
async def test_qualify_creates_a_contact_from_the_lead(client, crm_tenant):
    lead = await _lead(client, name="Hamza Ali", phone="0312-5550001", email="hamza@ali.pk", company="Ali Bros")
    assert await _lead_contact(client, lead["id"]) is None
    r = await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "create"})
    assert r.status_code == 200, r.text
    contact = r.json()["contact"]
    assert contact["name"] == "Hamza Ali"
    assert contact["phone_e164"] == "+923125550001"
    assert contact["company_name"] == "Ali Bros"
    assert (await _lead_contact(client, lead["id"]))["id"] == contact["id"]
    # Already qualified: creating again is refused; linking elsewhere is allowed.
    again = await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "create"})
    assert again.status_code == 409


async def test_qualify_create_offers_the_existing_contact_first(client, crm_tenant):
    existing = await _contact(client, name="Hamza", phone="03125550002")
    lead = await _lead(client, name="Hamza A", phone="+92 312 5550002")
    r = await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "create"})
    assert r.status_code == 409
    assert [d["id"] for d in r.json()["detail"]["duplicates"]] == [existing["id"]]
    r = await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "link", "contact_id": existing["id"]})
    assert r.status_code == 200
    assert (await _lead_contact(client, lead["id"]))["id"] == existing["id"]


async def test_qualify_can_create_the_company_too(client, crm_tenant):
    lead = await _lead(client, name="Owner Person", company="Noor Enterprises", email="o@noor.pk")
    r = await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "create", "create_company": True})
    assert r.status_code == 200, r.text
    person = r.json()["contact"]
    assert person["company_id"] and person["company_name"] == "Noor Enterprises"
    # A second lead from the same company joins the same company contact.
    lead2 = await _lead(client, name="Second Person", company="noor enterprises", email="s@noor.pk")
    r2 = await client.post(f"/crm/leads/{lead2['id']}/qualify", json={"mode": "create", "create_company": True})
    assert r2.json()["contact"]["company_id"] == person["company_id"]


async def test_qualify_validates_its_input(client, crm_tenant):
    lead = await _lead(client, name="V")
    assert (await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "link"})).status_code == 422
    assert (await client.post(f"/crm/leads/{lead['id']}/qualify",
                              json={"mode": "link", "contact_id": str(uuid.uuid4())})).status_code == 404
    assert (await client.post(f"/crm/leads/{uuid.uuid4()}/qualify", json={"mode": "create"})).status_code == 404
    assert (await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "adopt"})).status_code == 422


# ── Backfill (option b) ─────────────────────────────────────────────────────
async def test_sample_leads_arrive_linked(client, crm_tenant):
    """Signup seeds leads with phones; the seed runs the backfill, so the demo
    workspace starts with contacts."""
    leads = (await client.get("/crm/leads")).json()
    linked = [await _lead_contact(client, ld["id"]) for ld in leads]
    assert all(c is not None for c in linked)


async def test_backfill_creates_dedups_skips_and_reports(client, crm_tenant):
    won = await _won_stage(client)
    a = await _lead(client, name="Kashif Mehmood", phone="0300 7770001")
    a_again = await _lead(client, name="kashif  mehmood", phone="+923007770001")    # same person, typed again
    by_email = await _lead(client, name="Email Only", email="Only@Mail.pk")
    won_bare = await _lead(client, name="Won Without Details", stage_id=won)
    skipped = await _lead(client, name="No Way To Reach")
    bad_phone = await _lead(client, name="Bad Phone", phone="call reception")
    r = await client.post("/contacts/backfill")
    assert r.status_code == 200, r.text
    report = r.json()
    assert report["contacts_created"] == 4          # Kashif, Email Only, Won Without Details, Bad Phone
    assert report["leads_linked"] == 5
    assert report["invalid_phones"] == 1
    ka, kb = await _lead_contact(client, a["id"]), await _lead_contact(client, a_again["id"])
    assert ka["id"] == kb["id"] and ka["phone_e164"] == "+923007770001"
    assert (await _lead_contact(client, by_email["id"]))["email"] == "Only@Mail.pk"
    assert (await _lead_contact(client, won_bare["id"])) is not None
    assert (await _lead_contact(client, skipped["id"])) is None
    bad = await _lead_contact(client, bad_phone["id"])
    assert bad["phone"] == "call reception" and bad["phone_e164"] is None
    # Idempotent: a second run finds nothing to do.
    again = (await client.post("/contacts/backfill")).json()
    assert again["contacts_created"] == 0 and again["leads_linked"] == 0 and again["queued"] == 0


async def test_backfill_links_to_an_existing_contact_with_the_same_key_and_name(client, crm_tenant):
    c = await _contact(client, name="Rabia Sultan", email="rabia@sultan.pk")
    lead = await _lead(client, name="Rabia Sultan", email="RABIA@sultan.pk")
    await client.post("/contacts/backfill")
    assert (await _lead_contact(client, lead["id"]))["id"] == c["id"]


async def test_shared_numbers_and_name_clashes_go_to_review_not_merge(client, crm_tenant):
    shop = [await _lead(client, name=f"Shop caller {i}", phone="021-34560000") for i in range(6)]
    dad = await _lead(client, name="Tariq Javed", phone="03218880001")
    son = await _lead(client, name="Usman Tariq", phone="0321-8880001")
    report = (await client.post("/contacts/backfill")).json()
    assert report["queued"] == 7                     # six on the shared landline, plus the son
    for ld in shop:
        assert await _lead_contact(client, ld["id"]) is None
    assert await _lead_contact(client, dad["id"]) is not None
    assert await _lead_contact(client, son["id"]) is None
    queue = (await client.get("/contacts/review")).json()
    reasons = {q["lead_id"]: q["reason"] for q in queue}
    assert reasons[son["id"]] == "name_mismatch"
    assert all(reasons[ld["id"]] == "shared_phone" for ld in shop)
    son_item = next(q for q in queue if q["lead_id"] == son["id"])
    assert [c["name"] for c in son_item["candidates"]] == ["Tariq Javed"]
    # Resolving: qualify the son as his own contact; the item closes.
    r = await client.post(f"/crm/leads/{son['id']}/qualify", json={"mode": "create", "force": True})
    assert r.status_code == 200
    open_ids = [q["lead_id"] for q in (await client.get("/contacts/review")).json()]
    assert son["id"] not in open_ids
    # Dismissing keeps the lead unlinked and off the queue; a rerun doesn't requeue it.
    item = next(q for q in queue if q["lead_id"] == shop[0]["id"])
    assert (await client.post(f"/contacts/review/{item['id']}/dismiss")).status_code == 204
    await client.post("/contacts/backfill")
    assert shop[0]["id"] not in [q["lead_id"] for q in (await client.get("/contacts/review")).json()]


async def test_backfill_rows_are_marked_for_rollback(client, crm_tenant):
    lead = await _lead(client, name="Marked", phone="03009990001")
    await client.post("/contacts/backfill")
    cid = (await _lead_contact(client, lead["id"]))["id"]
    owner = await asyncpg.connect(settings.database_url)
    try:
        assert await owner.fetchval("select created_by_migration from contacts where id = $1", uuid.UUID(cid))
    finally:
        await owner.close()


# ── POS ─────────────────────────────────────────────────────────────────────
async def _product(client) -> dict:
    return (await client.get("/pos/products")).json()[0]


async def test_a_sale_can_name_its_customer_and_walk_ins_stay_anonymous(client, pos_tenant):
    p = await _product(client)
    c = await _contact(client, name="Regular", phone="03451112222")
    r = await client.post("/pos/sales", json={"items": [{"product_id": p["id"], "qty": 1}], "contact_id": c["id"]})
    assert r.status_code == 201, r.text
    assert r.json()["contact_id"] == c["id"]
    walk_in = await client.post("/pos/sales", json={"items": [{"product_id": p["id"], "qty": 1}]})
    assert walk_in.status_code == 201 and walk_in.json()["contact_id"] is None
    got = (await client.get(f"/pos/sales/{r.json()['id']}")).json()
    assert got["contact_id"] == c["id"]


async def test_a_sale_cannot_name_another_tenants_or_an_archived_contact(client, crm_tenant):
    # Archiving is contact management, which rides on CRM this wave.
    await client.patch("/entitlements/pos", json={"enabled": True})
    p = (await client.post("/pos/products", json={"name": "Widget", "price_minor": 1000, "stock_qty": 10})).json()
    r = await client.post("/pos/sales", json={"items": [{"product_id": p["id"], "qty": 1}],
                                              "contact_id": str(uuid.uuid4())})
    assert r.status_code == 404
    c = await _contact(client, name="Gone")
    await client.delete(f"/contacts/{c['id']}")
    r = await client.post("/pos/sales", json={"items": [{"product_id": p["id"], "qty": 1}], "contact_id": c["id"]})
    assert r.status_code == 409


async def test_a_replayed_cart_must_name_the_same_customer(client, pos_tenant):
    p = await _product(client)
    c = await _contact(client, name="Replay")
    cart = {"client_uuid": str(uuid.uuid4()), "items": [{"product_id": p["id"], "qty": 1}], "contact_id": c["id"]}
    assert (await client.post("/pos/sales", json=cart)).status_code == 201
    assert (await client.post("/pos/sales", json=cart)).status_code == 200
    other = await _contact(client, name="Someone else")
    assert (await client.post("/pos/sales", json={**cart, "contact_id": other["id"]})).status_code == 409


# ── Contact 360 ─────────────────────────────────────────────────────────────
async def test_contact_360_shows_deals_and_sales(client, crm_tenant):
    await client.patch("/entitlements/pos", json={"enabled": True})
    lead = await _lead(client, name="Three Sixty", phone="03007771234", value_minor=500000)
    r = await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "create"})
    cid = r.json()["contact"]["id"]
    product = (await client.post("/pos/products", json={"name": "Widget", "price_minor": 25000, "stock_qty": 10})).json()
    sale = await client.post("/pos/sales", json={"items": [{"product_id": product["id"], "qty": 2}],
                                                 "contact_id": cid})
    assert sale.status_code == 201, sale.text
    d = (await client.get(f"/contacts/{cid}")).json()
    assert [x["id"] for x in d["deals"]] == [lead["id"]]
    assert d["stats"]["open_deals"] == 1
    assert [s["id"] for s in d["sales"]] == [sale.json()["id"]]
    assert d["stats"]["sales_count"] == 1
    assert d["stats"]["lifetime_spend_minor"] == sale.json()["total_minor"]
    assert d["stats"]["last_visit_at"] is not None
    timeline = (await client.get(f"/contacts/{cid}/timeline")).json()
    assert any(e["entity_type"] == "lead" and e["entity_id"] == lead["id"] for e in timeline)


async def test_the_all_tenants_script_backfills_and_is_idempotent(client, crm_tenant):
    from scripts.backfill_contacts import backfill_all

    lead = await _lead(client, name="Script Lead", phone="03117770001")
    reports = await backfill_all()
    assert reports[crm_tenant.tenant_id].leads_linked == 1
    assert await _lead_contact(client, lead["id"]) is not None
    assert (await backfill_all())[crm_tenant.tenant_id].leads_linked == 0
