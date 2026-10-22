"""Offline till sync (3D, migration 0081, D-20 to D-23).

A till that sold offline sends its outbox as a batch to POST /pos/sync/orders
with its device token. Each order goes through the same ingest as an online
sale and gets its own answer: created, duplicate (same client_uuid, same
cart) or conflict (same client_uuid, different cart). A sale the customer
already paid for is never refused: a price mismatch, a closed session, clock
skew, underpayment or negative stock records it with needs_review for a
manager. The till keeps its catalogue fresh from a row_version delta feed."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

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
async def till(client, pos_tenant):
    reg = next(r for r in (await client.get("/pos/registers")).json() if r["is_default"])
    dev = (await client.post("/pos/devices", json={"register_id": reg["id"], "device_code": "T1"})).json()
    p = (await client.post("/pos/products", json={"name": "Offline item " + uuid.uuid4().hex[:5],
                                                  "price_minor": 10_000, "stock_qty": 50})).json()
    return {"register": reg, "device": dev, "product": p, "headers": {"X-Device-Token": dev["token"]}}


_seq = iter(range(1, 10**6))


def _order(till, qty=1, total=None, created_at=None, **extra):
    n = next(_seq)
    return {"client_uuid": str(uuid.uuid4()), "offline_ref": f"R1-T1-{n:06d}",
            "created_at": (created_at or datetime.now(timezone.utc)).isoformat(),
            "items": [{"product_id": till["product"]["id"], "qty": qty}],
            "payment_method": "card", "client_total_minor": 10_000 * qty if total is None else total, **extra}


async def _sync(client, till, orders, headers=None):
    return await client.post("/pos/sync/orders", json={"device_id": till["device"]["id"], "orders": orders},
                             headers=till["headers"] if headers is None else headers)


async def test_a_batch_is_created_once_and_replays_as_duplicates(client, till):
    orders = [_order(till), _order(till, qty=2)]
    r = await _sync(client, till, orders)
    assert r.status_code == 200, r.text
    first = r.json()["results"]
    assert [x["status"] for x in first] == ["created", "created"]
    assert [x["receipt_no"] for x in first] == [o["offline_ref"] for o in orders]
    assert not any(x["needs_review"] for x in first)

    again = (await _sync(client, till, orders)).json()["results"]
    assert [x["status"] for x in again] == ["duplicate", "duplicate"]
    assert [x["sale_id"] for x in again] == [x["sale_id"] for x in first]

    changed = {**orders[0], "items": [{"product_id": till["product"]["id"], "qty": 5}], "client_total_minor": 50_000}
    assert (await _sync(client, till, [changed])).json()["results"][0]["status"] == "conflict"

    sale = (await client.get(f"/pos/sales/{first[1]['sale_id']}")).json()
    assert sale["total_minor"] == 20_000 and sale["receipt_no"] == orders[1]["offline_ref"]


async def test_sync_needs_the_devices_own_token(client, till):
    assert (await _sync(client, till, [_order(till)], headers={})).status_code == 401
    assert (await _sync(client, till, [_order(till)], headers={"X-Device-Token": "x" * 40})).status_code == 401


async def test_a_paid_sale_is_never_refused_only_flagged(client, till):
    await client.patch(f"/pos/products/{till['product']['id']}", json={"stock_qty": 1})
    future = datetime.now(timezone.utc) + timedelta(days=2)
    cases = {
        "price_mismatch": _order(till, total=9_000),
        "oversold": _order(till, qty=3),
        "underpaid": _order(till, payment_method="cash", paid_minor=5_000),
        "clock_skew": _order(till, created_at=future),
    }
    results = (await _sync(client, till, list(cases.values()))).json()["results"]
    for (reason, _), res in zip(cases.items(), results):
        assert res["status"] == "created", (reason, res)
        assert res["needs_review"] and reason in res["reasons"], (reason, res)
    stock = next(p for p in (await client.get("/pos/products")).json() if p["id"] == till["product"]["id"])
    assert stock["stock_qty"] < 0   # oversold offline is recorded, not blocked (M10)


async def test_a_sale_from_a_session_closed_since_is_late_synced(client, till):
    s = (await client.post("/pos/sessions", json={"register_id": till["register"]["id"]})).json()
    sold_at = datetime.now(timezone.utc)
    closed = await client.post(f"/pos/sessions/{s['id']}/close", json={"counted": {"cash": 0}})
    assert closed.status_code == 200, closed.text
    res = (await _sync(client, till, [_order(till, created_at=sold_at)])).json()["results"][0]
    assert res["status"] == "created" and "session_closed" in res["reasons"]
    z = (await client.get(f"/pos/sessions/{s['id']}/z-report")).json()
    assert [x["sale_id"] for x in z["late_synced"]] == [res["sale_id"]]


async def test_managers_review_flagged_sales(client, till):
    res = (await _sync(client, till, [_order(till, total=1)])).json()["results"][0]
    queue = (await client.get("/pos/review")).json()
    mine = next(x for x in queue if x["sale_id"] == res["sale_id"])
    assert "price_mismatch" in mine["reasons"] and mine["client_total_minor"] == 1
    r = await client.post(f"/pos/review/{res['sale_id']}/resolve", json={"note": "Old price on the shelf"})
    assert r.status_code == 200, r.text
    assert all(x["sale_id"] != res["sale_id"] for x in (await client.get("/pos/review")).json())

    clerk_role = await _role(client, [{"permission_key": "pos.sale.create", "scope": "all"}])
    clerk, _, _ = await _user_on(client, [clerk_role])
    try:
        assert (await clerk.get("/pos/review")).status_code == 403
    finally:
        await clerk.aclose()


async def test_a_batch_is_at_most_100_orders(client, till):
    assert (await _sync(client, till, [_order(till) for _ in range(101)])).status_code == 422


async def test_the_catalogue_delta_feed_sends_only_what_changed(client, till):
    full = (await client.get("/pos/catalog/delta?since=0")).json()
    assert any(p["id"] == till["product"]["id"] for p in full["products"])
    cursor = full["next"]
    assert (await client.get(f"/pos/catalog/delta?since={cursor}")).json()["products"] == []

    await client.patch(f"/pos/products/{till['product']['id']}", json={"price_minor": 12_000})
    delta = (await client.get(f"/pos/catalog/delta?since={cursor}")).json()
    assert [(p["id"], p["price_minor"]) for p in delta["products"]] == [(till["product"]["id"], 12_000)]
    assert delta["next"] > cursor

    assert (await client.patch(f"/pos/products/{till['product']['id']}", json={"active": False})).status_code == 200
    gone = (await client.get(f"/pos/catalog/delta?since={delta['next']}")).json()["products"]
    assert gone and gone[0]["active"] is False   # archived products reach the till as inactive


async def test_the_device_heartbeat_reports_its_outbox(client, till):
    stale = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
    r = await client.post(f"/pos/devices/{till['device']['id']}/heartbeat",
                          json={"outbox_count": 4, "oldest_pending_at": stale}, headers=till["headers"])
    assert r.status_code == 200 and r.json()["outbox_count"] == 4
    rows = await _owner("select outbox_count from pos_devices where id = $1", uuid.UUID(till["device"]["id"]))
    assert rows[0]["outbox_count"] == 4


async def test_another_tenants_device_or_product_never_syncs(client, till):
    """Tenant A's session can't use tenant B's device (its token doesn't
    match here) or sell B's product (unknown here: a conflict)."""
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    from ..conftest import _drop, _signup
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as other:
        other_tenant = await _signup(other, ["pos"])
        try:
            reg = next(r for r in (await other.get("/pos/registers")).json() if r["is_default"])
            dev = (await other.post("/pos/devices", json={"register_id": reg["id"], "device_code": "T9"})).json()
            theirs = (await other.post("/pos/products", json={"name": "Theirs", "price_minor": 100})).json()
            r = await client.post("/pos/sync/orders", json={"device_id": dev["id"], "orders": [_order(till)]},
                                  headers={"X-Device-Token": dev["token"]})
            assert r.status_code == 401
            foreign = {**_order(till), "items": [{"product_id": theirs["id"], "qty": 1}]}
            res = (await _sync(client, till, [foreign])).json()["results"][0]
            assert res["status"] == "conflict" and res["sale_id"] is None
        finally:
            await _drop(other_tenant)
