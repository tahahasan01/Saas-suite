"""Products and line items on deals (wave D, C14, migration 0120).

Lines are priced by the one pricing function; while a deal has lines its
value is their pre-tax total and can't be typed. Catalog prices are
snapshotted, "update prices" leaves hand-typed prices alone, and a line
discount over the tenant's ceiling needs crm.deal.discount_override."""
from __future__ import annotations

import pytest_asyncio

from ..conftest import _drop, _signup
from .helpers import add_teammate, login, login_as_rep


@pytest_asyncio.fixture
async def shop(client):
    """A tenant that sells from a catalog: CRM and POS."""
    tenant_id = await _signup(client, ["crm", "pos"])
    yield tenant_id
    await _drop(tenant_id)


async def _lead(client, name: str = "Bilal Traders order") -> dict:
    r = await client.post("/crm/leads", json={"name": name, "value_minor": 5_000_00, "force": True})
    assert r.status_code == 201, r.text
    return r.json()


async def _product(client, name: str = "Steel rack", price_minor: int = 12_000_00) -> dict:
    r = await client.post("/pos/products", json={"name": name, "price_minor": price_minor, "unit": "pcs"})
    assert r.status_code in (200, 201), r.text
    return r.json()


def _from(product: dict, qty: int = 1, **extra) -> dict:
    """A line as the editor builds it from a picked product."""
    return {"product_id": product["id"], "description": product["name"], "qty": qty,
            "unit_price_minor": product["price_minor"], **extra}


async def _put(client, lead_id: str, lines: list[dict], **extra):
    return await client.put(f"/crm/leads/{lead_id}/lines", json={"lines": lines, **extra})


async def test_lines_are_priced_and_set_the_deal_value(client, shop):
    lead = await _lead(client)
    r = await _put(client, lead["id"], [
        {"description": "Installation", "qty": 2, "unit_price_minor": 50_000_00, "tax_code": "gst_standard"},
        {"description": "Delivery", "qty": 1, "unit_price_minor": 10_000_00, "line_discount_minor": 1_000_00},
    ])
    assert r.status_code == 200, r.text
    body = r.json()
    install, delivery = body["lines"]
    assert install["net_excl_minor"] == 100_000_00 and install["tax_minor"] == 18_000_00
    assert install["total_minor"] == 118_000_00 and install["tax_rate_pct"] == 18
    assert delivery["net_excl_minor"] == 9_000_00 and delivery["tax_minor"] == 0
    assert body["subtotal_minor"] == 110_000_00 and body["line_discount_minor"] == 1_000_00
    assert body["net_minor"] == 109_000_00 and body["tax_minor"] == 18_000_00
    assert body["total_minor"] == 127_000_00

    after = (await client.get(f"/crm/leads/{lead['id']}")).json()["lead"]
    # Pre-tax: a tax change must not move the pipeline.
    assert after["value_minor"] == 109_000_00 and after["line_count"] == 2
    assert (await client.get(f"/crm/leads/{lead['id']}/lines")).json() == body


async def test_tax_inclusive_lines_split_the_tax_out(client, shop):
    lead = await _lead(client)
    r = await _put(client, lead["id"], [
        {"description": "Kit", "qty": 1, "unit_price_minor": 118_00, "tax_code": "gst_standard"}],
        tax_inclusive=True)
    assert r.status_code == 200, r.text
    assert r.json()["net_minor"] == 100_00 and r.json()["total_minor"] == 118_00
    assert r.json()["tax_inclusive"] is True


async def test_a_product_line_snapshots_the_catalog(client, shop):
    lead = await _lead(client)
    rack = await _product(client)
    r = await _put(client, lead["id"], [_from(rack, qty=3)])
    assert r.status_code == 200, r.text
    line = r.json()["lines"][0]
    assert line["description"] == "Steel rack" and line["unit"] == "pcs"
    assert line["unit_price_minor"] == 12_000_00 and line["list_price_minor"] == 12_000_00
    assert line["price_overridden"] is False and line["product_id"] == rack["id"]

    # Renaming or repricing the product later doesn't touch the open deal.
    await client.patch(f"/pos/products/{rack['id']}", json={"name": "Rack v2", "price_minor": 15_000_00})
    again = (await client.get(f"/crm/leads/{lead['id']}/lines")).json()["lines"][0]
    assert again["description"] == "Steel rack" and again["unit_price_minor"] == 12_000_00


async def test_a_typed_price_is_kept_by_update_prices(client, shop):
    lead = await _lead(client)
    rack, shelf = await _product(client), await _product(client, "Shelf", 2_000_00)
    r = await _put(client, lead["id"], [
        _from(rack),
        _from(shelf, unit_price_minor=1_500_00),
    ])
    assert [ln["price_overridden"] for ln in r.json()["lines"]] == [False, True]

    await client.patch(f"/pos/products/{rack['id']}", json={"price_minor": 13_000_00})
    await client.patch(f"/pos/products/{shelf['id']}", json={"price_minor": 2_500_00})
    r = await client.post(f"/crm/leads/{lead['id']}/lines/update-prices")
    assert r.status_code == 200, r.text
    rack_line, shelf_line = r.json()["lines"]
    assert rack_line["unit_price_minor"] == 13_000_00 and rack_line["list_price_minor"] == 13_000_00
    assert shelf_line["unit_price_minor"] == 1_500_00          # typed by hand: left alone
    lead_now = (await client.get(f"/crm/leads/{lead['id']}")).json()["lead"]
    assert lead_now["value_minor"] == 14_500_00


async def test_value_is_read_only_while_the_deal_has_lines(client, shop):
    lead = await _lead(client)
    await _put(client, lead["id"], [{"description": "Service", "qty": 1, "unit_price_minor": 7_000_00}])
    r = await client.patch(f"/crm/leads/{lead['id']}", json={"value_minor": 1})
    assert r.status_code == 409, r.text
    # Other fields still save.
    assert (await client.patch(f"/crm/leads/{lead['id']}", json={"priority": 2})).status_code == 200

    # No lines: the value is a typed estimate again, starting from the last total.
    r = await _put(client, lead["id"], [])
    assert r.status_code == 200 and r.json()["lines"] == []
    lead_now = (await client.get(f"/crm/leads/{lead['id']}")).json()["lead"]
    assert lead_now["line_count"] == 0 and lead_now["value_minor"] == 7_000_00
    assert (await client.patch(f"/crm/leads/{lead['id']}", json={"value_minor": 9_000_00})).status_code == 200


async def test_the_value_change_lands_on_the_timeline(client, shop):
    lead = await _lead(client)
    await _put(client, lead["id"], [{"description": "Service", "qty": 1, "unit_price_minor": 7_000_00}])
    events = (await client.get(f"/crm/leads/{lead['id']}/timeline")).json()["items"]
    fields = [c["field"] for e in events for c in (e.get("changes") or [])]
    assert "value_minor" in fields


async def test_a_line_needs_a_description_and_a_price(client, shop):
    lead = await _lead(client)
    for bad in ({"qty": 1}, {"description": "No price", "qty": 1}, {"unit_price_minor": 100, "qty": 1},
                {"description": "Zero", "qty": 0, "unit_price_minor": 100},
                {"description": "Odd key", "qty": 1, "unit_price_minor": 100, "owner_id": None}):
        r = await _put(client, lead["id"], [bad])
        assert r.status_code == 422, (bad, r.text)


async def test_another_tenants_product_is_not_found(client, shop):
    other = await _product(client, "Mine")
    await _signup(client, ["crm", "pos"])
    try:
        lead = await _lead(client)
        r = await _put(client, lead["id"], [_from(other)])
        assert r.status_code == 404, r.text
    finally:
        me = (await client.get("/auth/me")).json()
        await _drop(me["tenant"]["id"])


async def test_only_an_open_deal_takes_lines(client, shop):
    lead = await _lead(client)
    assert (await client.post(f"/crm/leads/{lead['id']}/won")).status_code == 200
    r = await _put(client, lead["id"], [{"description": "Late", "qty": 1, "unit_price_minor": 100}])
    assert r.status_code == 409, r.text


async def test_a_discount_over_the_ceiling_needs_the_override(client, shop):
    r = await client.put("/crm/settings", json={"max_discount_pct": 10})
    assert r.status_code == 200 and r.json()["max_discount_pct"] == 10
    lead = await _lead(client)
    lines = [{"description": "Panel", "qty": 1, "unit_price_minor": 100_000_00, "line_discount_minor": 20_000_00}]

    # The owner can give it on their own deal...
    assert (await _put(client, lead["id"], lines)).status_code == 200
    _, rep = await add_teammate(client, ["read", "write"])
    _, manager = await add_teammate(client, ["read", "write", "admin"])

    # ...a rep can't.
    await login(client, rep)
    assert (await client.get("/crm/settings")).json()["max_discount_pct"] == 10   # reps see the ceiling
    assert (await client.put("/crm/settings", json={"max_discount_pct": 50})).status_code == 403
    rep_lead = await _lead(client, "Rep deal")
    r = await _put(client, rep_lead["id"], lines)
    assert r.status_code == 403, r.text
    ok = [{**lines[0], "line_discount_minor": 10_000_00}]       # exactly at the ceiling is fine
    assert (await _put(client, rep_lead["id"], ok)).status_code == 200

    # crm admin holds crm.deal.discount_override.
    await login(client, manager)
    manager_lead = await _lead(client, "Manager deal")
    assert (await _put(client, manager_lead["id"], lines)).status_code == 200


async def test_reading_and_writing_lines_need_crm_rights(client, shop):
    lead = await _lead(client)
    await login_as_rep(client, shop, ["read"])
    assert (await client.get(f"/crm/leads/{lead['id']}/lines")).status_code == 200
    r = await _put(client, lead["id"], [{"description": "x", "qty": 1, "unit_price_minor": 1}])
    assert r.status_code == 403, r.text
