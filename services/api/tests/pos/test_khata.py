"""Khata, customer credit (3C, migration 0079, St01 P1): a khata tender
posts to the customer's append-only ledger in the sale's transaction, needs
a customer and respects their credit limit; refunds credit it back;
payments reduce the balance (cash taken at a till counts into its drawer);
balances and statements."""
from __future__ import annotations

import uuid

import asyncpg
import pytest
import pytest_asyncio

from app.config import settings

from ..core.test_rbac_v2 import _role, _user_on


@pytest_asyncio.fixture
async def item(client, pos_tenant):
    r = await client.post("/pos/products", json={"name": "Khata item " + uuid.uuid4().hex[:5],
                                                 "price_minor": 10_000, "stock_qty": 100})
    return r.json()["id"]


@pytest_asyncio.fixture
async def customer(client, pos_tenant):
    r = await client.post("/contacts", json={"name": "Aslam Kiryana " + uuid.uuid4().hex[:4], "force": True})
    return r.json()["id"]


async def _khata_sale(client, item, customer, qty=1, **extra):
    return await client.post("/pos/sales", json={"items": [{"product_id": item, "qty": qty}], "contact_id": customer,
                                                 "payment_method": "khata", **extra})


async def test_a_khata_sale_posts_to_the_customers_ledger(client, pos_tenant, item, customer):
    r = await _khata_sale(client, item, customer, qty=2)
    assert r.status_code == 201, r.text
    acct = (await client.get(f"/khata/{customer}")).json()
    assert acct["balance_minor"] == 20_000
    assert [(e["kind"], e["amount_minor"]) for e in acct["entries"]] == [("sale", 20_000)]
    assert acct["entries"][0]["sale_id"] == r.json()["id"]


async def test_khata_needs_a_customer(client, pos_tenant, item):
    r = await client.post("/pos/sales", json={"items": [{"product_id": item, "qty": 1}], "payment_method": "khata"})
    assert r.status_code == 422


async def test_a_split_sale_puts_only_its_khata_part_on_credit(client, pos_tenant, item, customer):
    r = await client.post("/pos/sales", json={"items": [{"product_id": item, "qty": 3}], "contact_id": customer,
                                              "payments": [{"method": "cash", "amount_minor": 10_000},
                                                           {"method": "khata", "amount_minor": 20_000}]})
    assert r.status_code == 201, r.text
    assert (await client.get(f"/khata/{customer}")).json()["balance_minor"] == 20_000


async def test_the_credit_limit_holds_unless_a_manager_raises_it(client, pos_tenant, item, customer):
    assert (await client.patch(f"/khata/{customer}", json={"credit_limit_minor": 15_000})).status_code == 200
    assert (await _khata_sale(client, item, customer)).status_code == 201
    r = await _khata_sale(client, item, customer)
    assert r.status_code == 409 and "limit" in r.json()["detail"].lower()
    await client.patch(f"/khata/{customer}", json={"credit_limit_minor": None})     # no limit
    assert (await _khata_sale(client, item, customer)).status_code == 201


async def test_a_payment_reduces_the_balance_and_cash_lands_in_the_drawer(client, pos_tenant, item, customer):
    reg = next(r for r in (await client.get("/pos/registers")).json() if r["is_default"])
    s = (await client.post("/pos/sessions", json={"register_id": reg["id"], "opening_float_minor": 0})).json()
    await _khata_sale(client, item, customer, qty=3)
    r = await client.post(f"/khata/{customer}/payments", json={"amount_minor": 12_000, "method": "cash",
                                                              "register_id": reg["id"], "note": "Part payment"})
    assert r.status_code == 201, r.text
    assert r.json()["balance_minor"] == 18_000
    cash = next(m for m in (await client.get(f"/pos/sessions/{s['id']}")).json()["methods"] if m["method"] == "cash")
    assert cash["expected_minor"] == 12_000
    assert (await client.post(f"/khata/{customer}/payments", json={"amount_minor": 50_000, "method": "cash"})
            ).status_code == 422      # more than they owe


async def test_a_khata_refund_credits_the_ledger(client, pos_tenant, item, customer):
    sale = (await _khata_sale(client, item, customer, qty=2)).json()
    detail = (await client.get(f"/pos/sales/{sale['id']}")).json()
    r = await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": detail["returnable"][0]["sale_item_id"], "qty": 1}]})
    assert r.status_code == 201, r.text
    acct = (await client.get(f"/khata/{customer}")).json()
    assert acct["balance_minor"] == 10_000
    assert [e["kind"] for e in acct["entries"]] == ["sale", "refund"]


async def test_balances_list_who_owes_what(client, pos_tenant, item, customer):
    await _khata_sale(client, item, customer)
    rows = (await client.get("/khata")).json()
    mine = next(r for r in rows if r["contact_id"] == customer)
    assert mine["balance_minor"] == 10_000 and mine["name"].startswith("Aslam")


async def test_the_ledger_is_append_only(client, pos_tenant, item, customer):
    await _khata_sale(client, item, customer)
    conn = await asyncpg.connect(settings.app_database_url)
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await conn.execute("update customer_ledger set amount_minor = 0")
    finally:
        await conn.close()


async def test_recording_payments_and_limits_need_their_keys(client, pos_tenant, customer):
    reader = await _role(client, [{"permission_key": "khata.ledger.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [reader])
    try:
        assert (await mate.get(f"/khata/{customer}")).status_code == 200
        assert (await mate.post(f"/khata/{customer}/payments", json={"amount_minor": 1, "method": "cash"})
                ).status_code == 403
        assert (await mate.patch(f"/khata/{customer}", json={"credit_limit_minor": 1})).status_code == 403
    finally:
        await mate.aclose()


async def test_cash_must_be_taken_at_a_till_and_other_payments_need_a_reference(client, pos_tenant, item, customer):
    """No silent write-offs: cash has to land in an open drawer, and a bank or
    wallet payment has to say which transfer it was."""
    await _khata_sale(client, item, customer, qty=2)
    url = f"/khata/{customer}/payments"
    assert (await client.post(url, json={"amount_minor": 1_000, "method": "cash"})).status_code == 422
    assert (await client.post(url, json={"amount_minor": 1_000, "method": "bank"})).status_code == 422
    r = await client.post(url, json={"amount_minor": 1_000, "method": "bank", "reference": "IBFT 88213"})
    assert r.status_code == 201, r.text
    assert r.json()["entries"][-1]["note"].startswith("IBFT 88213")
