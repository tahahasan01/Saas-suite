"""Audit trail helper. Call within a tenant_conn transaction after a mutation."""
from __future__ import annotations

import json
from typing import Any

import asyncpg


async def record(
    conn: asyncpg.Connection,
    *,
    actor_id: str,
    action: str,
    entity: str,
    entity_id: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    await conn.execute(
        """insert into audit_log (tenant_id, actor_id, action, entity, entity_id, before, after)
           values (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6)""",
        actor_id, action, entity, entity_id,
        json.dumps(before) if before is not None else None,
        json.dumps(after) if after is not None else None,
    )
