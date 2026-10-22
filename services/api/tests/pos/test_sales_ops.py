"""Sales operations (3C, migration 0078, St01 P0/P1, D-06, D-27): receipt
numbers per register, history and search, reprints stamped DUPLICATE, a
permissioned void through the debit-note path, line discounts and price
overrides with approval, and held bills."""
from __future__ import annotations

import uuid

import pytest_asyncio

from ..core.test_rbac_v2 import _role, _user_on


@pytest_asyncio.fixture
async def item(client, pos_tenant):
    r = await client.post("/pos/products", json={"name": "Ops item " + uuid.uuid4().hex[:5],
                                                 "price_minor": 10_000, "stock_qty": 100})
    return r.json()["id"]


async def _sale(client, item, qty=1, **extra):
    r = await client.post("/pos/sales", json={"items": [{"product_id": item, "qty": qty}],
                                              "payment_method": "card", **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def _stock(client, item):
    return next(p for p in (await client.get("/pos/products?include_archived=true")).json() if p["id"] == item)["stock_qty"]


# ── Receipt numbers ─────────────────────────────────────────────────────────
async def test_receipt_numbers_run_gap_free_per_register(client, pos_tenant, item):
    a = await _sale(client, item)
    b = await _sale(client, item)
    assert a["receipt_no"].startswith("R1-") and a["receipt_no"].endswith("000001")
    assert b["receipt_no"].endswith("000002")
    r2 = (await client.post("/pos/registers", json={"code": "R2", "name": "Counter 2"})).json()
    c = await _sale(client, item, register_id=r2["id"])
    assert c["receipt_no"].startswith("R2-") and c["receipt_no"].endswith("000001")
    # A refused sale takes no number.
    bad = await client.post("/pos/sales", json={"items": [{"product_id": item, "qty": 1}], "payment_method": "cash",
                                                "paid_minor": 1})
    assert bad.status_code == 422
    assert (await _sale(client, item))["receipt_no"].endswith("000003")


# ── History and search ──────────────────────────────────────────────────────
async def test_history_searches_by_receipt_number_and_method(client, pos_tenant, item):
    a = await _sale(client, item)
    await _sale(client, item, payment_method="cash", paid_minor=10_000)
    found = (await client.get(f"/pos/sales?q={a['receipt_no']}")).json()
    assert [s["id"] for s in found] == [a["id"]]
    cash = (await client.get("/pos/sales?method=cash")).json()
    assert cash and all(s["payment_method"] == "cash" for s in cash)


async def test_a_cashier_on_own_scope_sees_only_their_sales(client, pos_tenant, item):
    own = await _role(client, [{"permission_key": k, "scope": s} for k, s in
                               (("pos.sale.read", "own"), ("pos.sale.create", "all"))])
    cashier, _, _ = await _user_on(client, [own])
    try:
        mine = (await cashier.post("/pos/sales", json={"items": [{"product_id": item, "qty": 1}],
                                                       "payment_method": "card"})).json()
        theirs = await _sale(client, item)
        ids = {s["id"] for s in (await cashier.get("/pos/sales")).json()}
        assert mine["id"] in ids and theirs["id"] not in ids
        assert (await cashier.post(f"/pos/sales/{theirs['id']}/print")).status_code == 404
    finally:
        await cashier.aclose()


# ── Reprint ─────────────────────────────────────────────────────────────────
async def test_the_first_print_is_the_original_and_later_ones_say_duplicate(client, pos_tenant, item):
    s = await _sale(client, item)
    first = (await client.post(f"/pos/sales/{s['id']}/print")).json()
    second = (await client.post(f"/pos/sales/{s['id']}/print")).json()
    assert first["copy"] == 1 and first["duplicate"] is False
    assert second["copy"] == 2 and second["duplicate"] is True
    assert second["receipt_no"] == s["receipt_no"]


# ── Void ────────────────────────────────────────────────────────────────────
async def test_a_void_needs_its_key_and_reverses_the_whole_sale(client, pos_tenant, item):
    before = await _stock(client, item)
    s = await _sale(client, item, qty=3)
    cashier_role = await _role(client, [{"permission_key": k, "scope": "all"}
                                        for k in ("pos.sale.read", "pos.sale.create", "pos.sale.refund")])
    cashier, _, _ = await _user_on(client, [cashier_role])
    try:
        assert (await cashier.post(f"/pos/sales/{s['id']}/void", json={"reason": "Wrong items"})).status_code == 403
    finally:
        await cashier.aclose()
    r = await client.post(f"/pos/sales/{s['id']}/void", json={"reason": "Wrong items"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "void" and r.json()["void_reason"] == "Wrong items"
    assert await _stock(client, item) == before
    detail = (await client.get(f"/pos/sales/{s['id']}")).json()
    assert all(line["qty_returnable"] == 0 for line in detail["returnable"])
    assert (await client.post(f"/pos/sales/{s['id']}/void", json={"reason": "again"})).status_code == 409


# ── Line discounts and price overrides ──────────────────────────────────────
async def test_a_line_discount_and_an_override_are_priced_and_recorded(client, pos_tenant, item):
    r = await client.post("/pos/sales", json={"payment_method": "card", "items": [
        {"product_id": item, "qty": 2, "discount_pct": 10},
        {"product_id": item, "qty": 1, "price_minor": 8_000}]})
    assert r.status_code == 201, r.text
    sale = r.json()
    assert sale["total_minor"] == 2 * 10_000 - 2_000 + 8_000
    lines = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"]
    assert sorted(line["paid_minor"] for line in lines) == [8_000, 18_000]


async def test_a_cashier_without_the_keys_needs_a_managers_pin(client, pos_tenant, item):
    me = (await client.get("/auth/me")).json()["user"]["id"]
    await client.put("/pos/pin", json={"pin": "246813"})
    cashier_role = await _role(client, [{"permission_key": k, "scope": "all"}
                                        for k in ("pos.sale.read", "pos.sale.create", "products.product.read")])
    cashier, _, _ = await _user_on(client, [cashier_role])
    try:
        body = {"payment_method": "card", "items": [{"product_id": item, "qty": 1, "price_minor": 5_000}]}
        r = await cashier.post("/pos/sales", json=body)
        assert r.status_code == 403 and "approve" in r.json()["detail"].lower()
        r = await cashier.post("/pos/sales", json={**body, "approver_id": me, "approver_pin": "246813"})
        assert r.status_code == 201, r.text
        assert r.json()["total_minor"] == 5_000
    finally:
        await cashier.aclose()


async def test_a_discount_cannot_exceed_the_line(client, pos_tenant, item):
    r = await client.post("/pos/sales", json={"payment_method": "card", "items": [
        {"product_id": item, "qty": 1, "discount_minor": 20_000}]})
    assert r.status_code == 422


# ── Held bills ──────────────────────────────────────────────────────────────
async def test_a_bill_can_be_held_and_resumed_once(client, pos_tenant, item):
    r = await client.post("/pos/held", json={"label": "Table 4", "cart": {"items": [{"product_id": item, "qty": 2}]}})
    assert r.status_code == 201, r.text
    held = r.json()
    assert [h["label"] for h in (await client.get("/pos/held")).json()] == ["Table 4"]
    resumed = await client.post(f"/pos/held/{held['id']}/resume")
    assert resumed.status_code == 200 and resumed.json()["cart"]["items"][0]["qty"] == 2
    assert (await client.post(f"/pos/held/{held['id']}/resume")).status_code == 404
    assert (await client.get("/pos/held")).json() == []


async def test_a_whole_cart_discount_needs_the_same_approval(client, pos_tenant, item):
    me = (await client.get("/auth/me")).json()["user"]["id"]
    await client.put("/pos/pin", json={"pin": "246813"})
    cashier_role = await _role(client, [{"permission_key": k, "scope": "all"}
                                        for k in ("pos.sale.read", "pos.sale.create", "products.product.read")])
    cashier, _, _ = await _user_on(client, [cashier_role])
    try:
        body = {"payment_method": "card", "discount_minor": 1_000, "items": [{"product_id": item, "qty": 1}]}
        assert (await cashier.post("/pos/sales", json=body)).status_code == 403
        r = await cashier.post("/pos/sales", json={**body, "approver_id": me, "approver_pin": "246813"})
        assert r.status_code == 201 and r.json()["total_minor"] == 9_000
    finally:
        await cashier.aclose()
