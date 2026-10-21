"""Team management — users & roles. All routes RBAC-guarded, tenant-scoped, audited."""
from __future__ import annotations

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status

from .. import audit, billing, db, email, refs
from ..deps import AuthContext
from ..models import InviteRequest, RoleCreate, RoleIdsPut, RoleOut, RoleRef, TeamUser, UserCreate, UserUpdate
from ..rbac import legacy_grants, perm, require
from ..security import hash_password

router = APIRouter(prefix="/team", tags=["team"])


@router.get("/users", response_model=list[TeamUser])
async def list_users(auth: AuthContext = Depends(require("settings", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select u.id, u.email, u.name, u.status, r.name as role,
                      coalesce((select json_agg(json_build_object('id', ur.role_id, 'name', r2.name)
                                                order by ur.role_id = u.role_id desc, r2.name)
                                  from user_roles ur join roles r2 on r2.id = ur.role_id
                                 where ur.user_id = u.id), '[]') as roles
               from users u left join roles r on r.id = u.role_id
               order by u.created_at"""
        )
    return [TeamUser(id=str(r["id"]), email=r["email"], name=r["name"], role=r["role"], status=r["status"],
                     roles=[RoleRef(id=str(x["id"]), name=x["name"]) for x in r["roles"]]) for r in rows]


@router.put("/users/{user_id}/roles", response_model=TeamUser)
async def set_user_roles(user_id: str, body: RoleIdsPut,
                         auth: AuthContext = Depends(perm("settings.roles.manage"))) -> TeamUser:
    """Give someone several roles (D-04): they hold the union, at the widest
    scope. The first role is their primary one. Their sessions end (D-05)."""
    role_ids = list(dict.fromkeys(body.role_ids))
    if not role_ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick at least one role")
    if user_id == auth.user_id:
        # Removing your own Owner role by accident would lock the workspace.
        raise HTTPException(status.HTTP_409_CONFLICT, "You can't change your own roles; ask another admin")
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "users", user_id)
        for rid in role_ids:
            await refs.ensure_visible(conn, "roles", rid)
        before = sorted(str(r["role_id"]) for r in await conn.fetch(
            "select role_id from user_roles where user_id=$1", user_id))
        # Primary first (the users trigger keeps it in user_roles), then the set.
        await conn.execute("update users set role_id=$1, updated_at=now() where id=$2", role_ids[0], user_id)
        await conn.execute("delete from user_roles where user_id=$1 and not (role_id = any($2::uuid[]))",
                           user_id, role_ids)
        for rid in role_ids:
            await conn.execute(
                "insert into user_roles (tenant_id, user_id, role_id) values ($1,$2,$3) on conflict do nothing",
                auth.tenant_id, user_id, rid)
        if before != sorted(role_ids):
            await conn.execute("update users set auth_epoch = auth_epoch + 1 where id=$1", user_id)
        await audit.event(conn, "user.roles", "user", user_id, changes={"roles": [before, sorted(role_ids)]})
        r = await conn.fetchrow(
            """select u.id, u.email, u.name, u.status, r.name as role from users u
                 left join roles r on r.id = u.role_id where u.id=$1""", user_id)
        held = await conn.fetch(
            """select r.id, r.name from user_roles ur join roles r on r.id = ur.role_id
                where ur.user_id=$1 order by r.id = $2 desc, r.name""", user_id, role_ids[0])
    return TeamUser(id=str(r["id"]), email=r["email"], name=r["name"], role=r["role"], status=r["status"],
                    roles=[RoleRef(id=str(x["id"]), name=x["name"]) for x in held])


@router.post("/users", response_model=TeamUser, status_code=status.HTTP_201_CREATED)
async def create_user(body: UserCreate, auth: AuthContext = Depends(require("settings", "admin"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "roles", body.role_id)
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
        await audit.event(conn, "user.create", "user", str(user_id),
                          changes=audit.diff(None, {"email": body.email, "role": role}))
    return TeamUser(id=str(user_id), email=body.email, name=body.name, role=role, status="active")


@router.patch("/users/{user_id}", response_model=TeamUser)
async def update_user(user_id: str, body: UserUpdate, auth: AuthContext = Depends(require("settings", "admin"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        current = await conn.fetchrow("select role_id, status from users where id=$1", user_id)
        if current is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        await refs.ensure_visible(conn, "roles", body.role_id)
        role_id = body.role_id if "role_id" in body.model_fields_set else current["role_id"]
        new_status = body.status or current["status"]
        # A role or status change bumps the user's auth_epoch (users trigger,
        # 0033), so the sessions they hold get 401 on their next request.
        await conn.execute("update users set role_id=$1, status=$2, updated_at=now() where id=$3",
                           role_id, new_status, user_id)
        row = await conn.fetchrow(
            """select u.id,u.email,u.name,u.status,r.name as role
               from users u left join roles r on r.id=u.role_id where u.id=$1""", user_id)
        await audit.event(conn, "user.update", "user", user_id, changes=audit.diff(
            {"role_id": str(current["role_id"]) if current["role_id"] else None, "status": current["status"]},
            {"role_id": str(role_id) if role_id else None, "status": new_status}))
    return TeamUser(id=str(row["id"]), email=row["email"], name=row["name"], role=row["role"], status=row["status"])


@router.post("/invite", status_code=status.HTTP_204_NO_CONTENT)
async def invite_member(body: InviteRequest, response: Response, background: BackgroundTasks,
                        auth: AuthContext = Depends(require("settings", "admin"))) -> Response:
    """204 once the invite is recorded. The email is queued in the same
    transaction and sent after commit, so a mail outage can't fail it."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        await billing.check_seat_limit(conn)
        role = await conn.fetchval("select name from roles where id=$1", body.role_id)
        if role is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
        tenant_name = await conn.fetchval("select name from tenants where id=$1", auth.tenant_id)
        await audit.event(conn, "user.invite", "user", data={"email": body.email, "role": role})
        mail = await email.queue_invite(conn, auth.tenant_id, body.email, tenant_name, body.role_id)
    background.add_task(email.deliver_now, mail)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


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
        keys: set[str] = set()
        for section, actions in body.permissions.items():
            for action in actions:
                await conn.execute(
                    "insert into permissions (tenant_id, role_id, section, action) values ($1,$2,$3,$4)",
                    auth.tenant_id, role_id, section, action)
                keys |= legacy_grants(section, action)
        # The same grants in RBAC v2 terms (TR-SEC-36 mapping), so the shim agrees.
        for key in sorted(keys):
            await conn.execute(
                "insert into role_grants (tenant_id, role_id, permission_key, scope) values ($1,$2,$3,'all')",
                auth.tenant_id, role_id, key)
        await audit.event(conn, "role.create", "role", str(role_id),
                          changes=audit.diff(None, {"name": body.name, "permissions": body.permissions}))
    return RoleOut(id=str(role_id), name=body.name, is_system=False)
