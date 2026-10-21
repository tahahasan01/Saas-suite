"""Kiosk: a shared device at a location that can only punch (D-43, F25,
TR-SEC-29). A token per location, a hashed PIN per employee with lockout,
bound to the location's networks."""
from __future__ import annotations

import uuid

import asyncpg
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app


@pytest_asyncio.fixture
async def device():
    """An unauthenticated client: the kiosk has no session, only its token."""
    c = AsyncClient(transport=ASGITransport(app=app, client=("127.0.0.1", 6000)), base_url="http://test")
    yield c
    await c.aclose()


async def _setup(client, tenant, **loc) -> tuple[str, str, str]:
    """A location with the first employee on it and a PIN set; returns
    (location id, kiosk token, employee id)."""
    lid = (await client.post("/hrms/locations", json={"name": f"Shop {uuid.uuid4().hex[:4]}", **loc})).json()["id"]
    emp = tenant.employee_id
    await client.patch(f"/hrms/employees/{emp}/job", json={"location_id": lid})
    r = await client.put(f"/hrms/employees/{emp}/kiosk-pin", json={"pin": "4826"})
    assert r.status_code == 204, r.text
    r = await client.post("/hrms/kiosks", json={"location_id": lid, "name": "Front counter"})
    assert r.status_code == 201, r.text
    return lid, r.json()["token"], emp


async def _owner():
    return await asyncpg.connect(settings.database_url)


async def test_the_pin_is_stored_hashed(client, tenant):
    await _setup(client, tenant)
    conn = await _owner()
    try:
        h = await conn.fetchval("select kiosk_pin_hash from hrms_employees where id=$1", uuid.UUID(tenant.employee_id))
    finally:
        await conn.close()
    assert h and "4826" not in h and h.startswith("$argon2")
    assert (await client.get(f"/hrms/employees/{tenant.employee_id}")).json()["has_kiosk_pin"] is True


async def test_a_pin_is_4_to_6_digits(client, tenant):
    for bad in ("12", "abcd", "1234567"):
        r = await client.put(f"/hrms/employees/{tenant.employee_id}/kiosk-pin", json={"pin": bad})
        assert r.status_code == 422


async def test_the_token_is_shown_once_and_stored_hashed(client, tenant):
    _, token, _ = await _setup(client, tenant)
    listed = (await client.get("/hrms/kiosks")).json()
    assert listed and all("token" not in k or k["token"] is None for k in listed)
    conn = await _owner()
    try:
        stored = await conn.fetchval("select token_hash from hrms_kiosks where tenant_id=$1",
                                     uuid.UUID(tenant.tenant_id))
    finally:
        await conn.close()
    assert stored != token and len(stored) == 64


async def test_bootstrap_lists_the_locations_staff_only(client, tenant, device):
    lid, token, emp = await _setup(client, tenant)
    r = await device.get(f"/kiosk/{token}/bootstrap")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["location"]["id"] == lid
    assert [e["id"] for e in body["employees"]] == [emp]
    assert set(body["employees"][0]) <= {"id", "name", "has_pin"}     # nothing private
    assert (await device.get("/kiosk/not-a-token/bootstrap")).status_code == 404


async def test_punch_in_and_out_with_the_pin(client, tenant, device):
    lid, token, emp = await _setup(client, tenant)
    r = await device.post(f"/kiosk/{token}/punch", json={"employee_id": emp, "pin": "4826"})
    assert r.status_code == 201, r.text
    assert r.json()["kind"] == "in" and r.json()["name"]
    r = await device.post(f"/kiosk/{token}/punch", json={"employee_id": emp, "pin": "4826"})
    assert r.json()["kind"] == "out"
    conn = await _owner()
    try:
        rows = await conn.fetch("select kind, method, kiosk_id, location_id from hrms_punches where employee_id=$1 "
                                "order by at", uuid.UUID(emp))
    finally:
        await conn.close()
    assert [(p["kind"], p["method"]) for p in rows] == [("in", "kiosk"), ("out", "kiosk")]
    assert all(p["kiosk_id"] and str(p["location_id"]) == lid for p in rows)


async def test_five_wrong_pins_lock_that_employee_on_that_kiosk(client, tenant, device):
    _, token, emp = await _setup(client, tenant)
    for _ in range(5):
        r = await device.post(f"/kiosk/{token}/punch", json={"employee_id": emp, "pin": "0000"})
        assert r.status_code == 401
    r = await device.post(f"/kiosk/{token}/punch", json={"employee_id": emp, "pin": "4826"})
    assert r.status_code == 423                     # even the right PIN waits out the lock
    assert "Retry-After" in r.headers


async def test_a_kiosk_punches_only_its_own_locations_staff(client, tenant, device):
    _, token, emp = await _setup(client, tenant)
    other = [e["id"] for e in (await client.get("/hrms/employees")).json() if e["id"] != emp][0]
    await client.put(f"/hrms/employees/{other}/kiosk-pin", json={"pin": "1111"})
    r = await device.post(f"/kiosk/{token}/punch", json={"employee_id": other, "pin": "1111"})
    assert r.status_code == 404


async def test_no_pin_set_is_refused(client, tenant, device):
    _, token, emp = await _setup(client, tenant)
    conn = await _owner()
    try:
        await conn.execute("update hrms_employees set kiosk_pin_hash=null where id=$1", uuid.UUID(emp))
    finally:
        await conn.close()
    r = await device.post(f"/kiosk/{token}/punch", json={"employee_id": emp, "pin": "4826"})
    assert r.status_code == 409


async def test_the_kiosk_is_bound_to_the_locations_networks(client, tenant, device):
    lid, token, emp = await _setup(client, tenant, allowed_cidrs=["10.0.0.0/8"])
    assert (await device.get(f"/kiosk/{token}/bootstrap")).status_code == 403
    r = await device.post(f"/kiosk/{token}/punch", json={"employee_id": emp, "pin": "4826"})
    assert r.status_code == 403
    await client.patch(f"/hrms/locations/{lid}", json={"allowed_cidrs": ["127.0.0.1/32"]})
    assert (await device.get(f"/kiosk/{token}/bootstrap")).status_code == 200


async def test_a_revoked_token_stops_working(client, tenant, device):
    _, token, emp = await _setup(client, tenant)
    kid = (await client.get("/hrms/kiosks")).json()[0]["id"]
    assert (await client.post(f"/hrms/kiosks/{kid}/revoke")).status_code == 200
    assert (await device.get(f"/kiosk/{token}/bootstrap")).status_code == 404


async def test_the_kiosk_token_is_not_a_session(client, tenant, device):
    """Kiosk tokens reach /kiosk/{token}/* and nothing else (TR-SEC-29)."""
    _, token, _ = await _setup(client, tenant)
    device.cookies.set("bos_session", token)
    assert (await device.get("/hrms/employees")).status_code == 401
    assert (await device.get("/me/profile")).status_code == 401


async def test_managing_kiosks_needs_the_kiosk_key(client, tenant):
    conn = await _owner()
    try:
        await conn.execute(
            "update permissions set action='write' where section='hrms' and tenant_id=$1", uuid.UUID(tenant.tenant_id))
    finally:
        await conn.close()
    assert (await client.get("/hrms/kiosks")).status_code == 403
