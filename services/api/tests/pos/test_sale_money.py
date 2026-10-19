"""POS money correctness (audit P0-5): what the customer pays, what FBR is
told, and what a refund gives back must all come from the same numbers.

Prices are in minor units (paisa). FBR is faked by the shared `fake_fbr`.
"""
from __future__ import annotations

import asyncio
import uuid

import asyncpg
import pytest_asyncio

from app.config import settings

SELLER = {"seller_ntn_cnic": "1234567", "seller_business_name": "Fixture Traders",
          "seller_province": "Punjab", "seller_address": "1 Mall Road, Lahore",
          "token": "sandbox-token"}


async def _taxed_shop(client, *, inclusive: bool) -> list[str]:
    """Two products at Rs 100 and Rs 50, 18% GST, with HS codes; FBR on."""
    products = (await client.get("/pos/products")).json()
    for p in products:  # every active product must be fileable
        await client.patch(f"/pos/products/{p['id']}", json={"hs_code": "0101.2100"})
    a, b = products[0]["id"], products[1]["id"]
    await client.patch(f"/pos/products/{a}", json={"price_minor": 10_000, "tax_rate": 18, "stock_qty": 50})
    await client.patch(f"/pos/products/{b}", json={"price_minor": 5_000, "tax_rate": 18, "stock_qty": 50})
    r = await client.put("/fbr/settings", json={**SELLER, "prices_include_tax": inclusive, "enabled": True})
    r.raise_for_status()
    return [a, b]


@pytest_asyncio.fixture
async def exclusive_shop(client, pos_tenant, fake_fbr):
    return await _taxed_shop(client, inclusive=False)


@pytest_asyncio.fixture
async def inclusive_shop(client, pos_tenant, fake_fbr):
    return await _taxed_shop(client, inclusive=True)


def _cents(rupees: float) -> int:
    return round(rupees * 100)


async def test_exclusive_tax_is_added_to_what_the_customer_pays(client, exclusive_shop):
    a, _ = exclusive_shop
    r = await client.post("/pos/sales", json={"items": [{"product_id": a, "qty": 1}],
                                              "paid_minor": 11_800, "payment_method": "cash"})
    assert r.status_code == 201
    assert r.json()["total_minor"] == 11_800  # Rs 100 + 18% GST, not Rs 100


async def test_fbr_is_told_the_discount_and_the_tax_after_it(client, inclusive_shop, fake_fbr):
    a, b = inclusive_shop
    r = await client.post("/pos/sales", json={
        "items": [{"product_id": a, "qty": 1}, {"product_id": b, "qty": 2}],  # gross Rs 200
        "discount_minor": 2_000, "paid_minor": 18_000, "payment_method": "cash"})
    assert r.status_code == 201
    assert r.json()["total_minor"] == 18_000
    lines = fake_fbr.payloads[-1]["items"]
    # Every rupee of discount is reported, and FBR's totals equal what was collected.
    assert sum(_cents(l["discount"]) for l in lines) == 2_000
    assert sum(_cents(l["totalValues"]) for l in lines) == 18_000
    assert sum(_cents(l["valueSalesExcludingST"]) + _cents(l["salesTaxApplicable"])
               for l in lines) == 18_000


async def test_a_refund_returns_what_was_paid_not_the_list_price(client, inclusive_shop):
    a, _ = inclusive_shop
    sale = (await client.post("/pos/sales", json={
        "items": [{"product_id": a, "qty": 2}], "discount_minor": 2_000,
        "paid_minor": 18_000, "payment_method": "cash"})).json()
    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    r = await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": item["sale_item_id"], "qty": 1}]})
    assert r.status_code == 201
    assert r.json()["refund_minor"] == 9_000  # half of the Rs 180 paid, not Rs 100


async def test_returning_everything_in_parts_refunds_exactly_what_was_paid(client, inclusive_shop):
    a, _ = inclusive_shop
    sale = (await client.post("/pos/sales", json={
        "items": [{"product_id": a, "qty": 3}], "discount_minor": 1_000,  # Rs 290 paid
        "paid_minor": 29_000, "payment_method": "cash"})).json()
    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    refunds = []
    for _ in range(3):
        r = await client.post(f"/pos/sales/{sale['id']}/returns", json={
            "items": [{"sale_item_id": item["sale_item_id"], "qty": 1}]})
        refunds.append(r.json()["refund_minor"])
    assert sum(refunds) == 29_000  # no paisa lost or invented by rounding


async def test_two_returns_of_the_last_unit_cannot_both_succeed(client, inclusive_shop):
    """Deterministic race: two returns of the only unit start together; only one
    may be accepted."""
    a, _ = inclusive_shop
    sale = (await client.post("/pos/sales", json={
        "items": [{"product_id": a, "qty": 1}], "paid_minor": 10_000, "payment_method": "cash"})).json()
    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    body = {"items": [{"sale_item_id": item["sale_item_id"], "qty": 1}]}

    blocker = await asyncpg.connect(settings.database_url)
    try:
        tx = blocker.transaction()
        await tx.start()
        # Hold the product row: each return restocks it *after* its returnability
        # check, so both racers pass the check and then wait here. Only a lock
        # taken before the check (on the sale) can make the second one see the first.
        await blocker.execute("select 1 from pos_products where id = $1 for update", uuid.UUID(a))
        racers = [asyncio.create_task(client.post(f"/pos/sales/{sale['id']}/returns", json=body))
                  for _ in range(2)]
        await asyncio.sleep(0.5)
        await tx.commit()
        codes = sorted(r.status_code for r in await asyncio.gather(*racers))
    finally:
        await blocker.close()
    assert codes == [201, 409]


async def test_fbr_cannot_be_switched_on_while_products_lack_hs_codes(client, pos_tenant):
    """Every sale would be rejected by FBR (error 0052) and queue up forever."""
    r = await client.put("/fbr/settings", json={**SELLER, "enabled": True})
    assert r.status_code == 422
    assert "hs code" in r.json()["detail"].lower()


async def test_listing_one_line_twice_cannot_return_more_than_was_bought(client, inclusive_shop):
    """Security review of 5b70ba2: each entry was checked against the quantity
    returned *before* the request, so the same line twice slipped past it."""
    a, _ = inclusive_shop
    sale = (await client.post("/pos/sales", json={
        "items": [{"product_id": a, "qty": 1}], "paid_minor": 10_000, "payment_method": "cash"})).json()
    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    line = {"sale_item_id": item["sale_item_id"], "qty": 1}
    r = await client.post(f"/pos/sales/{sale['id']}/returns", json={"items": [line, line]})
    assert r.status_code == 422
    detail = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    assert detail["qty_returned"] == 0


async def test_a_short_payment_is_refused(client, exclusive_shop):
    a, _ = exclusive_shop
    r = await client.post("/pos/sales", json={"items": [{"product_id": a, "qty": 1}],
                                              "paid_minor": 10_000, "payment_method": "cash"})
    assert r.status_code == 422  # total is Rs 118 with GST; Rs 100 is short
    assert "short" in r.json()["detail"].lower()


async def test_zero_paid_means_the_exact_amount_was_tendered(client, exclusive_shop):
    a, _ = exclusive_shop
    r = await client.post("/pos/sales", json={"items": [{"product_id": a, "qty": 1}],
                                              "payment_method": "card"})
    assert r.status_code == 201
    assert (r.json()["paid_minor"], r.json()["change_minor"]) == (11_800, 0)


async def test_a_quote_prices_the_cart_without_recording_anything(client, exclusive_shop):
    """The till shows the server's own total (D-21) — exclusive tax included."""
    a, b = exclusive_shop
    before = (await client.get("/pos/summary")).json()["sales_today_count"]
    r = await client.post("/pos/sales/quote", json={
        "items": [{"product_id": a, "qty": 1}, {"product_id": b, "qty": 2}], "discount_minor": 2_000})
    assert r.status_code == 200
    q = r.json()
    assert (q["subtotal_minor"], q["discount_minor"]) == (20_000, 2_000)
    assert q["tax_minor"] == 3_240                # 18% of the Rs 180 after discount
    assert q["total_minor"] == 21_240
    assert (await client.get("/pos/summary")).json()["sales_today_count"] == before


# ── Cash rounding (tenants.cash_rounding_minor, default Rs 1) ────────────────
async def test_cash_is_rounded_to_the_rupee_and_fbr_still_sees_the_exact_amount(
        client, exclusive_shop, fake_fbr):
    a, _ = exclusive_shop  # Rs 100 + 18% = Rs 118.00 exactly — use Rs 80 lines for paisa
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute("update pos_products set price_minor = 8_000 where id = $1", uuid.UUID(a))
    finally:
        await owner.close()
    r = await client.post("/pos/sales", json={"items": [{"product_id": a, "qty": 1}],
                                              "paid_minor": 9_400, "payment_method": "cash"})
    assert r.status_code == 201                    # Rs 94.40 due, Rs 94 tendered in cash
    sale = r.json()
    assert (sale["total_minor"], sale["rounding_minor"], sale["amount_due_minor"]) == (9_440, -40, 9_400)
    assert sale["change_minor"] == 0
    assert sum(_cents(l["totalValues"]) for l in fake_fbr.payloads[-1]["items"]) == 9_440


async def test_half_a_rupee_rounds_up(client, exclusive_shop):
    a, _ = exclusive_shop
    owner = await asyncpg.connect(settings.database_url)
    try:  # Rs 80.93 + 18% GST (Rs 14.57) = Rs 95.50 exactly
        await owner.execute("update pos_products set price_minor = 8_093 where id = $1", uuid.UUID(a))
    finally:
        await owner.close()
    q = (await client.post("/pos/sales/quote", json={
        "items": [{"product_id": a, "qty": 1}], "payment_method": "cash"})).json()
    assert (q["total_minor"], q["amount_due_minor"], q["rounding_minor"]) == (9_550, 9_600, 50)


async def test_card_payments_are_never_rounded(client, exclusive_shop):
    a, _ = exclusive_shop
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute("update pos_products set price_minor = 8_000 where id = $1", uuid.UUID(a))
    finally:
        await owner.close()
    q = (await client.post("/pos/sales/quote", json={
        "items": [{"product_id": a, "qty": 1}], "payment_method": "card"})).json()
    assert (q["amount_due_minor"], q["rounding_minor"]) == (9_440, 0)


async def test_rounding_can_be_switched_off(client, exclusive_shop, pos_tenant):
    a, _ = exclusive_shop
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute("update pos_products set price_minor = 8_000 where id = $1", uuid.UUID(a))
        await owner.execute("update tenants set cash_rounding_minor = 0 where id = $1",
                            uuid.UUID(pos_tenant.tenant_id))
    finally:
        await owner.close()
    q = (await client.post("/pos/sales/quote", json={
        "items": [{"product_id": a, "qty": 1}], "payment_method": "cash"})).json()
    assert (q["amount_due_minor"], q["rounding_minor"]) == (9_440, 0)


async def test_refunds_never_exceed_the_rounded_cash_actually_paid(client, exclusive_shop):
    a, _ = exclusive_shop
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute("update pos_products set price_minor = 8_000 where id = $1", uuid.UUID(a))
    finally:
        await owner.close()
    sale = (await client.post("/pos/sales", json={"items": [{"product_id": a, "qty": 1}],
                                                  "paid_minor": 9_400, "payment_method": "cash"})).json()
    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    r = await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": item["sale_item_id"], "qty": 1}]})
    assert r.json()["refund_minor"] == 9_400  # what was paid, not the Rs 94.40 invoice value


async def test_capping_a_refund_never_makes_a_line_negative(client, exclusive_shop, pos_tenant):
    """Security review of d519065: the excess over what was paid came off the
    last line alone, which can be smaller than the excess."""
    a, b = exclusive_shop
    owner = await asyncpg.connect(settings.database_url)
    try:  # Rs 10 cash unit; Rs 95 + Rs 1 lines, 18% exclusive = Rs 113.28 → due Rs 110
        await owner.execute("update tenants set cash_rounding_minor = 1000 where id = $1",
                            uuid.UUID(pos_tenant.tenant_id))
        await owner.execute("update pos_products set price_minor = 9_500 where id = $1", uuid.UUID(a))
        await owner.execute("update pos_products set price_minor = 100 where id = $1", uuid.UUID(b))
    finally:
        await owner.close()
    sale = (await client.post("/pos/sales", json={
        "items": [{"product_id": a, "qty": 1}, {"product_id": b, "qty": 1}],
        "paid_minor": 11_000, "payment_method": "cash"})).json()
    assert sale["amount_due_minor"] == 11_000
    lines = {l["name"]: l["sale_item_id"] for l in
             (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"]}
    first, second = list(lines.values())
    r = await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": first, "qty": 1}, {"sale_item_id": second, "qty": 1}]})
    body = r.json()
    assert body["refund_minor"] == 11_000
    assert all(item["line_refund_minor"] >= 0 for item in body["items"])


async def test_the_cash_drawer_expects_the_rounded_cash_that_was_taken(client, exclusive_shop):
    """Security review of d519065: the drawer summed invoice totals, so every
    rounded cash sale showed up as a false shortage or overage."""
    a, _ = exclusive_shop
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute("update pos_products set price_minor = 8_000 where id = $1", uuid.UUID(a))
    finally:
        await owner.close()
    assert (await client.post("/pos/drawer/open", json={"opening_float_minor": 50_000})).status_code in (200, 201)
    await client.post("/pos/sales", json={"items": [{"product_id": a, "qty": 1}],
                                          "paid_minor": 9_400, "payment_method": "cash"})
    drawer = (await client.get("/pos/drawer/current")).json()
    assert drawer["expected_minor"] == 50_000 + 9_400  # Rs 94 went into the till, not Rs 94.40


async def test_the_sale_lookup_says_what_a_return_will_refund(client, inclusive_shop):
    """Audit I8: the Returns screen previewed price x qty, ignoring the
    discount share, so the cashier could hand out more cash than was recorded.
    The lookup must carry what each line was actually paid, what it has
    already refunded, and what is left to refund on the whole sale."""
    a, b = inclusive_shop
    sale = (await client.post("/pos/sales", json={
        "items": [{"product_id": a, "qty": 2}, {"product_id": b, "qty": 1}],  # gross Rs 250
        "discount_minor": 2_000, "paid_minor": 23_000, "payment_method": "cash"})).json()
    detail = (await client.get(f"/pos/sales/{sale['id']}")).json()
    lines = {l["product_id"]: l for l in detail["returnable"]}
    # Rs 20 discount spread by value: Rs 16 off line a, Rs 4 off line b.
    assert lines[a]["paid_minor"] == 18_400
    assert lines[b]["paid_minor"] == 4_600
    assert lines[a]["refunded_minor"] == 0
    assert detail["refundable_minor"] == sale["amount_due_minor"] == 23_000

    r = await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": lines[a]["sale_item_id"], "qty": 1}]})
    assert r.json()["refund_minor"] == 9_200   # the preview's figure: half of Rs 184, not Rs 100

    after = (await client.get(f"/pos/sales/{sale['id']}")).json()
    line_a = next(l for l in after["returnable"] if l["product_id"] == a)
    assert line_a["refunded_minor"] == 9_200
    assert after["refundable_minor"] == 23_000 - 9_200
