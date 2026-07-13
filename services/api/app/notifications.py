"""In-app notification helper. Call within a tenant_conn transaction.
Future channels (WhatsApp/email) fan out from this same create path."""
from __future__ import annotations

import asyncpg


async def create(
    conn: asyncpg.Connection,
    *,
    user_id: str,
    title: str,
    body: str = "",
    kind: str = "info",
    link: str | None = None,
) -> None:
    await conn.execute(
        """insert into notifications (tenant_id, user_id, title, body, kind, link)
           values (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5)""",
        user_id, title, body, kind, link,
    )
