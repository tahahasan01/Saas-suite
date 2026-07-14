"""Request dependencies — resolve the current session into a tenant context."""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Cookie, Depends, HTTPException, status

from . import db
from .security import SESSION_COOKIE, hash_session_token


@dataclass
class AuthContext:
    session_id: str
    user_id: str
    tenant_id: str
    email: str
    name: str
    role: str | None
    role_id: str | None
    industry_type: str


async def current_auth(
    bos_session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> AuthContext:
    """Resolve the session cookie to an AuthContext, or raise 401.

    Session lookup uses the owner pool (no tenant context exists yet at this
    point — we are *discovering* which tenant the caller belongs to)."""
    if not bos_session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    async with db.owner_conn() as conn:
        row = await conn.fetchrow(
            """
            select s.id as session_id, s.expires_at,
                   u.id as user_id, u.email, u.name, u.role_id,
                   t.id as tenant_id, t.industry_type,
                   r.name as role
            from sessions s
            join users u   on u.id = s.user_id
            join tenants t on t.id = s.tenant_id
            left join roles r on r.id = u.role_id
            where s.id = $1 and s.expires_at > now()
            """,
            # The cookie holds the raw token; the table holds only its hash.
            hash_session_token(bos_session),
        )

    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")

    return AuthContext(
        session_id=row["session_id"],
        user_id=str(row["user_id"]),
        tenant_id=str(row["tenant_id"]),
        email=row["email"],
        name=row["name"],
        role=row["role"],
        role_id=str(row["role_id"]) if row["role_id"] else None,
        industry_type=row["industry_type"],
    )


async def current_employee(auth: AuthContext = Depends(current_auth)) -> str:
    """The employee record this login belongs to, or 403.

    Every /me/* endpoint depends on this and operates only on the returned id —
    an employee can never reach another employee's data because the path never
    carries an employee id at all.
    """
    async with db.tenant_conn(auth.tenant_id) as conn:
        emp_id = await conn.fetchval(
            "select id from hrms_employees where user_id=$1 and status='active'", auth.user_id)
    if emp_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This login is not linked to an employee record")
    return str(emp_id)
