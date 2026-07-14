"""Create + consume single-use auth tokens (reset / verify / invite).
Uses the owner connection because these run without a tenant session."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

import asyncpg

from . import db


async def create(kind: str, *, email: str, user_id: str | None = None, tenant_id: str | None = None,
                 role_id: str | None = None, name: str = "", employee_id: str | None = None,
                 ttl_hours: int = 24) -> str:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=ttl_hours)
    async with db.owner_conn() as conn:
        await conn.execute(
            """insert into auth_tokens (token, kind, user_id, tenant_id, role_id, email, name,
                                        employee_id, expires_at)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            token, kind, user_id, tenant_id, role_id, email, name, employee_id, expires)
    return token


async def consume(token: str, kind: str) -> asyncpg.Record | None:
    """Return the token row and mark it used, or None if invalid/expired/used."""
    async with db.owner_conn() as conn:
        row = await conn.fetchrow(
            "select * from auth_tokens where token=$1 and kind=$2 and not used and expires_at > now()",
            token, kind)
        if row:
            await conn.execute("update auth_tokens set used=true where token=$1", token)
        return row
