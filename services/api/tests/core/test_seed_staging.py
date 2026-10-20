"""Staging seed (07 I9): a demo tenant wired to the FBR/PRAL sandbox, re-runnable
on every deploy, and impossible to aim at production."""
from __future__ import annotations

import uuid

import asyncpg
import pytest

from app.config import settings
from scripts import seed_staging


def _env(email: str, **extra: str) -> dict[str, str]:
    return {"STAGING_OWNER_EMAIL": email, "STAGING_OWNER_PASSWORD": "St4ging-Only!pw", **extra}


async def _tenant_of(email: str):
    owner = await asyncpg.connect(settings.database_url)
    try:
        return await owner.fetchrow(
            """select u.tenant_id, f.environment, f.token, f.enabled
                 from users u left join fbr_settings f on f.tenant_id = u.tenant_id
                where u.email = $1""", email)
    finally:
        await owner.close()


async def _drop(tenant_id) -> None:
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute("delete from tenants where id = $1", tenant_id)
    finally:
        await owner.close()


async def test_seeds_once_and_points_fbr_at_the_sandbox(client):
    email = f"staging+{uuid.uuid4().hex[:8]}@example.com"
    env = _env(email, FBR_SANDBOX_TOKEN="sandbox-token-from-pral", FBR_SANDBOX_NTN="1234567",
               FBR_SANDBOX_BUSINESS_NAME="Staging Traders", FBR_SANDBOX_PROVINCE="Punjab",
               FBR_SANDBOX_ADDRESS="1 Test Road, Lahore")
    first = await seed_staging.seed(env, client)
    try:
        again = await seed_staging.seed(env, client)  # every deploy runs it
        assert first.created and not again.created
        assert first.tenant_id == again.tenant_id
        row = await _tenant_of(email)
        assert row["environment"] == "sandbox"
        assert row["token"]  # stored (2D encrypts it at rest), never echoed back by the API
        assert first.fbr == "sandbox"
    finally:
        await _drop(uuid.UUID(first.tenant_id))


async def test_without_a_sandbox_token_fbr_stays_off(client):
    email = f"staging+{uuid.uuid4().hex[:8]}@example.com"
    result = await seed_staging.seed(_env(email), client)
    try:
        row = await _tenant_of(email)
        assert result.fbr == "off"
        assert not row["enabled"]
    finally:
        await _drop(uuid.UUID(result.tenant_id))


async def test_missing_owner_credentials_are_an_error(client):
    with pytest.raises(SystemExit, match="STAGING_OWNER_EMAIL"):
        await seed_staging.seed({}, client)


def test_refuses_to_run_in_production(monkeypatch):
    monkeypatch.setattr(settings, "node_env", "production")
    with pytest.raises(SystemExit, match="production"):
        seed_staging.main()
