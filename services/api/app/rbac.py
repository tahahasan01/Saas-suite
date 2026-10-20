"""Role-based access control. `require(section, action)` returns a dependency
that 403s unless the caller's role grants that action (or 'admin') on the section."""
from __future__ import annotations

from fastapi import Depends, HTTPException, status

from . import db, registry
from .deps import AuthContext, current_auth
from .models import SECTIONS


def require(section: str, action: str):
    async def guard(auth: AuthContext = Depends(current_auth)) -> AuthContext:
        if not auth.role_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No role assigned")
        async with db.tenant_conn(auth.tenant_id) as conn:
            # Business sections must be turned on for the tenant (entitlement).
            if section in SECTIONS:
                enabled = await conn.fetchval(
                    "select enabled from entitlements where tenant_id=$1 and section_key=$2",
                    auth.tenant_id, section,
                )
                if not enabled:
                    raise HTTPException(status.HTTP_403_FORBIDDEN, f"Section '{section}' is not enabled")
            ok = await conn.fetchval(
                """select 1 from permissions
                   where role_id = $1 and section = $2 and action in ($3, 'admin') limit 1""",
                auth.role_id, section, action,
            )
        if not ok:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {section}:{action}")
        return auth

    return guard


async def holds(conn, role_id: str | None, key: str) -> bool:
    """Whether the role carries a dotted permission key (app/registry.py)."""
    module = registry.module_of(key)
    if not role_id:
        return False
    actions = await conn.fetch(
        "select action from permissions where role_id = $1 and section = $2", role_id, module)
    return any(key in registry.keys_for_grant(module, r["action"]) for r in actions)


def require_key(key: str, section: str):
    """Like `require`, for a dotted key: `section` must be enabled for the tenant
    and the caller's role must carry `key` (no hrms grant needed for payroll)."""
    registry.module_of(key)  # fail at import time on an undeclared key

    async def guard(auth: AuthContext = Depends(current_auth)) -> AuthContext:
        async with db.tenant_conn(auth.tenant_id) as conn:
            enabled = await conn.fetchval(
                "select enabled from entitlements where tenant_id=$1 and section_key=$2",
                auth.tenant_id, section)
            if not enabled:
                raise HTTPException(status.HTTP_403_FORBIDDEN, f"Section '{section}' is not enabled")
            if not await holds(conn, auth.role_id, key):
                raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {key}")
        return auth

    return guard
