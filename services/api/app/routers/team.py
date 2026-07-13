"""Team management — users & roles. All routes RBAC-guarded, tenant-scoped, audited."""
from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from .. import audit, billing, db
from ..deps import AuthContext
from ..models import RoleCreate, RoleOut, TeamUser, UserCreate, UserUpdate
from ..rbac import require
from ..security import hash_password

router = APIRouter(prefix="/team", tags=["team"])


@router.get("/users", response_model=list[TeamUser])
async def list_users(auth: AuthContext = Depends(require("settings", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select u.id, u.email, u.name, u.status, r.name as role
               from users u left join roles r on r.id = u.role_id
               order by u.created_at"""
        )
    return [TeamUser(id=str(r["id"]), email=r["email"], name=r["name"], role=r["role"], status=r["status"]) for r in rows]


@router.post("/users", response_model=TeamUser, status_code=status.HTTP_201_CREATED)
async def create_user(body: UserCreate, auth: AuthContext = Depends(require("settings", "admin"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        await billing.check_seat_limit(conn)
        try:
            user_id = await conn.fetchval(
                """insert into users (tenant_id, email, password_hash, name, role_id)
                   values ($1,$2,$3,$4,$5) returning id""",
                auth.tenant_id, body.email, hash_password(body.password), body.name, body.role_id,
            )
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
        role = await conn.fetchval("select name from roles where id=$1", body.role_id)
        await audit.record(conn, actor_id=auth.user_id, action="user.create", entity="user",
                           entity_id=str(user_id), after={"email": body.email, "role": role})
    return TeamUser(id=str(user_id), email=body.email, name=body.name, role=role, status="active")


@router.patch("/users/{user_id}", response_model=TeamUser)
async def update_user(user_id: str, body: UserUpdate, auth: AuthContext = Depends(require("settings", "admin"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        current = await conn.fetchrow("select role_id, status from users where id=$1", user_id)
        if current is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        role_id = body.role_id or current["role_id"]
        new_status = body.status or current["status"]
        await conn.execute("update users set role_id=$1, status=$2, updated_at=now() where id=$3",
                           role_id, new_status, user_id)
        row = await conn.fetchrow(
            """select u.id,u.email,u.name,u.status,r.name as role
               from users u left join roles r on r.id=u.role_id where u.id=$1""", user_id)
        await audit.record(conn, actor_id=auth.user_id, action="user.update", entity="user",
                           entity_id=user_id, after={"role_id": str(role_id), "status": new_status})
    return TeamUser(id=str(row["id"]), email=row["email"], name=row["name"], role=row["role"], status=row["status"])


@router.get("/roles", response_model=list[RoleOut])
async def list_roles(auth: AuthContext = Depends(require("settings", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select id, name, is_system from roles order by is_system desc, name")
    return [RoleOut(id=str(r["id"]), name=r["name"], is_system=r["is_system"]) for r in rows]


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(body: RoleCreate, auth: AuthContext = Depends(require("settings", "admin"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            role_id = await conn.fetchval(
                "insert into roles (tenant_id, name) values ($1,$2) returning id", auth.tenant_id, body.name)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "Role name already exists")
        for section, actions in body.permissions.items():
            for action in actions:
                await conn.execute(
                    "insert into permissions (tenant_id, role_id, section, action) values ($1,$2,$3,$4)",
                    auth.tenant_id, role_id, section, action)
        await audit.record(conn, actor_id=auth.user_id, action="role.create", entity="role",
                           entity_id=str(role_id), after={"name": body.name, "permissions": body.permissions})
    return RoleOut(id=str(role_id), name=body.name, is_system=False)
