"""The FBR bearer token is encrypted at rest (S14, TR-SEC-50, checklist §7.5).

The token is valid for five years and files tax documents in the retailer's
name. The database — and so every backup and dump of it — holds only the
envelope-encrypted blob; the key lives in the environment.
"""
from __future__ import annotations

import base64
import os
import uuid

import asyncpg
import httpx
import pytest
import pytest_asyncio

from app import crypto, fbr
from app.config import settings
from scripts import encrypt_credentials

SECRET = "sandbox-token-6f1c2e-do-not-store-me"


@pytest_asyncio.fixture
async def owner():
    conn = await asyncpg.connect(settings.database_url)
    yield conn
    await conn.close()


def _aad(tenant_id) -> bytes:
    return crypto.aad(tenant_id, "fbr_settings", "token")


async def _row(owner, tenant_id):
    return await owner.fetchrow("select * from fbr_settings where tenant_id=$1", uuid.UUID(tenant_id))


async def test_the_token_is_stored_encrypted_never_in_plaintext(client, pos_tenant, owner):
    r = await client.put("/fbr/settings", json={"token": SECRET})
    assert r.status_code == 200
    assert r.json()["token_set"] is True
    assert SECRET not in r.text

    row = await _row(owner, pos_tenant.tenant_id)
    assert row["token"] == ""
    assert SECRET.encode() not in bytes(row["token_enc"])
    assert crypto.decrypt(row["token_enc"], _aad(pos_tenant.tenant_id)) == SECRET
    # Nowhere else either: the audit trail records only that it changed.
    leaked = await owner.fetchval(
        "select count(*) from audit_log where tenant_id=$1 and after::text like '%' || $2 || '%'",
        uuid.UUID(pos_tenant.tenant_id), SECRET)
    assert leaked == 0


async def test_clearing_the_token_removes_the_ciphertext(client, pos_tenant, owner):
    await client.put("/fbr/settings", json={"token": SECRET})
    r = await client.put("/fbr/settings", json={"token": ""})
    assert r.json()["token_set"] is False
    assert (await _row(owner, pos_tenant.tenant_id))["token_enc"] is None


async def test_the_database_rejects_a_plaintext_token(client, pos_tenant, owner):
    await client.get("/fbr/settings")  # creates the row
    with pytest.raises(asyncpg.CheckViolationError):
        await owner.execute("update fbr_settings set token=$2 where tenant_id=$1",
                            uuid.UUID(pos_tenant.tenant_id), SECRET)


async def test_transmission_sends_the_decrypted_token(client, pos_tenant, owner, monkeypatch):
    await client.put("/fbr/settings", json={"token": SECRET})
    cfg = await _row(owner, pos_tenant.tenant_id)
    seen = {}

    async def post(self, url, **kwargs):
        seen.update(kwargs["headers"])
        return httpx.Response(200, json={}, request=httpx.Request("POST", url))
    monkeypatch.setattr(httpx.AsyncClient, "post", post)

    await fbr.post_invoice(cfg, {})
    assert seen["Authorization"] == f"Bearer {SECRET}"


async def test_a_token_that_cannot_be_decrypted_fails_without_sending(owner, monkeypatch):
    sent = []

    async def post(self, url, **kwargs):
        sent.append(url)
    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    cfg = {"environment": "sandbox", "tenant_id": uuid.uuid4(),
           # encrypted for a different tenant: AAD mismatch
           "token_enc": crypto.encrypt(SECRET, _aad(uuid.uuid4()))}
    result = await fbr.post_invoice(cfg, {})
    assert not result.ok and result.error_code == "token" and not result.maybe_delivered
    assert sent == []


# ── Backfill, verify, rekey, rollback (scripts/encrypt_credentials.py) ──────
# Each runs inside a transaction that is rolled back, so the constraint drop
# needed to fake a pre-0046 plaintext row never outlives the test.

async def _legacy_plaintext(owner, tenant_id: str) -> None:
    await owner.execute("alter table fbr_settings drop constraint fbr_settings_token_not_plaintext")
    await owner.execute("update fbr_settings set token=$2, token_enc=null where tenant_id=$1",
                        uuid.UUID(tenant_id), SECRET)
    await owner.execute("""alter table fbr_settings add constraint fbr_settings_token_not_plaintext
                           check (token = '') not valid""")


async def test_backfill_encrypts_existing_rows_and_then_validates(client, pos_tenant, owner):
    await client.get("/fbr/settings")
    tx = owner.transaction()
    await tx.start()
    try:
        await _legacy_plaintext(owner, pos_tenant.tenant_id)
        moved = await encrypt_credentials.backfill(owner)
        assert moved >= 1
        row = await _row(owner, pos_tenant.tenant_id)
        assert row["token"] == ""
        assert crypto.decrypt(row["token_enc"], _aad(pos_tenant.tenant_id)) == SECRET
        assert await owner.fetchval(
            """select convalidated from pg_constraint
                where conname = 'fbr_settings_token_not_plaintext'""") is True
        assert (await encrypt_credentials.verify(owner))["failed"] == 0
    finally:
        await tx.rollback()


async def test_rekey_moves_rows_to_the_active_key(client, pos_tenant, owner):
    await client.put("/fbr/settings", json={"token": SECRET})
    new_key = base64.b64encode(os.urandom(32)).decode()
    dev = base64.b64encode(crypto.default_ring().keys[crypto.default_ring().active]).decode()
    ring = crypto.KeyRing.parse(
        f'{{"{crypto.default_ring().active}": "{dev}", "k2": "{new_key}"}}', "k2")
    tx = owner.transaction()
    await tx.start()
    try:
        await encrypt_credentials.rekey(owner, ring=ring)
        row = await _row(owner, pos_tenant.tenant_id)
        assert crypto.key_id(row["token_enc"]) == "k2"
        assert crypto.decrypt(row["token_enc"], _aad(pos_tenant.tenant_id), ring=ring) == SECRET
    finally:
        await tx.rollback()


async def test_rollback_restores_the_plaintext_column(client, pos_tenant, owner):
    await client.put("/fbr/settings", json={"token": SECRET})
    tx = owner.transaction()
    await tx.start()
    try:
        await encrypt_credentials.rollback(owner)
        row = await _row(owner, pos_tenant.tenant_id)
        assert row["token"] == SECRET and row["token_enc"] is None
    finally:
        await tx.rollback()


# ── The script fails closed on the public dev key (coordinator security review)

@pytest.fixture
def no_keys(monkeypatch):
    monkeypatch.setattr(settings, "bos_data_keys", "")
    monkeypatch.setattr(settings, "bos_data_key_active", "")
    monkeypatch.setattr(crypto, "_ring", None)


async def test_the_script_refuses_the_dev_key_without_an_explicit_flag(no_keys, capsys):
    with pytest.raises(SystemExit) as e:
        await encrypt_credentials.main([])
    assert e.value.code != 0
    assert "--allow-dev-key" in capsys.readouterr().err


async def test_the_script_refuses_the_dev_key_in_production_even_with_the_flag(no_keys, monkeypatch):
    monkeypatch.setattr(settings, "node_env", "production")
    # Strong-looking URLs, so the only problem left is the key — and nothing connects.
    monkeypatch.setattr(settings, "database_url", "postgres://o:q8Zr2mXv7LpN4tWs9KcY@nowhere:1/x")
    monkeypatch.setattr(settings, "app_database_url",
                        "postgres://app_user:q8Zr2mXv7LpN4tWs9KcYx@nowhere:1/x")
    with pytest.raises(SystemExit) as e:
        await encrypt_credentials.main(["--allow-dev-key"])
    assert e.value.code != 0


async def test_the_script_names_the_key_it_uses_before_writing(no_keys, capsys):
    assert await encrypt_credentials.main(["--allow-dev-key", "--verify"]) == 0
    out = capsys.readouterr().out
    assert "using data key 'dev'" in out
    assert out.index("using data key") < out.index("fbr_settings.token")
