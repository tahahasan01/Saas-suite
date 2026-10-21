"""Fill RBAC v2 grants for legacy roles from the live key registry (§7.7).

Migration 0053 mapped every role's (section, action) grants onto the keys
registered when it was written. Keys registered since (a new `register()`
block) reach existing legacy roles only through this script. Run it after a
deploy that adds keys, before RBAC_MODE moves from shadow to v2:

    ./.venv/Scripts/python -m scripts.backfill_role_grants

Idempotent. Roles created or edited in v2 (`roles.rbac_v2`) and the Owner
template ('*') are never touched. Prints how many grants it added.
"""
from __future__ import annotations

import asyncio
import os
import sys

import asyncpg

sys.path.insert(0, os.getcwd())
from app import rbac  # noqa: E402
from app.config import settings  # noqa: E402


async def backfill(conn: asyncpg.Connection) -> int:
    """Owner connection (every tenant). Returns the number of grants added."""
    rows = await conn.fetch(
        """select p.tenant_id, p.role_id, p.section, p.action
             from permissions p join roles r on r.id = p.role_id
            where not r.rbac_v2 and r.template_key is distinct from 'owner'""")
    added = 0
    for r in rows:
        for key in sorted(rbac.legacy_grants(r["section"], r["action"])):
            tag = await conn.execute(
                """insert into role_grants (tenant_id, role_id, permission_key, scope)
                   values ($1, $2, $3, 'all') on conflict do nothing""",
                r["tenant_id"], r["role_id"], key)
            added += int(tag.split()[-1])
    return added


async def main() -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        async with conn.transaction():
            added = await backfill(conn)
    finally:
        await conn.close()
    print(f"[backfill_role_grants] added {added} grant(s)")


if __name__ == "__main__":
    asyncio.run(main())
