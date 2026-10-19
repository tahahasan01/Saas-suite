"""POS money correctness (audit P0-5): what the customer pays, what FBR is
told, and what a refund gives back must all come from the same numbers.

Prices are in minor units (paisa). FBR is faked by the shared `fake_fbr`.
"""
from __future__ import annotations

import asyncio
import uuid

import asyncpg
import pytest_asyncio

from app.config import settings

SELLER = {"seller_ntn_cnic": "1234567", "seller_business_name": "Fixture Traders",
          "seller_province": "Punjab", "seller_address": "1 Mall Road, Lahore",
          "token": "sandbox-token"}


async def _taxed_shop(client, *, inclusive: bool) -> list[str]:
    """Two products at Rs 100 and Rs 50, 18% GST, with HS codes; FBR on."""
    products = (await client.get("/pos/products")).json()
    for p in products:  # every active product must be fileable
        await client.patch(f"/pos/products/{p['id']}", json={"hs_code": "0101.2100"})
    a, b = products[0]["id"], products[1]["id"]
    await client.patch(f"/pos/products/{a}", json={"price_minor": 10_000, "tax_rate": 18, "stock_qty": 50})
    await client.patch(f"/pos/products/{b}", json={"price_minor": 5_000, "tax_rate": 18, "stock_qty": 50})
    r = await client.put("/fbr/settings", json={**SELLER, "prices_include_tax": inclusive, "enabled": True})
    r.raise_for_status()
    return [a, b]


@pytest_asyncio.fixture
async def exclusive_shop(client, pos_tenant, fake_fbr):
    return await _taxed_shop(client, inclusive=False)


@pytest_asyncio.fixture
async def inclusive_shop(client, pos_tenant, fake_fbr):
    return await _taxed_shop(client, inclusive=True)


def _cents(rupees: float) -> int:
    return round(rupees * 100)


async def test_exclusive_tax_is_added_to_what_the_customer_pays(client, exclusive_shop):
    a, _ = exclusive_shop
    r = await client.post("/pos/sales", json={"items": [{"product_id": a, "qty": 1}],
                                              "paid_minor": 11_800, "payment_method": "cash"})
    assert r.status_code == 201
    assert r.json()["total_minor"] == 11_800  # Rs 100 + 18% GST, not Rs 100


async def test_fbr_is_told_the_discount_and_the_tax_after_it(client, inclusive_shop, fake_fbr):
    a, b = inclusive_shop
    r = await client.post("/pos/sales", json={
        "items": [{"product_id": a, "qty": 1}, {"product_id": b, "qty": 2}],  # gross Rs 200
        "discount_minor": 2_000, "paid_minor": 18_000, "payment_method": "cash"})
    assert r.status_code == 201
    assert r.json()["total_minor"] == 18_000
    lines = fake_fbr.payloads[-1]["items"]
    # Every rupee of discount is reported, and FBR's totals equal what was collected.
    assert sum(_cents(l["discount"]) for l in lines) == 2_000
    assert sum(_cents(l["totalValues"]) for l in lines) == 18_000
    assert sum(_cents(l["valueSalesExcludingST"]) + _cents(l["salesTaxApplicable"])
               for l in lines) == 18_000


async def test_a_refund_returns_what_was_paid_not_the_list_price(client, inclusive_shop):
    a, _ = inclusive_shop
    sale = (await client.post("/pos/sales", json={
        "items": [{"product_id": a, "qty": 2}], "discount_minor": 2_000,
        "paid_minor": 18_000, "payment_method": "cash"})).json()
    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    r = await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": item["sale_item_id"], "qty": 1}]})
    assert r.status_code == 201
    assert r.json()["refund_minor"] == 9_000  # half of the Rs 180 paid, not Rs 100


async def test_returning_everything_in_parts_refunds_exactly_what_was_paid(client, inclusive_shop):
    a, _ = inclusive_shop
    sale = (await client.post("/pos/sales", json={
        "items": [{"product_id": a, "qty": 3}], "discount_minor": 1_000,  # Rs 290 paid
        "paid_minor": 29_000, "payment_method": "cash"})).json()
    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    refunds = []
    for _ in range(3):
        r = await client.post(f"/pos/sales/{sale['id']}/returns", json={
            "items": [{"sale_item_id": item["sale_item_id"], "qty": 1}]})
        refunds.append(r.json()["refund_minor"])
    assert sum(refunds) == 29_000  # no paisa lost or invented by rounding


async def test_two_returns_of_the_last_unit_cannot_both_succeed(client, inclusive_shop):
    """Deterministic race: two returns of the only unit start together; only one
    may be accepted."""
    a, _ = inclusive_shop
    sale = (await client.post("/pos/sales", json={
        "items": [{"product_id": a, "qty": 1}], "paid_minor": 10_000, "payment_method": "cash"})).json()
    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    body = {"items": [{"sale_item_id": item["sale_item_id"], "qty": 1}]}

    blocker = await asyncpg.connect(settings.database_url)
    try:
        tx = blocker.transaction()
        await tx.start()
        # Hold the product row: each return restocks it *after* its returnability
        # check, so both racers pass the check and then wait here. Only a lock
        # taken before the check (on the sale) can make the second one see the first.
        await blocker.execute("select 1 from pos_products where id = $1 for update", uuid.UUID(a))
        racers = [asyncio.create_task(client.post(f"/pos/sales/{sale['id']}/returns", json=body))
                  for _ in range(2)]
        await asyncio.sleep(0.5)
        await tx.commit()
        codes = sorted(r.status_code for r in await asyncio.gather(*racers))
    finally:
        await blocker.close()
    assert codes == [201, 409]


async def test_fbr_cannot_be_switched_on_while_products_lack_hs_codes(client, pos_tenant):
    """Every sale would be rejected by FBR (error 0052) and queue up forever."""
    r = await client.put("/fbr/settings", json={**SELLER, "enabled": True})
    assert r.status_code == 422
    assert "hs code" in r.json()["detail"].lower()


async def test_listing_one_line_twice_cannot_return_more_than_was_bought(client, inclusive_shop):
    """Security review of 5b70ba2: each entry was checked against the quantity
    returned *before* the request, so the same line twice slipped past it."""
    a, _ = inclusive_shop
    sale = (await client.post("/pos/sales", json={
        "items": [{"product_id": a, "qty": 1}], "paid_minor": 10_000, "payment_method": "cash"})).json()
    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    line = {"sale_item_id": item["sale_item_id"], "qty": 1}
    r = await client.post(f"/pos/sales/{sale['id']}/returns", json={"items": [line, line]})
    assert r.status_code == 422
    detail = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    assert detail["qty_returned"] == 0
