"""Table service set-up (wave B, P22/P23, study 11, 0089).

Restaurants turn on the `restaurant` module (off by default, on top of POS).
They set up floors with numbered tables, and kitchen stations (kitchen,
BBQ, drinks) that say which product categories they prepare: that routing
sends each item's kitchen ticket to the right station in the next slice.
"""
from __future__ import annotations

import uuid

from ..core.test_rbac_v2 import _role, _user_on


async def _enable(client) -> None:
    r = await client.post("/platform/modules/restaurant/enable")
    assert r.status_code == 200, r.text


async def _category(client, name: str) -> str:
    r = await client.post("/pos/categories", json={"name": f"{name} {uuid.uuid4().hex[:4]}"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_table_service_is_off_until_the_restaurant_turns_it_on(client, pos_tenant):
    assert (await client.get("/restaurant/floors")).status_code == 403
    await _enable(client)
    r = await client.get("/restaurant/floors")
    assert r.status_code == 200 and r.json() == []


async def test_a_floor_gets_numbered_tables(client, pos_tenant):
    await _enable(client)
    r = await client.post("/restaurant/floors", json={"name": "Ground floor"})
    assert r.status_code == 201, r.text
    floor = r.json()
    assert floor["name"] == "Ground floor" and floor["tables"] == [] and floor["branch_id"]

    r = await client.post(f"/restaurant/floors/{floor['id']}/tables",
                          json={"labels": ["1", "2", "3", "Family 1"], "seats": 4})
    assert r.status_code == 201, r.text
    assert [t["label"] for t in r.json()] == ["1", "2", "3", "Family 1"]
    # A table number is used once per floor; the error names it.
    r = await client.post(f"/restaurant/floors/{floor['id']}/tables", json={"labels": ["4", "2"]})
    assert r.status_code == 409 and "2" in r.json()["detail"]

    floors = (await client.get("/restaurant/floors")).json()
    tables = floors[0]["tables"]
    assert [t["label"] for t in tables] == ["1", "2", "3", "Family 1"]      # nothing half-added
    family = next(t for t in tables if t["label"] == "Family 1")
    r = await client.patch(f"/restaurant/tables/{family['id']}", json={"seats": 8})
    assert r.status_code == 200 and r.json()["seats"] == 8
    r = await client.patch(f"/restaurant/tables/{family['id']}", json={"active": False})
    assert r.status_code == 200 and r.json()["active"] is False

    r = await client.patch(f"/restaurant/floors/{floor['id']}", json={"name": "Hall"})
    assert r.status_code == 200 and r.json()["name"] == "Hall"
    assert (await client.post("/restaurant/floors", json={"name": "hall"})).status_code == 409


async def test_stations_say_which_categories_they_prepare(client, pos_tenant):
    await _enable(client)
    bbq, curries, drinks = (await _category(client, "BBQ"), await _category(client, "Curries"),
                            await _category(client, "Drinks"))
    r = await client.post("/restaurant/stations", json={"name": "Kitchen", "category_ids": [bbq, curries]})
    assert r.status_code == 201, r.text
    kitchen = r.json()
    assert {c["id"] for c in kitchen["categories"]} == {bbq, curries}
    bar = (await client.post("/restaurant/stations", json={"name": "Drinks counter",
                                                            "category_ids": [drinks]})).json()
    assert [c["id"] for c in bar["categories"]] == [drinks]

    # Moving BBQ to its own station replaces the kitchen's list.
    r = await client.patch(f"/restaurant/stations/{kitchen['id']}", json={"category_ids": [curries]})
    assert r.status_code == 200 and [c["id"] for c in r.json()["categories"]] == [curries]
    assert (await client.post("/restaurant/stations", json={"name": "kitchen"})).status_code == 409

    stations = {s["name"]: s for s in (await client.get("/restaurant/stations")).json()}
    assert set(stations) == {"Kitchen", "Drinks counter"}


async def test_a_station_only_takes_this_companys_categories(client, pos_tenant):
    await _enable(client)
    r = await client.post("/restaurant/stations", json={"name": "Kitchen", "category_ids": [str(uuid.uuid4())]})
    assert r.status_code == 404


async def test_waiters_see_the_set_up_but_only_managers_change_it(client, pos_tenant):
    await _enable(client)
    floor = (await client.post("/restaurant/floors", json={"name": "Ground"})).json()
    rid = await _role(client, [{"permission_key": "restaurant.order.read", "scope": "all"}])
    waiter, _, _ = await _user_on(client, [rid])
    try:
        assert (await waiter.get("/restaurant/floors")).status_code == 200
        assert (await waiter.get("/restaurant/stations")).status_code == 200
        assert (await waiter.post("/restaurant/floors", json={"name": "Roof"})).status_code == 403
        assert (await waiter.post(f"/restaurant/floors/{floor['id']}/tables",
                                  json={"labels": ["9"]})).status_code == 403
        assert (await waiter.post("/restaurant/stations", json={"name": "Grill"})).status_code == 403
    finally:
        await waiter.aclose()
