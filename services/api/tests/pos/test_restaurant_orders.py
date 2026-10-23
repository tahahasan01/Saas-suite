"""Restaurant orders and kitchen tickets (wave B, P22/P23/P39/P40, study 11, 0094).

An order is dine-in at a table or takeaway with a token. Items are added,
then "send to kitchen" makes one ticket (KOT) per station, routed by the
item's category, with only what's new since the last send. Cancelling an
item already sent needs a reason and restaurant.order.void (or a manager's
PIN) and sends a VOID ticket to the same station. Nothing is paid yet: the
bill comes in the next slice.
"""
from __future__ import annotations

import uuid

from ..core.test_rbac_v2 import _role, _user_on


async def _setup(client) -> dict:
    """Table service on, a hall with tables 1–2, a kitchen making curries and
    a bar making drinks, and one product of each (plus an unrouted one)."""
    assert (await client.post("/platform/modules/restaurant/enable")).status_code == 200
    tag = uuid.uuid4().hex[:4]
    curries = (await client.post("/pos/categories", json={"name": f"Curries {tag}"})).json()
    drinks = (await client.post("/pos/categories", json={"name": f"Drinks {tag}"})).json()
    misc = (await client.post("/pos/categories", json={"name": f"Misc {tag}"})).json()
    floor = (await client.post("/restaurant/floors", json={"name": f"Hall {tag}"})).json()
    tables = (await client.post(f"/restaurant/floors/{floor['id']}/tables", json={"labels": ["1", "2"]})).json()
    kitchen = (await client.post("/restaurant/stations", json={"name": f"Kitchen {tag}",
                                                               "category_ids": [curries["id"]]})).json()
    bar = (await client.post("/restaurant/stations", json={"name": f"Bar {tag}", "category_ids": [drinks["id"]]})).json()

    async def product(name: str, cat: dict, price: int) -> dict:
        r = await client.post("/pos/products", json={"name": f"{name} {tag}", "price_minor": price,
                                                      "category_id": cat["id"], "track_stock": False})
        assert r.status_code == 201, r.text
        return r.json()
    return {"tables": tables, "kitchen": kitchen, "bar": bar,
            "karahi": await product("Chicken karahi", curries, 180_000),
            "lassi": await product("Lassi", drinks, 25_000),
            "napkins": await product("Napkins", misc, 1_000)}


async def _order(client, s: dict, table: int = 0) -> dict:
    r = await client.post("/restaurant/orders", json={"order_type": "dine_in", "table_id": s["tables"][table]["id"],
                                                      "guests": 4})
    assert r.status_code == 201, r.text
    return r.json()


async def _add(client, order: dict, product: dict, qty: float, note: str = "") -> dict:
    r = await client.post(f"/restaurant/orders/{order['id']}/lines",
                          json={"product_id": product["id"], "qty": qty, "note": note})
    assert r.status_code == 200, r.text
    return r.json()


async def test_a_dine_in_order_sends_one_ticket_per_station(client, pos_tenant):
    s = await _setup(client)
    order = await _order(client, s)
    assert order["status"] == "open" and order["table_label"] == "1" and order["guests"] == 4
    await _add(client, order, s["karahi"], 1, note="less spicy")
    o = await _add(client, order, s["lassi"], 2)
    assert o["total_minor"] == 230_000                     # 1 × 1,800 + 2 × 250, a running bill

    r = await client.post(f"/restaurant/orders/{order['id']}/send")
    assert r.status_code == 200, r.text
    kots = {k["station_name"]: k for k in r.json()["kots"]}
    assert set(kots) == {s["kitchen"]["name"], s["bar"]["name"]}
    kitchen = kots[s["kitchen"]["name"]]
    assert kitchen["kind"] == "order" and kitchen["table_label"] == "1" and kitchen["number"] >= 1
    assert [(x["name"], x["qty"], x["note"]) for x in kitchen["lines"]] == [(s["karahi"]["name"], 1, "less spicy")]
    # Nothing new: nothing to send.
    assert (await client.post(f"/restaurant/orders/{order['id']}/send")).status_code == 409


async def test_a_second_round_sends_only_whats_new(client, pos_tenant):
    s = await _setup(client)
    order = await _order(client, s)
    o = await _add(client, order, s["karahi"], 1)
    await client.post(f"/restaurant/orders/{order['id']}/send")
    line = o["lines"][0]["id"]
    # One more karahi on the same line, and a naan-less extra: only the extra goes.
    r = await client.patch(f"/restaurant/order-lines/{line}", json={"qty": 2})
    assert r.status_code == 200, r.text
    r = await client.post(f"/restaurant/orders/{order['id']}/send")
    new = [k for k in r.json()["kots"] if k["kind"] == "order"][-1]
    assert [(x["name"], x["qty"]) for x in new["lines"]] == [(s["karahi"]["name"], 1)]
    assert r.json()["lines"][0]["sent_qty"] == 2


async def test_an_item_no_station_makes_goes_to_the_counter_ticket(client, pos_tenant):
    s = await _setup(client)
    order = await _order(client, s)
    await _add(client, order, s["napkins"], 3)
    kots = (await client.post(f"/restaurant/orders/{order['id']}/send")).json()["kots"]
    assert [(k["station_name"], k["lines"][0]["qty"]) for k in kots] == [("Counter", 3)]


async def test_one_open_order_per_table_and_takeaway_tokens(client, pos_tenant):
    s = await _setup(client)
    await _order(client, s, 0)
    r = await client.post("/restaurant/orders", json={"order_type": "dine_in", "table_id": s["tables"][0]["id"]})
    assert r.status_code == 409 and "1" in r.json()["detail"]
    assert (await client.post("/restaurant/orders", json={"order_type": "dine_in"})).status_code == 422
    a = (await client.post("/restaurant/orders", json={"order_type": "takeaway"})).json()
    b = (await client.post("/restaurant/orders", json={"order_type": "takeaway"})).json()
    assert a["token"] >= 1 and b["token"] == a["token"] + 1 and a["table_id"] is None
    floors = (await client.get("/restaurant/floors")).json()
    t1 = next(t for f in floors for t in f["tables"] if t["id"] == s["tables"][0]["id"])
    t2 = next(t for f in floors for t in f["tables"] if t["id"] == s["tables"][1]["id"])
    assert t1["open_order"]["guests"] == 4 and t2["open_order"] is None


async def test_voiding_unsent_items_is_quiet_but_sent_ones_need_a_reason_and_rights(client, pos_tenant):
    s = await _setup(client)
    order = await _order(client, s)
    o = await _add(client, order, s["karahi"], 3)
    line = o["lines"][0]["id"]
    await client.post(f"/restaurant/orders/{order['id']}/send")                 # 3 sent
    await client.patch(f"/restaurant/order-lines/{line}", json={"qty": 4})      # 1 more, not sent

    # Lowering below what the kitchen has is a void, not an edit.
    assert (await client.patch(f"/restaurant/order-lines/{line}", json={"qty": 1})).status_code == 409

    await client.put("/pos/pin", json={"pin": "246813"})
    me = (await client.get("/auth/me")).json()["user"]["id"]
    rid = await _role(client, [{"permission_key": "restaurant.order.read", "scope": "all"},
                               {"permission_key": "restaurant.order.create", "scope": "all"}])
    waiter, _, _ = await _user_on(client, [rid])
    try:
        # The unsent one goes without fuss.
        r = await waiter.post(f"/restaurant/order-lines/{line}/void", json={"qty": 1})
        assert r.status_code == 200 and r.json()["lines"][0]["qty"] == 3
        # A sent one needs a reason, then a manager's PIN.
        assert (await waiter.post(f"/restaurant/order-lines/{line}/void", json={"qty": 1})).status_code == 422
        r = await waiter.post(f"/restaurant/order-lines/{line}/void", json={"qty": 1, "reason": "Customer changed mind"})
        assert r.status_code == 403
        r = await waiter.post(f"/restaurant/order-lines/{line}/void", json={
            "qty": 1, "reason": "Customer changed mind", "approver_id": me, "approver_pin": "246813"})
        assert r.status_code == 200, r.text
    finally:
        await waiter.aclose()
    got = r.json()
    assert got["lines"][0]["qty"] == 2 and got["lines"][0]["sent_qty"] == 2
    void = [k for k in got["kots"] if k["kind"] == "void"]
    assert len(void) == 1 and void[0]["station_name"] == s["kitchen"]["name"]
    assert void[0]["reason"] == "Customer changed mind" and void[0]["approved_by_name"]
    assert void[0]["lines"][0]["qty"] == 1


async def test_an_order_with_nothing_sent_can_be_cancelled(client, pos_tenant):
    s = await _setup(client)
    order = await _order(client, s)
    await _add(client, order, s["lassi"], 1)
    r = await client.post(f"/restaurant/orders/{order['id']}/cancel")
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    again = await _order(client, s)                          # the table is free again
    await _add(client, again, s["lassi"], 1)
    await client.post(f"/restaurant/orders/{again['id']}/send")
    assert (await client.post(f"/restaurant/orders/{again['id']}/cancel")).status_code == 409


async def test_taking_orders_needs_the_create_key(client, pos_tenant):
    s = await _setup(client)
    rid = await _role(client, [{"permission_key": "restaurant.order.read", "scope": "all"}])
    viewer, _, _ = await _user_on(client, [rid])
    try:
        assert (await viewer.get("/restaurant/orders")).status_code == 200
        r = await viewer.post("/restaurant/orders", json={"order_type": "dine_in", "table_id": s["tables"][1]["id"]})
        assert r.status_code == 403
    finally:
        await viewer.aclose()


async def test_a_waiter_sees_who_can_approve_a_void(client, pos_tenant):
    await _setup(client)
    await client.put("/pos/pin", json={"pin": "246813"})
    me = (await client.get("/auth/me")).json()["user"]
    rid = await _role(client, [{"permission_key": "restaurant.order.read", "scope": "all"},
                               {"permission_key": "restaurant.order.create", "scope": "all"}])
    waiter, _, _ = await _user_on(client, [rid])
    try:
        r = await waiter.get("/restaurant/approvers")
        assert r.status_code == 200 and me["id"] in [a["user_id"] for a in r.json()]
    finally:
        await waiter.aclose()
