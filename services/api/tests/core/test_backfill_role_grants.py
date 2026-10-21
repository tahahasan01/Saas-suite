"""`python -m scripts.backfill_role_grants` (§7.7, TR-SEC-36): fills role_grants
for legacy roles from the live key registry, so keys registered after
migration 0053 reach existing roles before RBAC_MODE flips to v2."""
from __future__ import annotations

import uuid

import asyncpg

from app import rbac
from app.config import settings
from scripts import backfill_role_grants


async def test_backfill_adds_missing_mapped_grants_and_leaves_v2_roles_alone(client, crm_tenant):
    tid = uuid.UUID(crm_tenant.tenant_id)
    conn = await asyncpg.connect(settings.database_url)
    try:
        legacy = await conn.fetchval(
            "insert into roles (tenant_id, name) values ($1, 'Old clerk') returning id", tid)
        await conn.execute(
            "insert into permissions (tenant_id, role_id, section, action) values ($1,$2,'crm','read'),($1,$2,'pos','write')",
            tid, legacy)
        v2 = await conn.fetchval(
            "insert into roles (tenant_id, name, rbac_v2) values ($1, 'New', true) returning id", tid)
        await conn.execute(
            "insert into permissions (tenant_id, role_id, section, action) values ($1,$2,'crm','admin')", tid, v2)

        added = await backfill_role_grants.backfill(conn)
        assert added >= len(rbac.legacy_grants("crm", "read") | rbac.legacy_grants("pos", "write"))
        keys = {r["permission_key"] for r in await conn.fetch(
            "select permission_key from role_grants where role_id=$1", legacy)}
        assert keys == rbac.legacy_grants("crm", "read") | rbac.legacy_grants("pos", "write")
        assert await conn.fetchval("select count(*) from role_grants where role_id=$1", v2) == 0
        assert await backfill_role_grants.backfill(conn) == 0          # idempotent
    finally:
        await conn.close()
