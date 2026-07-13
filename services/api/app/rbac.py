"""Role-based access control. `require(section, action)` returns a dependency
that 403s unless the caller's role grants that action (or 'admin') on the section."""
from __future__ import annotations

from fastapi import Depends, HTTPException, status

from . import db
from .deps import AuthContext, current_auth


def require(section: str, action: str):
    async def guard(auth: AuthContext = Depends(current_auth)) -> AuthContext:
        if not auth.role_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No role assigned")
        async with db.tenant_conn(auth.tenant_id) as conn:
            ok = await conn.fetchval(
                """select 1 from permissions
                   where role_id = $1 and section = $2 and action in ($3, 'admin') limit 1""",
                auth.role_id, section, action,
            )
        if not ok:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {section}:{action}")
        return auth

    return guard
