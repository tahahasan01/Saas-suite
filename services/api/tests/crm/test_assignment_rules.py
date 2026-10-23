"""Lead assignment rules by source and area (wave D leftovers, C13, 0130).

Rules are an ordered list: the first whose source and/or city match the new
lead hands it, in turn, to its own people, who must be in the lead pool so
caps, pausing and leave still apply. If none of them can take it, the next
rule, then the whole pool, then the owner. A form that names its own owner
skips all of this."""
from __future__ import annotations

import uuid

import pytest_asyncio

from app import ratelimit, web_forms

from ..conftest import _drop, _signup
from .helpers import add_teammate, q
from .test_web_forms import make_form, submit


@pytest_asyncio.fixture
async def shop(client, monkeypatch):
    monkeypatch.setattr(web_forms, "MIN_FILL_SECONDS", 0)
    tenant_id = await _signup(client, ["crm"])
    yield tenant_id
    await _drop(tenant_id)


async def owner_of(tenant_id: str, name: str) -> str:
    [row] = await q("select owner_id, city from crm_leads where tenant_id = $1 and name = $2",
                    uuid.UUID(tenant_id), name)
    return str(row["owner_id"])


async def pool(client, *members: str, **caps) -> None:
    r = await client.put("/crm/assignment/pool", json={"members": [{"user_id": m, **caps.get(m, {})}
                                                                    for m in members]})
    assert r.status_code == 200, r.text


async def rules(client, *items: dict):
    return await client.put("/crm/assignment/rules", json={"rules": list(items)})


async def test_a_source_rule_sends_its_leads_to_its_people(client, shop):
    a, _ = await add_teammate(client, ["read", "write"])
    b, _ = await add_teammate(client, ["read", "write"])
    await pool(client, a, b)
    r = await rules(client, {"name": "Facebook to Ali", "source": "Facebook page", "user_ids": [a]})
    assert r.status_code == 200, r.text
    fb = await make_form(client, source="facebook page")
    site = await make_form(client, name="Site", source="website")
    for i in range(3):
        await submit(client, fb, name=f"FB {i}", phone=f"0300111000{i}")
        await submit(client, site, name=f"Site {i}", phone=f"0300222000{i}")
        ratelimit.reset()
    assert {await owner_of(shop, f"FB {i}") for i in range(3)} == {a}
    site_owners = [await owner_of(shop, f"Site {i}") for i in range(3)]
    assert set(site_owners) <= {a, b} and b in site_owners       # no rule: the whole pool, in turn
    detail = (await client.get("/crm/leads")).json()
    fb_lead = next(x for x in detail if x["name"] == "FB 0")
    events = (await client.get(f"/crm/leads/{fb_lead['id']}/timeline")).json()["items"]
    assert any("Facebook to Ali" in (e.get("body") or "") for e in events)


async def test_an_area_rule_matches_the_city_the_visitor_gave(client, shop):
    a, _ = await add_teammate(client, ["read", "write"])
    b, _ = await add_teammate(client, ["read", "write"])
    await pool(client, a, b)
    await rules(client, {"name": "Lahore team", "city": "Lahore", "user_ids": [b]})
    form = await make_form(client, fields=["phone", "city"])
    await submit(client, form, name="Lahori", city=" lahore ")
    await submit(client, form, name="Karachiite", phone="03002223344", city="Karachi")
    assert await owner_of(shop, "Lahori") == b
    [row] = await q("select city from crm_leads where tenant_id = $1 and name = 'Lahori'", uuid.UUID(shop))
    assert row["city"] == "lahore"                            # the lead keeps the city now


async def test_the_first_matching_rule_wins_and_a_full_rule_falls_through(client, shop):
    a, _ = await add_teammate(client, ["read", "write"])
    b, _ = await add_teammate(client, ["read", "write"])
    c, _ = await add_teammate(client, ["read", "write"])
    await pool(client, a, b, c, **{a: {"daily_cap": 1}})
    await rules(client,
                {"name": "Both match: first", "source": "web form", "city": "Multan", "user_ids": [a]},
                {"name": "Source only", "source": "web form", "user_ids": [b]})
    form = await make_form(client, fields=["phone", "city"])
    await submit(client, form, name="First", city="Multan")
    ratelimit.reset()
    await submit(client, form, name="Second", phone="03004445566", city="Multan")   # a is at their cap
    ratelimit.reset()
    await submit(client, form, name="Third", phone="03004445567", city="Quetta")
    assert await owner_of(shop, "First") == a
    assert await owner_of(shop, "Second") == b
    assert await owner_of(shop, "Third") == b


async def test_rule_people_must_be_in_the_pool(client, shop):
    a, _ = await add_teammate(client, ["read", "write"])
    r = await rules(client, {"name": "Not pooled", "source": "x", "user_ids": [a]})
    assert r.status_code == 422 and "pool" in r.text.lower()
    assert (await rules(client, {"name": "Nobody", "source": "x", "user_ids": []})).status_code == 422
    assert (await rules(client, {"name": "Matches all", "user_ids": [a]})).status_code == 422   # needs source or city


async def test_rules_are_read_back_in_order_and_replaced(client, shop):
    a, _ = await add_teammate(client, ["read", "write"])
    await pool(client, a)
    await rules(client, {"name": "One", "source": "a", "user_ids": [a]}, {"name": "Two", "city": "b", "user_ids": [a]})
    got = (await client.get("/crm/assignment/rules")).json()
    assert [x["name"] for x in got] == ["One", "Two"] and got[0]["user_ids"] == [a]
    await rules(client, {"name": "Only", "source": "c", "user_ids": [a]})
    assert [x["name"] for x in (await client.get("/crm/assignment/rules")).json()] == ["Only"]


async def test_another_companys_people_cant_be_named(client, shop):
    theirs, _ = await add_teammate(client, ["read", "write"])
    await _signup(client, ["crm"])
    try:
        r = await rules(client, {"name": "X", "source": "x", "user_ids": [theirs]})
        assert r.status_code in (404, 422), r.text
        assert (await client.get("/crm/assignment/rules")).json() == []
    finally:
        me = (await client.get("/auth/me")).json()
        await _drop(me["tenant"]["id"])
