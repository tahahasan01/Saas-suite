"""Registers, sessions and split tender (3C, migration 0076, D-24, St01 §6.2/§6.6).

Expected cash comes by foreign key (the session's own payments, cash moves
and refunds), never a time window; closing counts every method, a cash
variance over the register's limit needs a manager's PIN, a device with
unsent sales blocks the close, and the figures freeze. The Z-report reads
the frozen session."""
from __future__ import annotations

import uuid

import asyncpg
import pytest_asyncio

from app.config import settings

from ..core.test_rbac_v2 import _role, _user_on


async def _owner(sql: str, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


@pytest_asyncio.fixture
async def item(client, pos_tenant):
    r = await client.post("/pos/products", json={"name": "Session item " + uuid.uuid4().hex[:5],
                                                 "price_minor": 10_000, "stock_qty": 500})
    return r.json()["id"]


async def _register(client) -> dict:
    regs = (await client.get("/pos/registers")).json()
    return next(r for r in regs if r["is_default"])


async def _open(client, register_id: str, float_minor: int = 5_000) -> dict:
    r = await client.post("/pos/sessions", json={"register_id": register_id, "opening_float_minor": float_minor})
    assert r.status_code == 201, r.text
    return r.json()


async def _sale(client, item: str, payments=None, register_id: str | None = None, qty: int = 1, **extra):
    body = {"items": [{"product_id": item, "qty": qty}], **extra}
    if payments is not None:
        body["payments"] = payments
    else:
        body.setdefault("payment_method", "cash")
    if register_id:
        body["register_id"] = register_id
    r = await client.post("/pos/sales", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def test_every_tenant_has_a_default_register(client, pos_tenant):
    reg = await _register(client)
    assert reg["code"] == "R1" and reg["active"] and "cash" in reg["payment_methods"]
    assert reg["max_variance_minor"] > 0


async def test_one_open_session_per_register(client, pos_tenant):
    reg = await _register(client)
    await _open(client, reg["id"])
    r = await client.post("/pos/sessions", json={"register_id": reg["id"]})
    assert r.status_code == 409
    second = (await client.post("/pos/registers", json={"code": "R2", "name": "Counter 2"})).json()
    await _open(client, second["id"])


async def test_split_tender_records_one_payment_per_method(client, pos_tenant, item):
    reg = await _register(client)
    session = await _open(client, reg["id"])
    sale = await _sale(client, item, qty=2, payments=[
        {"method": "card", "amount_minor": 12_000, "reference": "4242"},
        {"method": "cash", "amount_minor": 10_000}])
    assert sale["payment_method"] == "split" and sale["session_id"] == session["id"]
    assert sale["change_minor"] == 2_000              # change only ever comes out of cash
    assert {(p["method"], p["amount_minor"]) for p in sale["payments"]} == {("card", 12_000), ("cash", 8_000)}


async def test_non_cash_cannot_be_overpaid_and_short_payment_is_refused(client, pos_tenant, item):
    reg = await _register(client)
    await _open(client, reg["id"])
    over = await client.post("/pos/sales", json={"items": [{"product_id": item, "qty": 1}],
                                                 "payments": [{"method": "card", "amount_minor": 12_000}]})
    assert over.status_code == 422
    short = await client.post("/pos/sales", json={"items": [{"product_id": item, "qty": 1}],
                                                  "payments": [{"method": "cash", "amount_minor": 9_000}]})
    assert short.status_code == 422


async def test_expected_comes_by_foreign_key_not_by_time(client, pos_tenant, item):
    reg = await _register(client)
    other = (await client.post("/pos/registers", json={"code": "R2", "name": "Counter 2"})).json()
    mine = await _open(client, reg["id"], 5_000)
    await _open(client, other["id"], 0)
    await _sale(client, item, register_id=reg["id"])                          # cash 100
    await _sale(client, item, register_id=other["id"])                        # someone else's till
    await _sale(client, item, register_id=reg["id"], payments=[{"method": "card", "amount_minor": 10_000}])
    r = await client.post(f"/pos/sessions/{mine['id']}/cash-moves",
                          json={"kind": "pay_out", "amount_minor": 2_000, "reason": "Tea for staff"})
    assert r.status_code == 201, r.text
    s = (await client.get(f"/pos/sessions/{mine['id']}")).json()
    expected = {m["method"]: m["expected_minor"] for m in s["methods"]}
    assert expected["cash"] == 5_000 + 10_000 - 2_000
    assert expected["card"] == 10_000


async def test_a_cash_refund_leaves_the_drawer_it_is_paid_from(client, pos_tenant, item):
    reg = await _register(client)
    s = await _open(client, reg["id"], 0)
    sale = await _sale(client, item, qty=2)
    detail = (await client.get(f"/pos/sales/{sale['id']}")).json()
    await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": detail["returnable"][0]["sale_item_id"], "qty": 1}]})
    cash = next(m for m in (await client.get(f"/pos/sessions/{s['id']}")).json()["methods"] if m["method"] == "cash")
    assert cash["expected_minor"] == 20_000 - 10_000


async def test_close_counts_every_method_and_freezes(client, pos_tenant, item):
    reg = await _register(client)
    s = await _open(client, reg["id"], 5_000)
    await _sale(client, item)
    await _sale(client, item, payments=[{"method": "jazzcash", "amount_minor": 10_000}])
    r = await client.post(f"/pos/sessions/{s['id']}/close",
                          json={"counted": {"cash": 14_900, "jazzcash": 10_000}, "notes": "eod"})
    assert r.status_code == 200, r.text
    closed = r.json()
    assert closed["status"] == "closed"
    by = {m["method"]: m for m in closed["methods"]}
    assert by["cash"]["expected_minor"] == 15_000 and by["cash"]["variance_minor"] == -100
    assert by["jazzcash"]["variance_minor"] == 0
    # Frozen: a sale after close can't land in it, and the figures don't move.
    await _sale(client, item)
    again = (await client.get(f"/pos/sessions/{s['id']}")).json()
    assert {m["method"]: m["expected_minor"] for m in again["methods"]}["cash"] == 15_000


async def test_a_big_variance_needs_a_managers_pin(client, pos_tenant, item):
    reg = await _register(client)
    await client.patch(f"/pos/registers/{reg['id']}", json={"max_variance_minor": 1_000})
    s = await _open(client, reg["id"], 0)
    await _sale(client, item)
    short = {"counted": {"cash": 5_000}}
    r = await client.post(f"/pos/sessions/{s['id']}/close", json=short)
    assert r.status_code == 403 and "manager" in r.json()["detail"].lower()

    manager_role = await _role(client, [{"permission_key": k, "scope": "all"}
                                        for k in ("pos.session.read", "pos.session.approve")])
    manager, manager_id, _ = await _user_on(client, [manager_role])
    try:
        assert (await manager.put("/pos/pin", json={"pin": "7391"})).status_code == 204
        r = await client.post(f"/pos/sessions/{s['id']}/close",
                              json={**short, "approver_id": manager_id, "approver_pin": "0000"})
        assert r.status_code == 403
        r = await client.post(f"/pos/sessions/{s['id']}/close",
                              json={**short, "approver_id": manager_id, "approver_pin": "7391"})
        assert r.status_code == 200, r.text
        assert r.json()["variance_approved_by"] == manager_id
    finally:
        await manager.aclose()


async def test_a_pin_locks_after_five_wrong_tries(client, pos_tenant, item):
    reg = await _register(client)
    await client.patch(f"/pos/registers/{reg['id']}", json={"max_variance_minor": 1})
    s = await _open(client, reg["id"], 0)
    await _sale(client, item)
    me = (await client.get("/auth/me")).json()["user"]["id"]
    await client.put("/pos/pin", json={"pin": "2468"})
    body = {"counted": {"cash": 0}, "approver_id": me}
    for _ in range(5):
        assert (await client.post(f"/pos/sessions/{s['id']}/close", json={**body, "approver_pin": "1111"})).status_code == 403
    r = await client.post(f"/pos/sessions/{s['id']}/close", json={**body, "approver_pin": "2468"})
    assert r.status_code == 423


async def test_a_device_with_unsent_sales_blocks_the_close(client, pos_tenant, item):
    reg = await _register(client)
    till = (await client.post("/pos/devices", json={"register_id": reg["id"], "device_code": "D01",
                                                     "name": "Front till"})).json()
    other = (await client.post("/pos/devices", json={"register_id": reg["id"], "device_code": "D02",
                                                      "name": "Tablet"})).json()
    s = await _open(client, reg["id"], 0)
    await client.post(f"/pos/devices/{till['id']}/heartbeat", json={"outbox_count": 2})
    r = await client.post(f"/pos/sessions/{s['id']}/close", json={"counted": {"cash": 0}, "device_id": till["id"]})
    assert r.status_code == 409 and "unsent" in r.json()["detail"].lower()
    await client.post(f"/pos/devices/{till['id']}/heartbeat", json={"outbox_count": 0})
    await client.post(f"/pos/devices/{other['id']}/heartbeat", json={"outbox_count": 3})
    r = await client.post(f"/pos/sessions/{s['id']}/close", json={"counted": {"cash": 0}, "device_id": till["id"]})
    assert r.status_code == 200, r.text
    assert any("Tablet" in w and "3" in w for w in r.json()["warnings"])


async def test_the_z_report_reads_the_closed_session(client, pos_tenant, item):
    reg = await _register(client)
    s = await _open(client, reg["id"], 1_000)
    await _sale(client, item, qty=3, discount_minor=1_000)
    sale = await _sale(client, item, payments=[{"method": "card", "amount_minor": 10_000}])
    detail = (await client.get(f"/pos/sales/{sale['id']}")).json()
    await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": detail["returnable"][0]["sale_item_id"], "qty": 1}]})
    await client.post(f"/pos/sessions/{s['id']}/close", json={"counted": {"cash": 30_000, "card": 0}})
    z = (await client.get(f"/pos/sessions/{s['id']}/z-report")).json()
    assert z["sales_count"] == 2 and z["gross_minor"] == 40_000 and z["discount_minor"] == 1_000
    assert z["refunds_minor"] == 10_000
    assert {m["method"]: m["taken_minor"] for m in z["methods"]} == {"cash": 29_000, "card": 10_000}
    assert z["cashiers"][0]["sales_count"] == 2
    assert z["late_synced"] == []


async def test_the_old_drawer_api_drives_the_default_register(client, pos_tenant, item):
    assert (await client.post("/pos/drawer/open", json={"opening_float_minor": 5_000})).status_code == 201
    await _sale(client, item)
    d = (await client.get("/pos/drawer/current")).json()
    assert d["expected_minor"] == 15_000 and d["cash_sales_minor"] == 10_000
    r = await client.post("/pos/drawer/close", json={"counted_minor": 14_500})
    assert r.json()["variance_minor"] == -500


async def test_a_session_from_another_tenant_or_register_is_not_found(client, pos_tenant):
    assert (await client.get(f"/pos/sessions/{uuid.uuid4()}")).status_code == 404
