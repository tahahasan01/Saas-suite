"""The runtime role's password comes from the environment, not a migration (P0-6, S10).

0001 used to create app_user with a password written in the repo. Now
scripts/migrate.py sets it from APP_DATABASE_URL on every run, as a SCRAM
verifier computed client-side, so the password itself never appears in SQL
text (or a server statement log). Rotation = change the env, re-run migrate,
restart (infra/README.md "Secrets").

Exercised on a throwaway role: app_user is cluster-wide and shared with
every other database on this server.
"""
from __future__ import annotations

import secrets
import uuid
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest
import pytest_asyncio

from app.config import settings
from scripts import migrate


@pytest_asyncio.fixture
async def temp_role():
    owner = await asyncpg.connect(settings.database_url)
    name = f"bos_pwtest_{uuid.uuid4().hex[:8]}"
    await owner.execute(f'create role "{name}" login')
    yield owner, name
    await owner.execute(f'drop role if exists "{name}"')
    await owner.close()


def _url_as(user: str, password: str) -> str:
    parts = urlsplit(settings.database_url)
    host = parts.hostname + (f":{parts.port}" if parts.port else "")
    return urlunsplit(parts._replace(netloc=f"{user}:{password}@{host}"))


def test_the_verifier_never_contains_the_password():
    pw = secrets.token_hex(16)
    v = migrate.scram_verifier(pw)
    assert v.startswith("SCRAM-SHA-256$4096:")
    assert pw not in v
    assert migrate.scram_verifier(pw) != v  # fresh salt


async def test_the_password_from_the_url_is_the_one_that_logs_in(temp_role):
    owner, name = temp_role
    pw = secrets.token_hex(16)
    await migrate.set_role_password(owner, name, pw)
    conn = await asyncpg.connect(_url_as(name, pw))
    await conn.close()
    with pytest.raises(asyncpg.InvalidPasswordError):
        await asyncpg.connect(_url_as(name, "not-" + pw))


async def test_rotation_replaces_the_old_password(temp_role):
    owner, name = temp_role
    old, new = secrets.token_hex(16), secrets.token_hex(16)
    await migrate.set_role_password(owner, name, old)
    await migrate.set_role_password(owner, name, new)
    await (await asyncpg.connect(_url_as(name, new))).close()
    with pytest.raises(asyncpg.InvalidPasswordError):
        await asyncpg.connect(_url_as(name, old))


def test_only_the_app_user_role_is_synced_from_its_url():
    assert migrate.app_user_password("postgres://app_user:s3cr%40t@db/x") == "s3cr@t"
    assert migrate.app_user_password("postgres://someone_else:pw@db/x") is None
    assert migrate.app_user_password("postgres://app_user@db/x") is None


def test_no_migration_carries_a_password():
    for path in migrate.MIGRATIONS_DIR.glob("*.sql"):
        sql = path.read_text(encoding="utf-8").lower()
        assert "app_user_pw" not in sql, path.name
        assert " password '" not in sql, path.name
        assert "alter database businessos " not in sql, path.name
