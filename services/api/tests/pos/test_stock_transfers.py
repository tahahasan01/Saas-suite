"""Stock transfers between branches or warehouses (wave B, study 06 §6.6,
D-88, 0092).

One document: a draft lists what moves from one branch to another;
dispatching takes it out of the sender (it is then in transit); receiving
puts what actually arrived into the receiver, and a shortfall is recorded
as the transfer's variance. Staff at either end can see it.
"""
from __future__ import annotations

import uuid

import asyncpg

from app.config import settings

from ..core.test_rbac_v2 import _role, _user_on


async def _owner(sql: str, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _branch(tenant_id: str, name: str) -> str:
    rows = await _owner("insert into branches (tenant_id, code, name) values ($1, $2, $3) returning id",
                        uuid.UUID(tenant_id), "B" + uuid.uuid4().hex[:4].upper(), name)
    return str(rows[0]["id"])


async def _product(client, stock: float) -> dict:
    r = await client.post("/pos/products", json={"name": f"Flour {uuid.uuid4().hex[:5]}", "price_minor": 30_000,
                                                  "stock_qty": stock, "track_stock": True})
    assert r.status_code == 201, r.text
    return r.json()


async def _levels(client, product_id: str) -> dict[str, float]:
    return {x["branch_id"]: x["qty"] for x in (await client.get("/pos/stock", params={"product_id": product_id})).json()}


async def test_a_transfer_is_dispatched_then_received(client, pos_tenant):
    warehouse = (await client.get("/org/branches")).json()[0]["id"]     # the main branch holds the stock
    shop = await _branch(pos_tenant.tenant_id, "Gulberg shop")
    p = await _product(client, stock=50)

    r = await client.post("/pos/transfers", json={"from_branch_id": warehouse, "to_branch_id": shop,
                                                  "lines": [{"product_id": p["id"], "qty": 20}], "note": "Weekly"})
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["status"] == "draft" and t["number"].startswith("TR-") and t["lines"][0]["qty_sent"] == 20
    assert await _levels(client, p["id"]) == {warehouse: 50}            # a draft moves nothing

    r = await client.post(f"/pos/transfers/{t['id']}/dispatch")
    assert r.status_code == 200 and r.json()["status"] == "dispatched"
    assert await _levels(client, p["id"]) == {warehouse: 30}            # 20 in transit
    assert (await client.post(f"/pos/transfers/{t['id']}/dispatch")).status_code == 409

    line = t["lines"][0]["id"]
    r = await client.post(f"/pos/transfers/{t['id']}/receive", json={"lines": [{"line_id": line, "qty_received": 18}]})
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["status"] == "received" and got["lines"][0]["qty_received"] == 18 and got["lines"][0]["variance"] == 2
    assert await _levels(client, p["id"]) == {warehouse: 30, shop: 18}
    total = next(x for x in (await client.get("/pos/products")).json() if x["id"] == p["id"])["stock_qty"]
    assert total == 48                                                   # 2 lost on the way
    reasons = [m["reason"] for m in (await client.get("/pos/stock/moves", params={"product_id": p["id"]})).json()]
    assert {"transfer_out", "transfer_in"} <= set(reasons)


async def test_receiving_without_quantities_takes_everything_sent(client, pos_tenant):
    warehouse = (await client.get("/org/branches")).json()[0]["id"]
    shop = await _branch(pos_tenant.tenant_id, "DHA shop")
    p = await _product(client, stock=10)
    t = (await client.post("/pos/transfers", json={"from_branch_id": warehouse, "to_branch_id": shop,
                                                   "lines": [{"product_id": p["id"], "qty": 4}]})).json()
    await client.post(f"/pos/transfers/{t['id']}/dispatch")
    r = await client.post(f"/pos/transfers/{t['id']}/receive", json={})
    assert r.status_code == 200 and r.json()["lines"][0]["variance"] == 0
    assert await _levels(client, p["id"]) == {warehouse: 6, shop: 4}


async def test_a_transfer_needs_the_stock_and_two_different_branches(client, pos_tenant):
    warehouse = (await client.get("/org/branches")).json()[0]["id"]
    shop = await _branch(pos_tenant.tenant_id, "Saddar shop")
    p = await _product(client, stock=3)
    same = await client.post("/pos/transfers", json={"from_branch_id": warehouse, "to_branch_id": warehouse,
                                                     "lines": [{"product_id": p["id"], "qty": 1}]})
    assert same.status_code == 422
    t = (await client.post("/pos/transfers", json={"from_branch_id": warehouse, "to_branch_id": shop,
                                                   "lines": [{"product_id": p["id"], "qty": 5}]})).json()
    r = await client.post(f"/pos/transfers/{t['id']}/dispatch")
    assert r.status_code == 409 and "Not enough stock" in r.text
    assert (await client.get(f"/pos/transfers/{t['id']}")).json()["status"] == "draft"   # nothing half-sent
    r = await client.post(f"/pos/transfers/{t['id']}/cancel")
    assert r.status_code == 200 and r.json()["status"] == "cancelled"


async def test_the_receiving_branch_sees_it_and_receiving_needs_its_key(client, pos_tenant):
    warehouse = (await client.get("/org/branches")).json()[0]["id"]
    shop = await _branch(pos_tenant.tenant_id, "Johar Town shop")
    p = await _product(client, stock=10)
    t = (await client.post("/pos/transfers", json={"from_branch_id": warehouse, "to_branch_id": shop,
                                                   "lines": [{"product_id": p["id"], "qty": 2}]})).json()
    await client.post(f"/pos/transfers/{t['id']}/dispatch")

    reader = await _role(client, [{"permission_key": "products.product.read", "scope": "all"}])
    receiver = await _role(client, [{"permission_key": "products.product.read", "scope": "all"},
                                    {"permission_key": "products.transfer.receive", "scope": "all"}])
    viewer, vid, _ = await _user_on(client, [reader])
    clerk, cid, _ = await _user_on(client, [receiver])
    try:
        for uid in (vid, cid):                                          # both work at the shop only
            await _owner("delete from user_branches where user_id = $1", uuid.UUID(uid))
            await _owner("insert into user_branches (tenant_id, user_id, branch_id, is_home) values ($1, $2, $3, true)",
                         uuid.UUID(pos_tenant.tenant_id), uuid.UUID(uid), uuid.UUID(shop))
        assert t["id"] in [x["id"] for x in (await viewer.get("/pos/transfers")).json()]
        assert (await viewer.post(f"/pos/transfers/{t['id']}/receive", json={})).status_code == 403
        assert (await clerk.post(f"/pos/transfers/{t['id']}/dispatch")).status_code == 403
        assert (await clerk.post(f"/pos/transfers/{t['id']}/receive", json={})).status_code == 200
    finally:
        await viewer.aclose()
        await clerk.aclose()
