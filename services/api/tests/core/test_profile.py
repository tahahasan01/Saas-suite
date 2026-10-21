"""My profile and password (3A settings screens).

The password change itself is the existing POST /auth/password; these tests
pin what the profile screen relies on: it bumps auth_epoch (D-05), so every
other device is signed out, while the caller keeps working."""
from __future__ import annotations

import uuid

import asyncpg
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app
from app.security import SESSION_COOKIE

PASSWORD = "Sup3rSecret!23"


async def test_profile_round_trip(client, crm_tenant):
    r = await client.get("/profile")
    assert r.status_code == 200
    me = r.json()
    assert me["name"] == "Test Owner" and me["locale"] == "en" and "@" in me["email"]
    r = await client.patch("/profile", json={"name": "  Ayesha Khan ", "locale": "ur"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Ayesha Khan" and r.json()["locale"] == "ur"
    me = (await client.get("/auth/me")).json()
    assert me["user"]["name"] == "Ayesha Khan" and me["locale"]["locale"] == "ur"


async def test_profile_validation(client, crm_tenant):
    for bad in ({"name": ""}, {"name": "   "}, {"locale": "fr"}):
        assert (await client.patch("/profile", json=bad)).status_code == 422, bad


async def test_password_change_signs_out_other_devices_and_bumps_the_epoch(client, crm_tenant):
    email = (await client.get("/profile")).json()["email"]
    # A second device, signed in with the same account.
    other = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    try:
        r = await other.post("/auth/login", json={"email": email, "password": PASSWORD})
        r.raise_for_status()
        other.cookies.set(SESSION_COOKIE, r.cookies[SESSION_COOKIE])
        assert (await other.get("/profile")).status_code == 200

        conn = await asyncpg.connect(settings.database_url)
        try:
            before = await conn.fetchval("select auth_epoch from users where email=$1", email)
        finally:
            await conn.close()

        r = await client.post("/auth/password", json={"current_password": PASSWORD,
                                                      "new_password": "N3w-Secret-Pass!"})
        assert r.status_code == 204, r.text
        client.cookies.set(SESSION_COOKIE, r.cookies[SESSION_COOKIE])

        conn = await asyncpg.connect(settings.database_url)
        try:
            after = await conn.fetchval("select auth_epoch from users where email=$1", email)
        finally:
            await conn.close()
        assert after > before
        assert (await other.get("/profile")).status_code == 401
        assert (await client.get("/profile")).status_code == 200
    finally:
        await other.aclose()


async def test_wrong_current_password_changes_nothing(client, crm_tenant):
    r = await client.post("/auth/password", json={"current_password": "wrong-one-123",
                                                  "new_password": "N3w-Secret-Pass!"})
    assert r.status_code == 400
    assert (await client.get("/profile")).status_code == 200


async def test_profile_needs_a_session():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as anon:
        assert (await anon.get("/profile")).status_code == 401
        assert (await anon.patch("/profile", json={"name": str(uuid.uuid4())})).status_code == 401
