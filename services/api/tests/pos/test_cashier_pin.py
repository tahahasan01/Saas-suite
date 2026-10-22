"""Cashier = employee (3C, migration 0080, pos_hrms, D-24, St01 P1).

A cashier signs in at a till with their employee PIN (argon2, five wrong
tries lock); the short-lived cashier token they get puts their employee_id
on every sale, payment and cash move. No PIN hash or verifier ever leaves
the server: an offline till keeps the token it got online. Only when both
POS and HRMS are on (the pos_hrms link module)."""
from __future__ import annotations

import uuid

import asyncpg
import pytest_asyncio

from app.config import settings

from ..conftest import PosTenant, _drop, _signup


@pytest_asyncio.fixture
async def shop(client):
    tenant_id = await _signup(client, ["pos", "hrms"])
    yield PosTenant(tenant_id=tenant_id)
    await _drop(tenant_id)


async def _owner(sql: str, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _cashier(client, pin="2468"):
    emp = (await client.get("/hrms/employees")).json()[0]
    assert (await client.put(f"/hrms/employees/{emp['id']}/kiosk-pin", json={"pin": pin})).status_code == 204
    return emp


async def _sign_in(client, emp, pin="2468"):
    return await client.post("/pos/cashiers/sign-in", json={"employee_id": emp["id"], "pin": pin})


async def test_a_cashier_signs_in_with_their_pin_and_their_sales_carry_them(client, shop):
    emp = await _cashier(client)
    r = await _sign_in(client, emp)
    assert r.status_code == 200, r.text
    token = r.json()["cashier_token"]
    assert r.json()["employee_name"] == emp["name"]
    product = (await client.get("/pos/products")).json()[0]
    sale = (await client.post("/pos/sales", json={"items": [{"product_id": product["id"], "qty": 1}],
                                                  "payment_method": "card"},
                              headers={"X-Cashier-Token": token})).json()
    rows = await _owner("select s.employee_id as s_emp, p.employee_id as p_emp from pos_sales s "
                        "join pos_payments p on p.sale_id = s.id where s.id = $1", uuid.UUID(sale["id"]))
    assert str(rows[0]["s_emp"]) == emp["id"] and str(rows[0]["p_emp"]) == emp["id"]


async def test_a_cash_move_carries_the_cashier(client, shop):
    emp = await _cashier(client)
    token = (await _sign_in(client, emp)).json()["cashier_token"]
    reg = next(r for r in (await client.get("/pos/registers")).json() if r["is_default"])
    s = (await client.post("/pos/sessions", json={"register_id": reg["id"]})).json()
    r = await client.post(f"/pos/sessions/{s['id']}/cash-moves", json={"kind": "pay_out", "amount_minor": 500,
                                                                       "reason": "Change for float"},
                          headers={"X-Cashier-Token": token})
    assert r.status_code == 201, r.text
    rows = await _owner("select employee_id from pos_cash_moves where session_id = $1", uuid.UUID(s["id"]))
    assert str(rows[0]["employee_id"]) == emp["id"]


async def test_five_wrong_pins_lock_the_cashier(client, shop):
    emp = await _cashier(client)
    for _ in range(5):
        assert (await _sign_in(client, emp, "1111")).status_code == 403
    assert (await _sign_in(client, emp, "2468")).status_code == 423


async def test_a_bad_or_foreign_cashier_token_is_refused(client, shop):
    product = (await client.get("/pos/products")).json()[0]
    r = await client.post("/pos/sales", json={"items": [{"product_id": product["id"], "qty": 1}],
                                              "payment_method": "card"},
                          headers={"X-Cashier-Token": "not-a-token" * 4})
    assert r.status_code == 401


async def test_signing_out_ends_the_token(client, shop):
    emp = await _cashier(client)
    token = (await _sign_in(client, emp)).json()["cashier_token"]
    assert (await client.post("/pos/cashiers/sign-out", headers={"X-Cashier-Token": token})).status_code == 204
    product = (await client.get("/pos/products")).json()[0]
    r = await client.post("/pos/sales", json={"items": [{"product_id": product["id"], "qty": 1}],
                                              "payment_method": "card"}, headers={"X-Cashier-Token": token})
    assert r.status_code == 401


async def test_no_pin_material_ever_leaves_the_server(client, shop):
    """A 4-6 digit PIN's hash cracks offline in seconds, and the same PIN
    clocks staff in at the kiosk: no till, online or offline, gets one."""
    emp = await _cashier(client, "135792")
    reg = next(r for r in (await client.get("/pos/registers")).json() if r["is_default"])
    dev = (await client.post("/pos/devices", json={"register_id": reg["id"], "device_code": "T1"})).json()
    r = await client.get(f"/pos/devices/{dev['id']}/cashier-verifiers", headers={"X-Device-Token": dev["token"]})
    assert r.status_code in (404, 405)
    listed = (await client.get("/pos/cashiers")).json()
    assert [c for c in listed if c["employee_id"] == emp["id"]]
    assert all(set(c) == {"employee_id", "name"} for c in listed)
    cols = await _owner("select column_name from information_schema.columns "
                        "where table_name = 'hrms_employees' and column_name like '%verifier%'")
    assert cols == []


async def test_cashier_sign_in_needs_both_pos_and_hrms(client, pos_tenant):
    r = await client.post("/pos/cashiers/sign-in", json={"employee_id": str(uuid.uuid4()), "pin": "2468"})
    assert r.status_code in (403, 409)
