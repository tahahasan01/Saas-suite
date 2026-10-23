"""Stock counts that don't clobber sales (wave B, study 06 §6.6, D-88, 0093).

A count is opened for a branch (optionally one category). Staff enter what
they find shelf by shelf; each line snapshots the system quantity at that
moment. Applying the count posts counted − snapshot as a 'count' move, so a
sale made between counting a shelf and applying the count still counts.
Entering numbers needs products.stock.count; applying needs
products.stock.adjust.
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


async def _product(client, stock: float, **extra) -> dict:
    r = await client.post("/pos/products", json={"name": f"Sugar {uuid.uuid4().hex[:5]}", "price_minor": 20_000,
                                                  "stock_qty": stock, "track_stock": True, **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def _level(client, product_id: str) -> float:
    rows = (await client.get("/pos/stock", params={"product_id": product_id})).json()
    return sum(x["qty"] for x in rows)


async def test_a_count_corrects_stock_without_undoing_sales(client, pos_tenant):
    p = await _product(client, stock=10)
    r = await client.post("/pos/counts", json={"note": "Month end"})
    assert r.status_code == 201, r.text
    count = r.json()
    assert count["status"] == "open" and count["branch_name"]

    r = await client.put(f"/pos/counts/{count['id']}/lines", json={"product_id": p["id"], "counted_qty": 9})
    assert r.status_code == 200, r.text
    line = next(x for x in r.json()["lines"] if x["product_id"] == p["id"])
    assert line["system_qty"] == 10 and line["counted_qty"] == 9 and line["difference"] == -1

    # Two sell after the shelf was counted, before the count is applied.
    sale = await client.post("/pos/sales", json={"items": [{"product_id": p["id"], "qty": 2}],
                                                 "payment_method": "cash", "paid_minor": 10_000_000})
    assert sale.status_code == 201, sale.text

    r = await client.post(f"/pos/counts/{count['id']}/apply")
    assert r.status_code == 200 and r.json()["status"] == "applied"
    assert await _level(client, p["id"]) == 7          # 10 − 2 sold − 1 missing, not 9
    assert (await client.post(f"/pos/counts/{count['id']}/apply")).status_code == 409
    moves = (await client.get("/pos/stock/moves", params={"product_id": p["id"]})).json()
    assert [m["qty_delta"] for m in moves if m["reason"] == "count"] == [-1]


async def test_a_count_lists_what_is_still_to_count_in_its_category(client, pos_tenant):
    cat = (await client.post("/pos/categories", json={"name": f"Spices {uuid.uuid4().hex[:4]}"})).json()
    a = await _product(client, stock=5, category_id=cat["id"])
    b = await _product(client, stock=3, category_id=cat["id"])
    other = await _product(client, stock=4)
    count = (await client.post("/pos/counts", json={"category_id": cat["id"]})).json()
    todo = {x["product_id"] for x in count["to_count"]}
    assert {a["id"], b["id"]} <= todo and other["id"] not in todo
    await client.put(f"/pos/counts/{count['id']}/lines", json={"product_id": a["id"], "counted_qty": 5})
    after = (await client.get(f"/pos/counts/{count['id']}")).json()
    assert a["id"] not in {x["product_id"] for x in after["to_count"]}
    # A product outside the count's category doesn't belong on it.
    r = await client.put(f"/pos/counts/{count['id']}/lines", json={"product_id": other["id"], "counted_qty": 1})
    assert r.status_code == 422


async def test_counters_enter_numbers_but_only_managers_apply(client, pos_tenant):
    p = await _product(client, stock=6)
    count = (await client.post("/pos/counts", json={})).json()
    rid = await _role(client, [{"permission_key": "products.product.read", "scope": "all"},
                               {"permission_key": "products.stock.count", "scope": "all"}])
    counter, _, _ = await _user_on(client, [rid])
    try:
        r = await counter.put(f"/pos/counts/{count['id']}/lines", json={"product_id": p["id"], "counted_qty": 4})
        assert r.status_code == 200, r.text
        assert (await counter.post(f"/pos/counts/{count['id']}/apply")).status_code == 403
        assert (await counter.post("/pos/counts", json={})).status_code == 403
    finally:
        await counter.aclose()
    r = await client.post(f"/pos/counts/{count['id']}/cancel")
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert await _level(client, p["id"]) == 6           # a cancelled count changes nothing


async def test_a_count_belongs_to_one_branch(client, pos_tenant):
    other = (await _owner("insert into branches (tenant_id, code, name) values ($1, $2, 'Other shop') returning id",
                          uuid.UUID(pos_tenant.tenant_id), "C" + uuid.uuid4().hex[:4].upper()))[0]["id"]
    count = (await client.post("/pos/counts", json={})).json()
    rid = await _role(client, [{"permission_key": "products.product.read", "scope": "all"},
                               {"permission_key": "products.stock.count", "scope": "all"}])
    there, uid, _ = await _user_on(client, [rid])
    try:
        await _owner("delete from user_branches where user_id = $1", uuid.UUID(uid))
        await _owner("insert into user_branches (tenant_id, user_id, branch_id, is_home) values ($1, $2, $3, true)",
                     uuid.UUID(pos_tenant.tenant_id), uuid.UUID(uid), other)
        assert (await there.get(f"/pos/counts/{count['id']}")).status_code == 404
        assert count["id"] not in [c["id"] for c in (await there.get("/pos/counts")).json()]
    finally:
        await there.aclose()
