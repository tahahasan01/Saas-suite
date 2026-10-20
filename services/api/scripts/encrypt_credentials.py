"""Encrypt, verify, rekey or roll back credentials stored in the DB (S14, §7.5).

    python -m scripts.encrypt_credentials            # backfill after migration 0046
    python -m scripts.encrypt_credentials --verify   # decrypt every row, report failures
    python -m scripts.encrypt_credentials --rekey    # re-encrypt under BOS_DATA_KEY_ACTIVE
    python -m scripts.encrypt_credentials --rollback # decrypt back into the plaintext column

Runs as the owner (DATABASE_URL): it touches every tenant's row. Backfill is
idempotent, verifies each value by decrypting it before blanking the
plaintext, and only then validates the 0046 constraint — so the database
proves no plaintext token is left. Values are never printed.
"""
from __future__ import annotations

import argparse
import asyncio

import asyncpg

from app import crypto
from app.config import settings
from app.fbr import token_aad

CONSTRAINT = "fbr_settings_token_not_plaintext"


async def backfill(conn: asyncpg.Connection, *, ring: crypto.KeyRing | None = None) -> int:
    """Encrypt every plaintext token; return how many moved."""
    moved = 0
    async with conn.transaction():
        rows = await conn.fetch(
            "select tenant_id, token from fbr_settings where token <> '' for update")
        for r in rows:
            blob = crypto.encrypt(r["token"], token_aad(r["tenant_id"]), ring=ring)
            if crypto.decrypt(blob, token_aad(r["tenant_id"]), ring=ring) != r["token"]:
                raise RuntimeError(f"round-trip mismatch for tenant {r['tenant_id']}; nothing changed")
            await conn.execute(
                "update fbr_settings set token_enc=$2, token='' where tenant_id=$1",
                r["tenant_id"], blob)
            moved += 1
        # Fails (and rolls everything back) if any plaintext row is left.
        await conn.execute(f"alter table fbr_settings validate constraint {CONSTRAINT}")
    return moved


async def verify(conn: asyncpg.Connection, *, ring: crypto.KeyRing | None = None) -> dict:
    rows = await conn.fetch(
        "select tenant_id, token, token_enc from fbr_settings where token_enc is not null or token <> ''")
    report = {"encrypted": 0, "plaintext": 0, "failed": 0}
    for r in rows:
        if r["token"]:
            report["plaintext"] += 1
        if r["token_enc"] is not None:
            try:
                crypto.decrypt(r["token_enc"], token_aad(r["tenant_id"]), ring=ring)
                report["encrypted"] += 1
            except crypto.DecryptError:
                report["failed"] += 1
    return report


async def rekey(conn: asyncpg.Connection, *, ring: crypto.KeyRing | None = None) -> int:
    """Re-encrypt values not under the active key (after adding a new one)."""
    ring = ring or crypto.default_ring()
    moved = 0
    async with conn.transaction():
        rows = await conn.fetch(
            "select tenant_id, token_enc from fbr_settings where token_enc is not null for update")
        for r in rows:
            if crypto.key_id(r["token_enc"]) == ring.active:
                continue
            aad = token_aad(r["tenant_id"])
            blob = crypto.encrypt(crypto.decrypt(r["token_enc"], aad, ring=ring), aad, ring=ring)
            await conn.execute("update fbr_settings set token_enc=$2 where tenant_id=$1",
                               r["tenant_id"], blob)
            moved += 1
    return moved


async def rollback(conn: asyncpg.Connection, *, ring: crypto.KeyRing | None = None) -> int:
    """§7.5 rollback: plaintext back into `token` for code from before 0046.
    Drops the constraint (re-added NOT VALID by re-running 0046's statement)."""
    moved = 0
    async with conn.transaction():
        await conn.execute(f"alter table fbr_settings drop constraint if exists {CONSTRAINT}")
        rows = await conn.fetch(
            "select tenant_id, token_enc from fbr_settings where token_enc is not null for update")
        for r in rows:
            plain = crypto.decrypt(r["token_enc"], token_aad(r["tenant_id"]), ring=ring)
            await conn.execute("update fbr_settings set token=$2, token_enc=null where tenant_id=$1",
                               r["tenant_id"], plain)
            moved += 1
    return moved


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--verify", action="store_true")
    mode.add_argument("--rekey", action="store_true")
    mode.add_argument("--rollback", action="store_true")
    args = ap.parse_args()
    conn = await asyncpg.connect(settings.database_url)
    try:
        if args.verify:
            report = await verify(conn)
            print(f"fbr_settings.token: {report}")
            return 1 if report["failed"] or report["plaintext"] else 0
        if args.rekey:
            print(f"re-encrypted {await rekey(conn)} value(s) under key {crypto.default_ring().active!r}")
        elif args.rollback:
            print(f"decrypted {await rollback(conn)} value(s) back to plaintext (constraint dropped)")
        else:
            print(f"encrypted {await backfill(conn)} plaintext value(s); constraint validated")
        return 0
    finally:
        await conn.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
