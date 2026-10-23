"""Stock per branch or warehouse (wave B, study 06 gaps 23/25, 0091).

Each product has a quantity per branch (a warehouse is a branch without
tills). Every move happens at one branch: a sale or return at the sale's
branch, a receipt at the order's branch, an adjustment where it's made. A
branch can't sell what it doesn't hold, whatever the others have.
pos_products.stock_qty stays the company total; a registered till's
catalogue shows its own branch.
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


async def _second_branch(client, tenant_id: str) -> tuple[str, str]:
    """A second shop with its own till: (branch id, register id)."""
    rows = await _owner("insert into branches (tenant_id, code, name) values ($1, $2, 'Gulberg shop') returning id",
                        uuid.UUID(tenant_id), "G" + uuid.uuid4().hex[:4].upper())
    branch = str(rows[0]["id"])
    r = await client.post("/pos/registers", json={"code": "G" + uuid.uuid4().hex[:3].upper(), "name": "Gulberg till"},
                          headers=_at(branch))
    assert r.status_code == 201, r.text
    return branch, r.json()["id"]


async def _product(client, stock: float = 10) -> dict:
    r = await client.post("/pos/products", json={"name": f"Rice {uuid.uuid4().hex[:5]}", "price_minor": 50_000,
                                                  "stock_qty": stock, "track_stock": True})
    assert r.status_code == 201, r.text
    return r.json()


def _at(branch: str) -> dict:
    return {"X-Branch-Ids": branch}


async def _levels(client, product_id: str, **kw) -> dict[str, float]:
    r = await client.get("/pos/stock", params={"product_id": product_id}, **kw)
    assert r.status_code == 200, r.text
    return {x["branch_id"]: x["qty"] for x in r.json()}


async def _sell(client, product_id: str, qty: float, register_id: str | None = None, **kw):
    return await client.post("/pos/sales", json={"items": [{"product_id": product_id, "qty": qty}],
                                                 "payment_method": "cash", "paid_minor": 10_000_000,
                                                 "register_id": register_id}, **kw)


async def test_opening_stock_is_held_at_the_main_branch(client, pos_tenant):
    main = (await client.get("/org/branches")).json()[0]["id"]
    p = await _product(client, stock=10)
    assert await _levels(client, p["id"]) == {main: 10}


async def test_a_branch_sells_only_what_it_holds(client, pos_tenant):
    main = (await client.get("/org/branches")).json()[0]["id"]
    gulberg, till = await _second_branch(client, pos_tenant.tenant_id)
    p = await _product(client, stock=10)

    r = await _sell(client, p["id"], 1, till, headers=_at(gulberg))
    assert r.status_code == 409 and "Gulberg shop" in r.text        # main has 10, Gulberg has none

    r = await client.post("/pos/stock/adjustments", json={"product_id": p["id"], "qty_delta": 5, "reason": "count"},
                          headers=_at(gulberg))
    assert r.status_code == 201, r.text
    assert (await _sell(client, p["id"], 2, till, headers=_at(gulberg))).status_code == 201
    assert await _levels(client, p["id"]) == {main: 10, gulberg: 3}
    total = next(x for x in (await client.get("/pos/products")).json() if x["id"] == p["id"])["stock_qty"]
    assert total == 13                                               # the company total


async def test_a_return_goes_back_to_the_branch_that_sold(client, pos_tenant):
    gulberg, till = await _second_branch(client, pos_tenant.tenant_id)
    p = await _product(client, stock=0)
    await client.post("/pos/stock/adjustments", json={"product_id": p["id"], "qty_delta": 4, "reason": "count"},
                      headers=_at(gulberg))
    sale = (await _sell(client, p["id"], 3, till, headers=_at(gulberg))).json()
    detail = (await client.get(f"/pos/sales/{sale['id']}")).json()
    line = detail["returnable"][0]["sale_item_id"]
    r = await client.post(f"/pos/sales/{sale['id']}/returns",
                          json={"items": [{"sale_item_id": line, "qty": 2}], "reason": "changed mind", "restock": True})
    assert r.status_code == 201, r.text
    assert await _levels(client, p["id"]) == {gulberg: 3}         # main never held any


async def test_the_till_catalogue_shows_its_own_branch(client, pos_tenant):
    gulberg, till = await _second_branch(client, pos_tenant.tenant_id)
    p = await _product(client, stock=10)
    await client.post("/pos/stock/adjustments", json={"product_id": p["id"], "qty_delta": 2, "reason": "count"},
                      headers=_at(gulberg))
    delta = (await client.get("/pos/catalog/delta", params={"register_id": till}, headers=_at(gulberg))).json()
    assert next(x for x in delta["products"] if x["id"] == p["id"])["stock_qty"] == 2


async def test_staff_see_only_their_branches_stock(client, pos_tenant):
    main = (await client.get("/org/branches")).json()[0]["id"]
    gulberg, till = await _second_branch(client, pos_tenant.tenant_id)
    p = await _product(client, stock=10)
    await client.post("/pos/stock/adjustments", json={"product_id": p["id"], "qty_delta": 2, "reason": "count"},
                      headers=_at(gulberg))
    rid = await _role(client, [{"permission_key": "products.product.read", "scope": "all"}])
    clerk, uid, _ = await _user_on(client, [rid])
    try:
        # No API assigns branches yet (P33); set it as the branch tests do.
        await _owner("delete from user_branches where user_id = $1", uuid.UUID(uid))
        await _owner("insert into user_branches (tenant_id, user_id, branch_id, is_home) values ($1, $2, $3, true)",
                     uuid.UUID(pos_tenant.tenant_id), uuid.UUID(uid), uuid.UUID(gulberg))
        assert await _levels(clerk, p["id"]) == {gulberg: 2}
    finally:
        await clerk.aclose()
    assert main in await _levels(client, p["id"])


async def test_a_sale_belongs_to_its_tills_branch(client, pos_tenant):
    """The web till sends no branch header: the register decides the branch,
    so a sale on the Gulberg till takes Gulberg's stock, not the main shop's."""
    main = (await client.get("/org/branches")).json()[0]["id"]
    gulberg, till = await _second_branch(client, pos_tenant.tenant_id)
    p = await _product(client, stock=10)
    await client.post("/pos/stock/adjustments", json={"product_id": p["id"], "qty_delta": 5, "reason": "count"},
                      headers=_at(gulberg))
    sale = await _sell(client, p["id"], 2, till)                     # no X-Branch-Ids
    assert sale.status_code == 201, sale.text
    assert await _levels(client, p["id"]) == {main: 10, gulberg: 3}
    branch = await _owner("select branch_id from pos_sales where id = $1", uuid.UUID(sale.json()["id"]))
    assert str(branch[0]["branch_id"]) == gulberg


async def test_a_branch_limited_user_cannot_move_another_branchs_stock(client, pos_tenant):
    """Security review: the adjustment's branch_id must be one the caller
    works in. catalog.move refuses it (404) and the levels' branch policy
    would refuse the write anyway; nothing is written."""
    main = (await client.get("/org/branches")).json()[0]["id"]
    gulberg, _ = await _second_branch(client, pos_tenant.tenant_id)
    p = await _product(client, stock=10)
    rid = await _role(client, [{"permission_key": "products.product.read", "scope": "all"},
                               {"permission_key": "products.stock.adjust", "scope": "all"}])
    clerk, uid, _ = await _user_on(client, [rid])
    try:
        await _owner("delete from user_branches where user_id = $1", uuid.UUID(uid))
        await _owner("insert into user_branches (tenant_id, user_id, branch_id, is_home) values ($1, $2, $3, true)",
                     uuid.UUID(pos_tenant.tenant_id), uuid.UUID(uid), uuid.UUID(gulberg))
        r = await clerk.post("/pos/stock/adjustments", json={"product_id": p["id"], "qty_delta": -5,
                                                             "reason": "damage", "branch_id": main})
        assert r.status_code == 404
        # Counts and transfers can't reach it either.
        assert (await clerk.post("/pos/counts", json={"branch_id": main})).status_code in (403, 404)
    finally:
        await clerk.aclose()
    assert await _levels(client, p["id"]) == {main: 10}
