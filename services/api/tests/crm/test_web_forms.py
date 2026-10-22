"""Web lead forms and lead assignment (wave D, C12/C13, migration 0122).

A form lives on a hosted page (/f/{public_id}). Everything about the lead it
makes comes from the form row, never from the visitor; the answer is the same
whether a lead was made, merged into an open one or dropped as spam, so the
form can't be used to learn who is already a customer. New leads without an
owner go round the assignment pool."""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio

from app import ratelimit, web_forms

from ..conftest import _drop, _signup
from .helpers import add_teammate, login_as_rep, q


@pytest_asyncio.fixture
async def shop(client, monkeypatch):
    monkeypatch.setattr(web_forms, "MIN_FILL_SECONDS", 0)   # tests submit at once
    tenant_id = await _signup(client, ["crm"])
    yield tenant_id
    await _drop(tenant_id)


async def make_form(client, **body) -> dict:
    r = await client.post("/crm/web-forms", json={"name": "Website enquiries", "title": "Get a quote",
                                                  "fields": ["phone", "email", "message"], **body})
    assert r.status_code == 201, r.text
    return r.json()


async def submit(client, form: dict, **values):
    """As a visitor: read the form (for its ticket), then post it."""
    page = await client.get(f"/public/forms/{form['public_id']}")
    assert page.status_code == 200, page.text
    body = {"name": "Ayesha Khan", "phone": "0300 1234567", **values}
    return await client.post(f"/public/forms/{form['public_id']}",
                             json={"ticket": page.json()["ticket"], "values": body})


async def leads_of(tenant_id: str, name: str | None = None) -> list:
    return await q("select * from crm_leads where tenant_id = $1 and ($2::text is null or name = $2) "
                   "order by created_at", uuid.UUID(tenant_id), name)


async def test_a_submission_becomes_a_lead_shaped_by_the_form(client, shop):
    pipelines = (await client.get("/crm/pipelines")).json()
    stage = pipelines[0]["stages"][1]
    form = await make_form(client, source="facebook page", stage_id=stage["id"])
    assert form["link"] == f"/f/{form['public_id']}"
    r = await submit(client, form, email="ayesha@example.com", message="Need 3 units by June",
                     utm_source="facebook", utm_campaign="eid-sale")
    assert r.status_code == 200, r.text
    assert r.json()["message"]
    [lead] = await leads_of(shop, "Ayesha Khan")
    assert lead["source"] == "facebook page" and str(lead["stage_id"]) == stage["id"]
    assert str(lead["web_form_id"]) == form["id"] and lead["phone"] == "+923001234567"
    assert lead["message"] == "Need 3 units by June"
    assert lead["utm_source"] == "facebook" and lead["utm_campaign"] == "eid-sale"
    assert lead["owner_id"] is not None             # nobody in the pool: the owner takes it


async def test_the_visitor_cannot_set_owner_stage_source_or_tenant(client, shop):
    form = await make_form(client)
    other = str(uuid.uuid4())
    r = await submit(client, form, owner_id=other, stage_id=other, tenant_id=other, source="admin", score=100)
    assert r.status_code == 200, r.text
    [lead] = await leads_of(shop, "Ayesha Khan")
    assert lead["source"] == "web form" and str(lead["owner_id"]) != other
    assert str(lead["tenant_id"]) == shop


async def test_the_public_description_reveals_nothing_internal(client, shop):
    user_id, _ = await add_teammate(client, ["read", "write"])
    form = await make_form(client, owner_id=user_id, intro="We reply within an hour")
    client.cookies.clear()
    r = await client.get(f"/public/forms/{form['public_id']}")
    page = r.json()
    assert page["title"] == "Get a quote" and page["intro"] == "We reply within an hour"
    assert page["fields"] == ["phone", "email", "message"] and page["business_name"]
    for secret in (form["id"], user_id, shop, "pipeline", "owner", "daily_cap"):
        assert secret not in r.text, secret


async def test_switched_off_and_unknown_forms_are_not_found(client, shop):
    form = await make_form(client)
    assert (await client.patch(f"/crm/web-forms/{form['id']}", json={"active": False})).status_code == 200
    assert (await client.get(f"/public/forms/{form['public_id']}")).status_code == 404
    assert (await client.get("/public/forms/abcdefghijklmnopqrstuv")).status_code == 404
    r = await client.post(f"/public/forms/{form['public_id']}", json={"ticket": "x", "values": {"name": "A"}})
    assert r.status_code == 404


async def test_a_name_and_a_way_to_reach_them_are_needed(client, shop):
    form = await make_form(client)
    assert (await submit(client, form, name=" ")).status_code == 422
    assert (await submit(client, form, phone="")).status_code == 422          # no phone, no email
    assert (await submit(client, form, phone="", email="a@example.com")).status_code == 200
    assert (await submit(client, form, phone="", email="not an email")).status_code == 422
    assert (await submit(client, form, message="x" * 2001)).status_code == 422


async def test_fields_the_form_does_not_ask_for_are_dropped(client, shop):
    form = await make_form(client, fields=["phone"])
    assert (await submit(client, form, company="Khan Traders", message="hello")).status_code == 200
    [lead] = await leads_of(shop, "Ayesha Khan")
    assert lead["company"] == "" and lead["message"] is None


async def test_bots_get_the_same_answer_and_make_nothing(client, shop, monkeypatch):
    form = await make_form(client)
    ok = (await submit(client, form, name="Real Person")).json()
    honeypot = await submit(client, form, name="Bot One", website="http://spam.example")
    forged = await client.post(f"/public/forms/{form['public_id']}",
                               json={"ticket": "1700000000.forged", "values": {"name": "Bot Two", "phone": "03001112222"}})
    monkeypatch.setattr(web_forms, "MIN_FILL_SECONDS", 60)
    too_fast = await submit(client, form, name="Bot Three")
    for r in (honeypot, forged, too_fast):
        assert r.status_code == 200 and r.json() == ok, r.text
    assert [lr["name"] for lr in await leads_of(shop)
            if lr["web_form_id"] is not None] == ["Real Person"]


async def test_an_expired_ticket_asks_a_person_to_reload(client, shop, monkeypatch):
    form = await make_form(client)
    page = (await client.get(f"/public/forms/{form['public_id']}")).json()
    monkeypatch.setattr(web_forms, "TICKET_TTL_SECONDS", -1)
    r = await client.post(f"/public/forms/{form['public_id']}",
                          json={"ticket": page["ticket"], "values": {"name": "Slow", "phone": "03001234567"}})
    assert r.status_code == 409, r.text


async def test_a_repeat_enquiry_lands_on_the_open_lead(client, shop):
    form = await make_form(client)
    first = await submit(client, form, message="First message")
    again = await submit(client, form, name="Ayesha K.", phone="+92 300 1234567", message="Any update?")
    assert again.json() == first.json()             # the visitor can't tell a merge from a new lead
    leads = [lr for lr in await leads_of(shop) if lr["web_form_id"] is not None]
    assert len(leads) == 1
    detail = (await client.get(f"/crm/leads/{leads[0]['id']}")).json()
    assert any("Any update?" in (e.get("body") or "") for e in detail["timeline"])
    assert any("enquir" in a["summary"].lower() for a in detail["activities"])


async def test_a_flood_stops_at_the_daily_cap(client, shop):
    form = await make_form(client, daily_cap=2)
    for i in range(2):
        assert (await submit(client, form, name=f"Person {i}", phone=f"0300555000{i}")).status_code == 200
        ratelimit.reset()
    assert (await submit(client, form, name="Person 3", phone="03005550009")).status_code == 429


async def test_submissions_are_rate_limited_per_ip(client, shop, monkeypatch):
    monkeypatch.setattr(ratelimit, "_window", lambda w: (1, w))   # one window, whatever the clock says
    form = await make_form(client)
    codes = [(await submit(client, form, name=f"P{i}", phone=f"030066600{i:02d}")).status_code for i in range(6)]
    assert codes == [200] * 5 + [429]


# ── Assignment (C13) ────────────────────────────────────────────────────────
async def test_the_pool_takes_turns_and_skips_paused_and_capped_people(client, shop):
    a, _ = await add_teammate(client, ["read", "write"])
    b, _ = await add_teammate(client, ["read", "write"])
    c, _ = await add_teammate(client, ["read", "write"])
    r = await client.put("/crm/assignment/pool", json={"members": [
        {"user_id": a}, {"user_id": b, "daily_cap": 1}, {"user_id": c, "active": False}]})
    assert r.status_code == 200, r.text
    assert {m["user_id"] for m in r.json()} == {a, b, c}
    form = await make_form(client)
    owners = []
    for i in range(4):
        await submit(client, form, name=f"Turn {i}", phone=f"0301777000{i}")
        ratelimit.reset()
        [lead] = await leads_of(shop, f"Turn {i}")
        owners.append(str(lead["owner_id"]))
    assert c not in owners                          # paused
    assert owners.count(b) == 1                     # capped at one a day
    assert owners.count(a) == 3
    assert owners[0] != owners[1]                   # turns, not one person first
    detail = (await client.get(f"/crm/leads/{(await leads_of(shop, 'Turn 0'))[0]['id']}")).json()
    assert any("assigned" in (e.get("body") or "").lower() for e in detail["timeline"])


async def test_people_on_leave_today_are_skipped(client, shop):
    await client.patch("/entitlements/hrms", json={"enabled": True})
    away, _ = await add_teammate(client, ["read", "write"])
    here, _ = await add_teammate(client, ["read", "write"])
    emp = await q("""insert into hrms_employees (tenant_id, name, user_id, join_date)
                     values ($1, 'Away', $2, current_date - 100) returning id""", uuid.UUID(shop), uuid.UUID(away))
    # Today on the tenant's clock (the server's UTC date can still be yesterday in Karachi).
    await q("""insert into hrms_leave_requests (tenant_id, employee_id, leave_type, from_date, to_date, status)
               select $1, $2, 'casual', d, d, 'approved'
                 from (select tenant_today(timezone) as d from tenants where id = $1) t""",
            uuid.UUID(shop), emp[0]["id"])
    await client.put("/crm/assignment/pool", json={"members": [{"user_id": away}, {"user_id": here}]})
    form = await make_form(client)
    for i in range(2):
        await submit(client, form, name=f"Leave {i}", phone=f"0302888000{i}")
        ratelimit.reset()
    owners = {str(lr["owner_id"]) for lr in await leads_of(shop) if lr["name"].startswith("Leave")}
    assert owners == {here}


async def test_a_form_with_an_owner_skips_the_pool(client, shop):
    a, _ = await add_teammate(client, ["read", "write"])
    b, _ = await add_teammate(client, ["read", "write"])
    await client.put("/crm/assignment/pool", json={"members": [{"user_id": a}]})
    form = await make_form(client, owner_id=b)
    await submit(client, form)
    [lead] = await leads_of(shop, "Ayesha Khan")
    assert str(lead["owner_id"]) == b


async def test_pool_members_must_be_teammates(client, shop):
    r = await client.put("/crm/assignment/pool", json={"members": [{"user_id": str(uuid.uuid4())}]})
    assert r.status_code == 404, r.text


@pytest.mark.parametrize("path,method", [("/crm/web-forms", "post"), ("/crm/assignment/pool", "put")])
async def test_forms_and_the_pool_are_crm_settings(client, shop, path, method):
    await login_as_rep(client, shop, ["read", "write"])
    body = {"name": "X"} if method == "post" else {"members": []}
    assert (await getattr(client, method)(path, json=body)).status_code == 403
    assert (await client.get("/crm/web-forms")).status_code == 403


async def test_crm_admins_can_list_who_may_join_the_pool(client, shop):
    a, _ = await add_teammate(client, ["read", "write"])
    await login_as_rep(client, shop, ["read", "write", "admin"])
    r = await client.get("/crm/assignment/people")
    assert r.status_code == 200, r.text
    people = r.json()
    assert any(p["id"] == a for p in people)
    assert set(people[0]) == {"id", "name"}          # no emails or roles
