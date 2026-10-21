"""Small helpers shared by the CRM tests."""
from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.config import settings
from app.security import SESSION_COOKIE

PASSWORD = "Sup3rSecret!23"


async def q(sql: str, *args: Any) -> list[asyncpg.Record]:
    """Run SQL as the owner (RLS bypassed): for planting and inspecting rows."""
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def add_teammate(client, actions: list[str], section: str = "crm") -> tuple[str, str]:
    """Create a role holding `actions` on `section` and a user in it.
    Returns (user_id, email); `client` stays logged in as the owner."""
    role = await client.post("/team/roles", json={"name": f"Rep {uuid.uuid4().hex[:6]}",
                                                  "permissions": {section: actions}})
    role.raise_for_status()
    email = f"rep+{uuid.uuid4().hex[:10]}@example.com"
    r = await client.post("/team/users", json={"name": "Rep", "email": email, "password": PASSWORD,
                                               "role_id": role.json()["id"]})
    r.raise_for_status()
    return r.json()["id"], email


async def login(client, email: str) -> None:
    r = await client.post("/auth/login", json={"email": email, "password": PASSWORD})
    r.raise_for_status()
    client.cookies.set(SESSION_COOKIE, r.cookies[SESSION_COOKIE])


async def login_as_rep(client, tenant_id: str, actions: list[str]) -> str:
    """Switch `client` to a fresh teammate with `actions` on crm. Returns the user id."""
    user_id, email = await add_teammate(client, actions)
    await login(client, email)
    return user_id
