"""Purchase orders — the inbound side of stock.

The invariants: stock rises only through receiving, partial deliveries stay
reconciled per line, and you cannot receive more than you ordered.
"""
from __future__ import annotations

import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def po(client, pos_tenant):
    """An open order for 10 units of the first sample product at Rs 80 cost."""
    p = (await client.get("/pos/products")).json()[0]
    await client.patch(f"/pos/products/{p['id']}", json={"stock_qty": 5})
    r = await client.post("/pos/purchase-orders", json={
        "items": [{"product_id": p["id"], "qty": 10, "cost_minor": 8_000}],
        "notes": "weekly restock",
    })
    r.raise_for_status()
    return {"po": r.json(), "product_id": p["id"]}


async def _stock(client, product_id):
    return next(p for p in (await client.get("/pos/products")).json()
                if p["id"] == product_id)["stock_qty"]


async def test_po_is_created_ordered_with_a_real_total(client, pos_tenant, po):
    assert po["po"]["status"] == "ordered"
    assert po["po"]["total_cost_minor"] == 80_000     # 10 × Rs 80
    assert po["po"]["items"][0]["received_qty"] == 0


async def test_partial_receipt_raises_stock_and_stays_open(client, pos_tenant, po):
    line = po["po"]["items"][0]
    r = await client.post(f"/pos/purchase-orders/{po['po']['id']}/receive",
                          json={"items": [{"po_item_id": line["id"], "qty": 4}]})
    body = r.json()
    assert body["status"] == "ordered"                # 6 still outstanding
    assert body["items"][0]["received_qty"] == 4
    assert await _stock(client, po["product_id"]) == 5 + 4


async def test_full_receipt_completes_the_order(client, pos_tenant, po):
    line = po["po"]["items"][0]
    await client.post(f"/pos/purchase-orders/{po['po']['id']}/receive",
                      json={"items": [{"po_item_id": line["id"], "qty": 4}]})
    r = await client.post(f"/pos/purchase-orders/{po['po']['id']}/receive",
                          json={"items": [{"po_item_id": line["id"], "qty": 6}]})
    assert r.json()["status"] == "received"
    assert r.json()["received_at"] is not None
    assert await _stock(client, po["product_id"]) == 15


async def test_over_receiving_is_refused(client, pos_tenant, po):
    line = po["po"]["items"][0]
    r = await client.post(f"/pos/purchase-orders/{po['po']['id']}/receive",
                          json={"items": [{"po_item_id": line["id"], "qty": 11}]})
    assert r.status_code == 409
    assert "outstanding" in r.json()["detail"]
    assert await _stock(client, po["product_id"]) == 5   # nothing moved


async def test_receiving_updates_last_cost(client, pos_tenant, po):
    line = po["po"]["items"][0]
    await client.post(f"/pos/purchase-orders/{po['po']['id']}/receive",
                      json={"items": [{"po_item_id": line["id"], "qty": 10}]})
    p = next(p for p in (await client.get("/pos/products")).json() if p["id"] == po["product_id"])
    assert p["cost_minor"] == 8_000


async def test_cancel_only_before_anything_arrives(client, pos_tenant, po):
    line = po["po"]["items"][0]
    await client.post(f"/pos/purchase-orders/{po['po']['id']}/receive",
                      json={"items": [{"po_item_id": line["id"], "qty": 1}]})
    r = await client.post(f"/pos/purchase-orders/{po['po']['id']}/cancel")
    assert r.status_code == 409


async def test_untouched_order_can_be_cancelled(client, pos_tenant, po):
    r = await client.post(f"/pos/purchase-orders/{po['po']['id']}/cancel")
    assert r.json()["status"] == "cancelled"
    # And a cancelled order can't be received against.
    line = po["po"]["items"][0]
    r2 = await client.post(f"/pos/purchase-orders/{po['po']['id']}/receive",
                           json={"items": [{"po_item_id": line["id"], "qty": 1}]})
    assert r2.status_code == 409


async def test_suppliers_round_trip(client, pos_tenant):
    r = await client.post("/pos/suppliers", json={"name": "Karachi Wholesale", "phone": "021-1234567"})
    assert r.status_code == 201
    listed = (await client.get("/pos/suppliers")).json()
    assert [s["name"] for s in listed] == ["Karachi Wholesale"]
