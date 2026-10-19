"""A sale is recorded once, however many times the till sends it (D-20, D-81).

The till generates `client_uuid` when the cart opens. A double-tap on Charge,
a retry after a timeout, or a request that reaches the server after the till
gave up (observed in Odoo at runtime, studies/07 O-7) must all land on the
same sale — never a second one, and never a second stock deduction.
"""
from __future__ import annotations

import asyncio
import uuid

import pytest_asyncio


@pytest_asyncio.fixture
async def shop(client, pos_tenant):
    p = (await client.get("/pos/products")).json()[0]
    await client.patch(f"/pos/products/{p['id']}", json={"price_minor": 10_000, "stock_qty": 50})
    return p["id"]


def _sale(product_id: str, client_uuid: str) -> dict:
    return {"client_uuid": client_uuid, "items": [{"product_id": product_id, "qty": 2}],
            "paid_minor": 20_000, "payment_method": "cash"}


async def _stock(client, product_id: str) -> float:
    return next(p for p in (await client.get("/pos/products")).json() if p["id"] == product_id)["stock_qty"]


async def test_resending_a_sale_returns_the_original(client, shop):
    key = str(uuid.uuid4())
    first = await client.post("/pos/sales", json=_sale(shop, key))
    again = await client.post("/pos/sales", json=_sale(shop, key))
    assert first.status_code == 201
    assert again.status_code == 200          # a replay, not a new sale
    assert again.json()["id"] == first.json()["id"]
    assert again.json()["total_minor"] == first.json()["total_minor"]
    assert await _stock(client, shop) == 48  # deducted once, not twice


async def test_simultaneous_duplicates_create_one_sale(client, shop):
    key = str(uuid.uuid4())
    responses = await asyncio.gather(*(client.post("/pos/sales", json=_sale(shop, key)) for _ in range(4)))
    assert sorted(r.status_code for r in responses) == [200, 200, 200, 201]
    assert len({r.json()["id"] for r in responses}) == 1
    assert await _stock(client, shop) == 48


async def test_different_carts_are_different_sales(client, shop):
    a = await client.post("/pos/sales", json=_sale(shop, str(uuid.uuid4())))
    b = await client.post("/pos/sales", json=_sale(shop, str(uuid.uuid4())))
    assert a.json()["id"] != b.json()["id"]
    assert await _stock(client, shop) == 46


async def test_reusing_a_cart_id_for_a_different_cart_is_refused(client, shop):
    """Security review of 25a74b4: if the first attempt was recorded but the
    till never heard back, and the cashier then changed the cart, a replay
    would hand back the old sale and the new items would go uncharged."""
    key = str(uuid.uuid4())
    first = await client.post("/pos/sales", json=_sale(shop, key))
    changed = {**_sale(shop, key), "items": [{"product_id": shop, "qty": 3}], "paid_minor": 30_000}
    r = await client.post("/pos/sales", json=changed)
    assert first.status_code == 201
    assert r.status_code == 409
    assert await _stock(client, shop) == 48  # the changed cart was not recorded
