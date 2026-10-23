"""A manager's PIN at the till (3C, D-24): when the caller lacks a key, a
manager who holds it approves with their POS PIN. Shared by discounts and
price overrides (pos.py) and restaurant voids (wave B). Wrong PINs count
toward the approver's lockout (app/pins.py)."""
from __future__ import annotations

from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import pins, rbac
from .deps import AuthContext


async def approve(conn: asyncpg.Connection, auth: AuthContext, needs: set[str], approver_id: Any,
                  approver_pin: str | None, *, ask: str) -> str:
    """The id of whoever approves `needs`: the caller if they hold every key,
    else the named manager after their PIN checks out. `ask` is the refusal
    shown when no manager was named."""
    held = await rbac.effective_permissions(conn, auth.tenant_id, auth.role_id, auth.user_id)
    if needs <= set(held):
        return auth.user_id
    if approver_id is None or not approver_pin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, ask)
    mgr = await conn.fetchrow("select id, role_id, pos_pin_hash from users where id = $1 and status = 'active'",
                              approver_id)
    mgr_held = await rbac.effective_permissions(conn, auth.tenant_id, mgr["role_id"], str(mgr["id"])) if mgr else {}
    if mgr is None or not needs <= set(mgr_held):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "That person can't approve this")
    key = f"user:{mgr['id']}"
    if await pins.daily_off(key) or await pins.check_approval(key, f"user:{auth.user_id}", mgr["pos_pin_hash"],
                                                              approver_pin):
        raise pins.switched_off()
    return str(mgr["id"])
