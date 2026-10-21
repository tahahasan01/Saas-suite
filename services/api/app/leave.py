"""Leave v2: types, the append-only ledger and the approval chain (D-44,
migration 0067, St03 §6.4). Filled in by the leave_v2 work."""
from __future__ import annotations

import asyncpg

from .models import LeaveOut


async def team_pending(conn: asyncpg.Connection, user_id: str) -> list[LeaveOut]:
    """Pending leave from the caller's direct reports, at the manager step."""
    return []
