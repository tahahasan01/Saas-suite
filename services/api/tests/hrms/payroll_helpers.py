"""Shared helpers for the Phase 3 payroll tests (not a test module)."""
from __future__ import annotations

import json
import uuid
from typing import Any

import asyncpg
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app

PASSWORD = "Sup3rSecret!23"


async def login_with_role(owner: AsyncClient, name: str, permissions: dict[str, list[str]]) -> AsyncClient:
    """A second client, logged in as a new user on a new role."""
    role = (await owner.post("/team/roles", json={"name": f"{name} {uuid.uuid4().hex[:4]}",
                                                  "permissions": permissions})).json()
    email = f"staff+{uuid.uuid4().hex[:8]}@example.com"
    r = await owner.post("/team/users", json={"name": name, "email": email,
                                              "password": PASSWORD, "role_id": role["id"]})
    assert r.status_code == 201, r.text
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    r = await c.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return c


async def owner_fetch(sql: str, *args: Any) -> list[asyncpg.Record]:
    """Read as the table owner (RLS bypassed) — for assertions only."""
    conn = await asyncpg.connect(settings.database_url)
    try:
        for typ in ("json", "jsonb"):
            await conn.set_type_codec(typ, encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def owner_execute(sql: str, *args: Any) -> str:
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.execute(sql, *args)
    finally:
        await conn.close()


async def new_employee(client: AsyncClient, name: str = "Ayesha", salary_minor: int = 10_000_000,
                       **extra: Any) -> dict[str, Any]:
    r = await client.post("/hrms/employees", json={"name": name, "salary_minor": salary_minor, **extra})
    assert r.status_code == 201, r.text
    return r.json()
