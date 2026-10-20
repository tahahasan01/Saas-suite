"""A sale is recorded once, however many times the till sends it (D-20, D-81).

The till generates `client_uuid` when the cart opens. A double-tap on Charge,
a retry after a timeout, or a request that reaches the server after the till
gave up (observed in Odoo at runtime, studies/07 O-7) must all land on the
same sale — never a second one, and never a second stock deduction.
"""
from __future__ import annotations

import asyncio
import uuid

import asyncpg
import pytest
import pytest_asyncio

from app import fbr_submit
from app.config import settings


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


# ── With FBR on: one sale and one outbox row however the till repeats (1E, QA-P03) ──
@pytest_asyncio.fixture
async def fbr_shop(client, pos_tenant, fake_fbr):
    for p in (await client.get("/pos/products")).json():
        await client.patch(f"/pos/products/{p['id']}", json={"hs_code": "0101.2100"})
    (await client.put("/fbr/settings", json={
        "seller_ntn_cnic": "1234567", "seller_business_name": "Fixture Traders",
        "seller_province": "Punjab", "seller_address": "1 Mall Road, Lahore",
        "token": "sandbox-token", "enabled": True})).raise_for_status()
    p = (await client.get("/pos/products")).json()[0]
    await client.patch(f"/pos/products/{p['id']}", json={"price_minor": 10_000, "stock_qty": 50})
    return {"tenant_id": pos_tenant.tenant_id, "product_id": p["id"]}


async def _counts(tenant_id: str) -> tuple[int, int]:
    """(sales, FBR outbox rows) for the tenant."""
    owner = await asyncpg.connect(settings.database_url)
    try:
        tid = uuid.UUID(tenant_id)
        return (await owner.fetchval("select count(*) from pos_sales where tenant_id=$1", tid),
                await owner.fetchval(
                    "select count(*) from outbox where tenant_id=$1 and kind='fbr.submit_sale'", tid))
    finally:
        await owner.close()


async def test_pressing_charge_twice_files_one_sale(client, fbr_shop, fake_fbr):
    """Double F7: the second press arrives after the first was answered."""
    key = str(uuid.uuid4())
    first = await client.post("/pos/sales", json=_sale(fbr_shop["product_id"], key))
    again = await client.post("/pos/sales", json=_sale(fbr_shop["product_id"], key))
    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()["fbr_invoice_number"] == first.json()["fbr_invoice_number"] == "FBR-1"
    assert await _counts(fbr_shop["tenant_id"]) == (1, 1)
    assert len(fake_fbr.payloads) == 1


async def test_a_double_click_files_one_sale(client, fbr_shop, fake_fbr):
    """Double click: the copies arrive together."""
    key = str(uuid.uuid4())
    responses = await asyncio.gather(
        *(client.post("/pos/sales", json=_sale(fbr_shop["product_id"], key)) for _ in range(4)))
    assert sorted(r.status_code for r in responses) == [200, 200, 200, 201]
    assert await _counts(fbr_shop["tenant_id"]) == (1, 1)
    assert len(fake_fbr.payloads) == 1


async def test_a_retry_after_a_lost_response_files_one_sale(client, fbr_shop, fake_fbr, monkeypatch):
    """Network retry: the sale committed but the till never got the answer
    (here the request blows up after commit), so it sends the cart again."""
    async def boom(outbox_id):
        raise RuntimeError("connection dropped before the response")
    real = fbr_submit.deliver_now
    monkeypatch.setattr(fbr_submit, "deliver_now", boom)
    key = str(uuid.uuid4())
    with pytest.raises(RuntimeError):
        await client.post("/pos/sales", json=_sale(fbr_shop["product_id"], key))
    # Not monkeypatch.undo(): that would also unpatch the fake FBR.
    monkeypatch.setattr(fbr_submit, "deliver_now", real)

    retry = await client.post("/pos/sales", json=_sale(fbr_shop["product_id"], key))
    assert retry.status_code == 200
    assert await _counts(fbr_shop["tenant_id"]) == (1, 1)
    await fbr_submit.process_outbox()           # the worker files the queued sale, once
    assert len(fake_fbr.payloads) == 1
