"""The touch tile screen (wave B, P42, 0090).

Categories and products get a tile colour from a fixed palette (readable in
light and dark), and products can be pinned to the till's favourites page.
A registered till gets the categories with their colours in every catalogue
delta, so category tiles work offline too.
"""
from __future__ import annotations

import uuid


async def _category(client, **extra) -> dict:
    r = await client.post("/pos/categories", json={"name": f"Drinks {uuid.uuid4().hex[:4]}", **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def _product(client) -> dict:
    return (await client.get("/pos/products")).json()[0]


async def test_a_category_has_a_tile_colour_from_the_palette(client, pos_tenant):
    cat = await _category(client, color="blue")
    assert cat["color"] == "blue"
    r = await client.patch(f"/pos/categories/{cat['id']}", json={"color": "red"})
    assert r.status_code == 200 and r.json()["color"] == "red"
    r = await client.patch(f"/pos/categories/{cat['id']}", json={"color": ""})     # back to no colour
    assert r.status_code == 200 and r.json()["color"] is None
    assert (await client.patch(f"/pos/categories/{cat['id']}", json={"color": "#ff0000"})).status_code == 422


async def test_a_product_takes_a_colour_and_a_place_on_favourites(client, pos_tenant):
    p = await _product(client)
    assert p["color"] is None and p["pinned"] is False
    r = await client.patch(f"/pos/products/{p['id']}", json={"color": "green", "pinned": True})
    assert r.status_code == 200, r.text
    assert r.json()["color"] == "green" and r.json()["pinned"] is True
    r = await client.patch(f"/pos/products/{p['id']}", json={"color": ""})
    assert r.status_code == 200 and r.json()["color"] is None and r.json()["pinned"] is True
    assert (await client.patch(f"/pos/products/{p['id']}", json={"color": "neon"})).status_code == 422


async def test_the_till_catalogue_carries_categories_colours_and_favourites(client, pos_tenant):
    cat = await _category(client, color="amber")
    p = await _product(client)
    await client.patch(f"/pos/products/{p['id']}", json={"category_id": cat["id"], "pinned": True, "color": "teal"})

    delta = (await client.get("/pos/catalog/delta")).json()
    cats = {c["id"]: c for c in delta["categories"]}
    assert cats[cat["id"]]["color"] == "amber" and cats[cat["id"]]["name"] == cat["name"]
    row = next(x for x in delta["products"] if x["id"] == p["id"])
    assert row["category_id"] == cat["id"] and row["pinned"] is True and row["color"] == "teal"

    # A colour change reaches a till that is already up to date: categories
    # come whole with every delta, they are few.
    await client.patch(f"/pos/categories/{cat['id']}", json={"color": "purple"})
    later = (await client.get(f"/pos/catalog/delta?since={delta['next']}")).json()
    assert {c["id"]: c["color"] for c in later["categories"]}[cat["id"]] == "purple"
