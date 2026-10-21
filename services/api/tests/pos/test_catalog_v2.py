"""Catalog v2 and stock (3C, migration 0075, St01 P1/P2, M10): categories,
cost behind its key, light variants, packaging barcodes, weight and price
barcodes, an append-only stock ledger and adjustments, and stock that can't
go negative unless the tenant allows it."""
from __future__ import annotations

import uuid

import asyncpg
import pytest

from app.config import settings

from ..core.test_rbac_v2 import _role, _user_on


def ean13(first12: str) -> str:
    """Append the EAN-13 check digit."""
    s = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(first12))
    return first12 + str((10 - s % 10) % 10)


async def _owner(sql: str, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _product(client, **body) -> dict:
    body.setdefault("name", "Item " + uuid.uuid4().hex[:6])
    body.setdefault("price_minor", 10_000)
    body.setdefault("stock_qty", 100)
    r = await client.post("/pos/products", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def _sell(client, product_id: str, qty: float = 1):
    return await client.post("/pos/sales", json={"items": [{"product_id": product_id, "qty": qty}],
                                                 "payment_method": "card"})


# ── Categories ───────────────────────────────────────────────────────────────
async def test_categories_are_records_and_a_name_finds_or_creates_one(client, pos_tenant):
    r = await client.post("/pos/categories", json={"name": "Beverages"})
    assert r.status_code == 201, r.text
    cat = r.json()
    p = await _product(client, category_id=cat["id"])
    assert p["category_id"] == cat["id"] and p["category"] == "Beverages"
    # The till's old free-text category lands on the same record.
    q = await _product(client, category="beverages")
    assert q["category_id"] == cat["id"]
    listed = (await client.get(f"/pos/products?category_id={cat['id']}")).json()
    assert {x["id"] for x in listed} == {p["id"], q["id"]}
    assert any(c["name"] == "Beverages" for c in (await client.get("/pos/categories")).json())


async def test_existing_text_categories_became_records(client, pos_tenant):
    """0075 turned every distinct text category into a category record."""
    products = (await client.get("/pos/products")).json()
    with_text = [p for p in products if p["category"]]
    assert with_text and all(p["category_id"] for p in with_text)


# ── Cost is guarded ──────────────────────────────────────────────────────────
async def test_cost_is_hidden_without_the_cost_key_and_cannot_be_written(client, pos_tenant):
    p = await _product(client, cost_minor=6_000)
    clerk_role = await _role(client, [{"permission_key": k, "scope": "all"} for k in
                                      ("products.product.read", "products.product.update")])
    clerk, _, _ = await _user_on(client, [clerk_role])
    try:
        seen = next(x for x in (await clerk.get("/pos/products")).json() if x["id"] == p["id"])
        assert seen["cost_minor"] is None
        r = await clerk.patch(f"/pos/products/{p['id']}", json={"cost_minor": 1})
        assert r.status_code == 403
    finally:
        await clerk.aclose()
    assert next(x for x in (await client.get("/pos/products")).json() if x["id"] == p["id"])["cost_minor"] == 6_000


# ── Variants ─────────────────────────────────────────────────────────────────
async def test_variants_share_a_group_and_list_together(client, pos_tenant):
    shirt_s = await _product(client, name="Kurta S", attributes={"Size": "S"})
    shirt_m = await _product(client, name="Kurta M", attributes={"Size": "M"}, group_id=shirt_s["id"])
    assert shirt_m["group_id"] == shirt_s["id"] and shirt_m["attributes"] == {"Size": "M"}
    group = (await client.get(f"/pos/products/{shirt_m['id']}/variants")).json()
    assert {v["id"] for v in group} == {shirt_s["id"], shirt_m["id"]}


# ── Barcodes ─────────────────────────────────────────────────────────────────
async def test_a_packaging_barcode_scans_its_multiple(client, pos_tenant):
    p = await _product(client, barcode="8964000000017")
    r = await client.post(f"/pos/products/{p['id']}/barcodes", json={"barcode": "18964000000014", "qty": 12,
                                                                    "label": "Carton of 12"})
    assert r.status_code == 201, r.text
    single = (await client.get("/pos/products/lookup?barcode=8964000000017")).json()
    carton = (await client.get("/pos/products/lookup?barcode=18964000000014")).json()
    assert single["id"] == carton["id"] == p["id"]
    assert single["scan_qty"] == 1 and carton["scan_qty"] == 12
    # One barcode, one product: a second product can't take it.
    other = await _product(client)
    r = await client.post(f"/pos/products/{other['id']}/barcodes", json={"barcode": "18964000000014", "qty": 6})
    assert r.status_code == 409


async def test_weight_and_price_barcodes_follow_the_tenants_rules(client, pos_tenant):
    rice = await _product(client, name="Basmati (loose)", sku="00123", unit="kg", price_minor=40_000)
    r = await client.post("/pos/barcode-rules", json={"prefix": "21", "kind": "weight", "value_decimals": 3})
    assert r.status_code == 201, r.text
    await client.post("/pos/barcode-rules", json={"prefix": "22", "kind": "price", "value_decimals": 2})
    by_weight = (await client.get(f"/pos/products/lookup?barcode={ean13('210012301250')}")).json()
    assert by_weight["id"] == rice["id"] and by_weight["scan_qty"] == 1.25
    by_price = (await client.get(f"/pos/products/lookup?barcode={ean13('220012302000')}")).json()
    assert by_price["id"] == rice["id"] and by_price["scan_qty"] == 0.05      # Rs 20 of Rs 400/kg
    bad = await client.get(f"/pos/products/lookup?barcode={ean13('219999901250')}")
    assert bad.status_code == 404


# ── Stock ────────────────────────────────────────────────────────────────────
async def test_an_adjustment_moves_stock_and_is_kept_in_the_ledger(client, pos_tenant):
    p = await _product(client, stock_qty=10)
    r = await client.post("/pos/stock/adjustments", json={"product_id": p["id"], "qty_delta": -3,
                                                          "reason": "damage", "note": "Dropped carton"})
    assert r.status_code == 201, r.text
    assert r.json()["stock_qty"] == 7
    moves = (await client.get(f"/pos/stock/moves?product_id={p['id']}")).json()
    assert [(m["reason"], m["qty_delta"]) for m in moves][:1] == [("damage", -3)]
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        conn = await asyncpg.connect(settings.app_database_url)
        try:
            await conn.execute("delete from pos_stock_moves")
        finally:
            await conn.close()


async def test_sales_returns_and_receipts_write_the_ledger(client, pos_tenant):
    p = await _product(client, stock_qty=10, price_minor=1_000)
    sale = (await _sell(client, p["id"], 2)).json()
    detail = (await client.get(f"/pos/sales/{sale['id']}")).json()
    await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": detail["returnable"][0]["sale_item_id"], "qty": 1}], "reason": "Wrong size"})
    reasons = [m["reason"] for m in (await client.get(f"/pos/stock/moves?product_id={p['id']}")).json()]
    assert reasons[:2] == ["return", "sale"]
    stock = next(x for x in (await client.get("/pos/products")).json() if x["id"] == p["id"])["stock_qty"]
    assert stock == 9


async def test_stock_cannot_go_negative_unless_the_tenant_allows_it(client, pos_tenant):
    p = await _product(client, stock_qty=1)
    r = await _sell(client, p["id"], 2)
    assert r.status_code == 409 and "stock" in r.json()["detail"].lower()
    r = await client.post("/pos/stock/adjustments", json={"product_id": p["id"], "qty_delta": -5, "reason": "count"})
    assert r.status_code == 409
    await _owner("update tenants set allow_negative_stock = true where id = $1", uuid.UUID(pos_tenant.tenant_id))
    assert (await _sell(client, p["id"], 2)).status_code == 201


async def test_a_service_does_not_track_stock(client, pos_tenant):
    haircut = await _product(client, name="Haircut", stock_qty=0, track_stock=False)
    assert (await _sell(client, haircut["id"], 3)).status_code == 201
    stock = next(x for x in (await client.get("/pos/products")).json() if x["id"] == haircut["id"])["stock_qty"]
    assert stock == 0
