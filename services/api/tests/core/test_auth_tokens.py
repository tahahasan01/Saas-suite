"""Reset, invite and verify links must be unusable straight out of a database
dump, exactly like session cookies. The original table stored the raw token, so
read access to `auth_tokens` was a password reset for any account (gate S6)."""
from __future__ import annotations

import hashlib
import uuid

import asyncpg
import pytest

from app import tokens
from app.config import settings


async def _rows_for(email: str) -> list[asyncpg.Record]:
    owner = await asyncpg.connect(settings.database_url)
    try:
        return await owner.fetch("select * from auth_tokens where email=$1", email)
    finally:
        await owner.close()


def _email() -> str:
    return f"tok+{uuid.uuid4().hex[:10]}@example.com"


async def test_only_the_sha256_of_a_token_is_stored(client):
    email = _email()
    raw = await tokens.create("verify", email=email, ttl_hours=1)
    [row] = await _rows_for(email)
    assert row["token_hash"] == hashlib.sha256(raw.encode()).hexdigest()
    # The raw value appears nowhere in the row, under any column.
    assert all(raw not in str(v) for v in row.values())
    assert "token" not in row.keys()


async def test_the_raw_token_consumes_and_the_stored_hash_does_not(client):
    email = _email()
    raw = await tokens.create("verify", email=email, ttl_hours=1)
    [row] = await _rows_for(email)
    # Someone holding a dump has the hash, which must not work as a link.
    assert await tokens.consume(row["token_hash"], "verify") is None
    assert (await tokens.consume(raw, "verify"))["email"] == email
    assert await tokens.consume(raw, "verify") is None  # single use


async def test_the_table_refuses_anything_that_is_not_a_sha256_hex(client):
    """Belt and braces: a future code path that forgets to hash cannot store a
    raw token, because the column only accepts 64 lowercase hex characters."""
    owner = await asyncpg.connect(settings.database_url)
    try:
        with pytest.raises(asyncpg.CheckViolationError):
            await owner.execute(
                """insert into auth_tokens (token_hash, kind, email, expires_at)
                   values ($1, 'verify', $2, now() + interval '1 hour')""",
                "a-raw-url-safe-token-value", _email())
    finally:
        await owner.close()
