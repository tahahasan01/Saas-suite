"""Audit P0-2: a session must stop working the moment the account behind it
does. Before this, disabling a user or suspending a tenant left their existing
sessions valid for up to 30 days, a password reset left a stolen session alive,
and two concurrent requests could both consume one single-use token."""
from __future__ import annotations

import asyncio
import uuid

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

from app import tokens
from app.config import settings
from app.main import app
from app.security import SESSION_COOKIE, hash_token

PASSWORD = "Sup3rSecret!23"


async def _second_user(owner_client) -> tuple[str, str]:
    """Creates a teammate through the API; returns (user_id, email)."""
    roles = (await owner_client.get("/team/roles")).json()
    email = f"mate+{uuid.uuid4().hex[:10]}@example.com"
    r = await owner_client.post("/team/users", json={
        "name": "Mate", "email": email, "password": PASSWORD, "role_id": roles[0]["id"]})
    r.raise_for_status()
    return r.json()["id"], email


async def _login(email: str) -> AsyncClient:
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    r = await c.post("/auth/login", json={"email": email, "password": PASSWORD})
    r.raise_for_status()
    c.cookies.set(SESSION_COOKIE, r.cookies[SESSION_COOKIE])
    return c


async def test_disabling_a_user_ends_their_existing_session(client, crm_tenant):
    user_id, email = await _second_user(client)
    mate = await _login(email)
    try:
        assert (await mate.get("/auth/me")).status_code == 200
        r = await client.patch(f"/team/users/{user_id}", json={"status": "disabled"})
        r.raise_for_status()
        assert (await mate.get("/auth/me")).status_code == 401
    finally:
        await mate.aclose()


async def test_suspending_a_tenant_ends_its_sessions(client, crm_tenant):
    assert (await client.get("/auth/me")).status_code == 200
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute("update tenants set status='suspended' where id=$1",
                            uuid.UUID(crm_tenant.tenant_id))
    finally:
        await owner.close()
    assert (await client.get("/auth/me")).status_code == 401


async def test_password_reset_ends_every_existing_session(client, crm_tenant):
    me = (await client.get("/auth/me")).json()
    token = await tokens.create("reset", email=me["user"]["email"],
                                user_id=me["user"]["id"], ttl_hours=1)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as anon:
        r = await anon.post("/auth/reset", json={"token": token, "password": "N3wSecret!456"})
        assert r.status_code == 204
    # The owner's session predates the reset, so it must be dead now.
    assert (await client.get("/auth/me")).status_code == 401


async def test_a_single_use_token_is_consumed_exactly_once_under_concurrency(client, crm_tenant):
    """Deterministic race: another transaction holds the token row's lock while
    two consumers start. A select-then-update consumer reads the row as unused
    in both, then both writes go through once the lock is released."""
    me = (await client.get("/auth/me")).json()
    token = await tokens.create("reset", email=me["user"]["email"],
                                user_id=me["user"]["id"], ttl_hours=1)
    blocker = await asyncpg.connect(settings.database_url)
    try:
        tx = blocker.transaction()
        await tx.start()
        await blocker.execute("update auth_tokens set kind = kind where token_hash = $1",
                              hash_token(token))
        racers = [asyncio.create_task(tokens.consume(token, "reset")) for _ in range(2)]
        await asyncio.sleep(0.5)  # both consumers reach the locked row
        await tx.commit()
        results = await asyncio.gather(*racers)
    finally:
        await blocker.close()
    assert sum(r is not None for r in results) == 1
