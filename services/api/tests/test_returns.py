"""POS returns.

The invariant worth guarding: you can never give back more than you bought,
including across several separate visits. Everything else is bookkeeping.
"""
from __future__ import annotations

import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def shop(client, pos_tenant):
    """A completed sale of 3 units, ready to be returned against."""
    products = (await client.get("/pos/products")).json()
    p = products[0]
    await client.patch(f"/pos/products/{p['id']}", json={"price_minor": 10_000, "stock_qty": 50})
    sale = (await client.post("/pos/sales", json={
        "items": [{"product_id": p["id"], "qty": 3}],
        "paid_minor": 30_000, "discount_minor": 0, "payment_method": "cash",
    })).json()
    return {"product_id": p["id"], "sale": sale}


async def _stock(client, product_id: str) -> float:
    products = (await client.get("/pos/products?include_archived=true")).json()
    return next(p for p in products if p["id"] == product_id)["stock_qty"]


async def test_returnable_starts_at_what_was_sold(client, pos_tenant, shop):
    detail = (await client.get(f"/pos/sales/{shop['sale']['id']}")).json()
    line = detail["returnable"][0]
    assert line["qty_sold"] == 3
    assert line["qty_returned"] == 0
    assert line["qty_returnable"] == 3


async def test_partial_return_refunds_and_restocks(client, pos_tenant, shop):
    before = await _stock(client, shop["product_id"])
    detail = (await client.get(f"/pos/sales/{shop['sale']['id']}")).json()
    item = detail["returnable"][0]

    r = await client.post(f"/pos/sales/{shop['sale']['id']}/returns", json={
        "items": [{"sale_item_id": item["sale_item_id"], "qty": 1}], "reason": "Wrong size",
    })
    assert r.status_code == 201
    assert r.json()["refund_minor"] == 10_000          # one unit, not the whole sale
    assert await _stock(client, shop["product_id"]) == before + 1


async def test_returnable_shrinks_after_a_return(client, pos_tenant, shop):
    detail = (await client.get(f"/pos/sales/{shop['sale']['id']}")).json()
    item = detail["returnable"][0]
    await client.post(f"/pos/sales/{shop['sale']['id']}/returns",
                      json={"items": [{"sale_item_id": item["sale_item_id"], "qty": 2}]})

    after = (await client.get(f"/pos/sales/{shop['sale']['id']}")).json()["returnable"][0]
    assert after["qty_returned"] == 2
    assert after["qty_returnable"] == 1


async def test_cannot_return_more_than_was_sold(client, pos_tenant, shop):
    detail = (await client.get(f"/pos/sales/{shop['sale']['id']}")).json()
    item = detail["returnable"][0]
    r = await client.post(f"/pos/sales/{shop['sale']['id']}/returns",
                          json={"items": [{"sale_item_id": item["sale_item_id"], "qty": 4}]})
    assert r.status_code == 409


async def test_cannot_return_more_than_sold_across_visits(client, pos_tenant, shop):
    """The one that actually loses money: two separate returns summing past the sale."""
    detail = (await client.get(f"/pos/sales/{shop['sale']['id']}")).json()
    item = detail["returnable"][0]
    body = {"items": [{"sale_item_id": item["sale_item_id"], "qty": 2}]}

    assert (await client.post(f"/pos/sales/{shop['sale']['id']}/returns", json=body)).status_code == 201
    # 2 + 2 > 3 — the second visit must be refused.
    assert (await client.post(f"/pos/sales/{shop['sale']['id']}/returns", json=body)).status_code == 409


async def test_damaged_goods_come_back_without_restocking(client, pos_tenant, shop):
    before = await _stock(client, shop["product_id"])
    detail = (await client.get(f"/pos/sales/{shop['sale']['id']}")).json()
    item = detail["returnable"][0]

    r = await client.post(f"/pos/sales/{shop['sale']['id']}/returns", json={
        "items": [{"sale_item_id": item["sale_item_id"], "qty": 1}],
        "reason": "Damaged", "restock": False,
    })
    assert r.json()["refund_minor"] == 10_000          # customer still gets paid
    assert await _stock(client, shop["product_id"]) == before   # but it isn't resold


async def test_returning_an_item_from_another_sale_is_rejected(client, pos_tenant, shop):
    r = await client.post(f"/pos/sales/{shop['sale']['id']}/returns", json={
        "items": [{"sale_item_id": "00000000-0000-0000-0000-000000000000", "qty": 1}],
    })
    assert r.status_code == 404


async def test_zero_quantity_is_rejected(client, pos_tenant, shop):
    detail = (await client.get(f"/pos/sales/{shop['sale']['id']}")).json()
    item = detail["returnable"][0]
    r = await client.post(f"/pos/sales/{shop['sale']['id']}/returns",
                          json={"items": [{"sale_item_id": item["sale_item_id"], "qty": 0}]})
    assert r.status_code == 422


async def test_unknown_sale_is_404(client, pos_tenant):
    r = await client.post("/pos/sales/00000000-0000-0000-0000-000000000000/returns",
                          json={"items": [{"sale_item_id": "00000000-0000-0000-0000-000000000000", "qty": 1}]})
    assert r.status_code == 404
