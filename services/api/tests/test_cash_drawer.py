"""Cash drawer reconciliation.

The number that matters is the variance: counted minus expected, where expected
is opening float + cash sales − cash refunds. Card and wallet money never sits
in the drawer, so it must never appear in expected.
"""
from __future__ import annotations

import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def priced_product(client, pos_tenant):
    p = (await client.get("/pos/products")).json()[0]
    await client.patch(f"/pos/products/{p['id']}", json={"price_minor": 10_000, "stock_qty": 99})
    return p["id"]


async def _sell(client, product_id, method="cash", qty=1):
    r = await client.post("/pos/sales", json={
        "items": [{"product_id": product_id, "qty": qty}],
        "paid_minor": 10_000 * qty, "discount_minor": 0, "payment_method": method,
    })
    r.raise_for_status()
    return r.json()


async def test_cash_sales_raise_expected_and_card_sales_do_not(client, pos_tenant, priced_product):
    await client.post("/pos/drawer/open", json={"opening_float_minor": 5_000})

    await _sell(client, priced_product, "cash")
    await _sell(client, priced_product, "card")

    d = (await client.get("/pos/drawer/current")).json()
    assert d["cash_sales_minor"] == 10_000
    assert d["expected_minor"] == 5_000 + 10_000          # float + cash only
    methods = {m["payment_method"]: m["total_minor"] for m in d["sales_by_method"]}
    assert methods == {"cash": 10_000, "card": 10_000}    # both reported, one expected


async def test_cash_refund_leaves_the_drawer(client, pos_tenant, priced_product):
    await client.post("/pos/drawer/open", json={"opening_float_minor": 0})
    sale = await _sell(client, priced_product, "cash", qty=2)

    detail = (await client.get(f"/pos/sales/{sale['id']}")).json()
    await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": detail["returnable"][0]["sale_item_id"], "qty": 1}],
    })

    d = (await client.get("/pos/drawer/current")).json()
    assert d["cash_refunds_minor"] == 10_000
    assert d["expected_minor"] == 20_000 - 10_000


async def test_card_refund_does_not_touch_the_drawer(client, pos_tenant, priced_product):
    await client.post("/pos/drawer/open", json={"opening_float_minor": 0})
    sale = await _sell(client, priced_product, "card")

    detail = (await client.get(f"/pos/sales/{sale['id']}")).json()
    await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": detail["returnable"][0]["sale_item_id"], "qty": 1}],
    })

    d = (await client.get("/pos/drawer/current")).json()
    assert d["cash_refunds_minor"] == 0


async def test_close_reports_the_variance(client, pos_tenant, priced_product):
    await client.post("/pos/drawer/open", json={"opening_float_minor": 5_000})
    await _sell(client, priced_product, "cash")

    # Cashier counts Rs 145 against an expected Rs 150 — five rupees short.
    r = await client.post("/pos/drawer/close", json={"counted_minor": 14_500, "notes": "eod"})
    d = r.json()
    assert d["status"] == "closed"
    assert d["expected_minor"] == 15_000
    assert d["variance_minor"] == -500

    history = (await client.get("/pos/drawer/history")).json()
    assert history[0]["variance_minor"] == -500


async def test_only_one_drawer_can_be_open(client, pos_tenant):
    assert (await client.post("/pos/drawer/open", json={})).status_code == 201
    assert (await client.post("/pos/drawer/open", json={})).status_code == 409


async def test_closing_without_an_open_drawer_is_409(client, pos_tenant):
    r = await client.post("/pos/drawer/close", json={"counted_minor": 0})
    assert r.status_code == 409


async def test_no_open_drawer_is_a_404_not_an_error(client, pos_tenant):
    assert (await client.get("/pos/drawer/current")).status_code == 404
