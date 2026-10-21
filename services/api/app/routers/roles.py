"""Roles, the permission catalog and teams (RBAC v2, D-04, 12-trd §5.3).

A role grants permission keys at a scope and may inherit other roles. Roles
made or edited here are RBAC v2 roles (`roles.rbac_v2`): the one-release shim
in app/rbac.py never lets the old section grants decide for them. System
roles (Owner, Employee) are templates: copy one to change it.
"""
from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Response, status

from .. import audit, db, refs, scopes
from ..deps import AuthContext
from ..models import (
    CatalogKey,
    CatalogModule,
    GrantIn,
    GrantsPut,
    RoleCopy,
    RoleDetail,
    RoleIdsPut,
    RoleSummary,
    RoleV2Create,
    RoleV2Update,
    TeamCreate,
    TeamMembersPut,
    TeamOut,
)
from ..modules import MODULES, owner_of
from ..rbac import (
    MODULE_KEYS,
    PERMISSIONS,
    ensure_an_owner_remains,
    ensure_within_callers_grants,
    guard_star_change,
    perm,
    role_grant_rows,
)

router = APIRouter(tags=["roles"])

_ROLES = perm("settings.roles.manage")


# ── Catalog ─────────────────────────────────────────────────────────────────
@router.get("/permissions/catalog", response_model=list[CatalogModule])
async def catalog(auth: AuthContext = Depends(_ROLES)) -> list[CatalogModule]:
    """Every key, grouped by the module that owns it, with whether scopes
    narrower than 'all' mean anything for it."""
    groups: dict[str, list[CatalogKey]] = {}
    for key, p in PERMISSIONS.items():
        mod = owner_of(key) or p.module
        resource, action = key.rsplit(".", 1)
        groups.setdefault(mod, []).append(CatalogKey(
            key=key, resource=resource, action=action, scoped=scopes.narrowable(key),
            legacy=[p.section, p.action]))
    order = list(MODULES) + sorted(set(groups) - set(MODULES))
    return [CatalogModule(module=m, label=MODULES[m].label if m in MODULES else m.title(), keys=groups[m])
            for m in order if m in groups]


def _check_grants(grants: list[GrantIn], *, keep_all: bool = False) -> list[GrantIn]:
    """422 on anything outside the catalog. `keep_all`: the role already holds
    '*' (a copy of the Owner) and may keep it."""
    seen: dict[str, GrantIn] = {}
    for g in grants:
        k = g.permission_key
        if k == "*" and keep_all and g.scope == "all":
            seen[k] = g
            continue
        if k == "*":
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "'*' belongs to the Owner template; copy the Owner role instead")
        if k.endswith(".*"):
            if k[:-2] not in MODULE_KEYS:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"No permissions under {k}")
        elif k not in PERMISSIONS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown permission {k}")
        elif g.scope != "all" and not scopes.narrowable(k):
            # Only keys whose every route applies the scope predicate may be
            # narrowed; anywhere else a narrow grant would silently mean 'all'.
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                f"{k} can't be limited to some records yet; its scope must be 'all'")
        seen[k] = g
    return list(seen.values())


# ── Roles ───────────────────────────────────────────────────────────────────
_SUMMARY = """
    select r.id, r.name, r.description, r.is_system, r.template_key,
           (select count(*) from user_roles ur where ur.role_id = r.id) as user_count
      from roles r"""


def _summary(r: asyncpg.Record) -> RoleSummary:
    return RoleSummary(id=str(r["id"]), name=r["name"], description=r["description"], is_system=r["is_system"],
                       template_key=r["template_key"], user_count=r["user_count"])


async def _detail(conn: asyncpg.Connection, role_id: str) -> RoleDetail:
    r = await conn.fetchrow(_SUMMARY + " where r.id = $1", role_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    grants = await conn.fetch(
        "select permission_key, scope from role_grants where role_id=$1 order by permission_key", role_id)
    inherits = await conn.fetch("select inherits_id from role_inherits where role_id=$1", role_id)
    return RoleDetail(**_summary(r).model_dump(),
                      grants=[GrantIn(permission_key=g["permission_key"], scope=g["scope"]) for g in grants],
                      inherits=[str(i["inherits_id"]) for i in inherits])


async def _editable(conn: asyncpg.Connection, role_id: str) -> None:
    await refs.ensure_visible(conn, "roles", role_id)
    if await conn.fetchval("select is_system from roles where id=$1", role_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "System roles can't be changed; copy the role instead")


async def _set_grants(conn: asyncpg.Connection, tenant_id: str, role_id: str, grants: list[GrantIn]) -> None:
    await conn.execute("delete from role_grants where role_id=$1", role_id)
    for g in grants:
        await conn.execute(
            "insert into role_grants (tenant_id, role_id, permission_key, scope) values ($1,$2,$3,$4)",
            tenant_id, role_id, g.permission_key, g.scope)
    await conn.execute("update roles set rbac_v2 = true where id=$1", role_id)


@router.get("/roles", response_model=list[RoleSummary])
async def list_roles(auth: AuthContext = Depends(perm("settings.team.read"))) -> list[RoleSummary]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_SUMMARY + " order by r.is_system desc, r.name")
    return [_summary(r) for r in rows]


@router.post("/roles", response_model=RoleDetail, status_code=status.HTTP_201_CREATED)
async def create_role(body: RoleV2Create, auth: AuthContext = Depends(_ROLES)) -> RoleDetail:
    grants = _check_grants(body.grants)
    async with db.tenant_conn(auth.tenant_id) as conn:
        # Nobody builds a role with more than they hold themselves.
        await ensure_within_callers_grants(conn, auth, [(g.permission_key, g.scope) for g in grants])
        try:
            role_id = str(await conn.fetchval(
                "insert into roles (tenant_id, name, description, rbac_v2) values ($1,$2,$3,true) returning id",
                auth.tenant_id, body.name, body.description))
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "Role name already exists")
        await _set_grants(conn, auth.tenant_id, role_id, grants)
        await audit.event(conn, "role.create", "role", role_id, data={
            "name": body.name, "grants": [g.model_dump() for g in grants]})
        return await _detail(conn, role_id)


@router.get("/roles/{role_id}", response_model=RoleDetail)
async def get_role(role_id: str, auth: AuthContext = Depends(_ROLES)) -> RoleDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "roles", role_id)
        return await _detail(conn, role_id)


@router.patch("/roles/{role_id}", response_model=RoleDetail)
async def update_role(role_id: str, body: RoleV2Update, auth: AuthContext = Depends(_ROLES)) -> RoleDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _editable(conn, role_id)
        try:
            await conn.execute(
                """update roles set name = coalesce($2, name), description = coalesce($3, description)
                    where id = $1""", role_id, body.name, body.description)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "Role name already exists")
        await audit.event(conn, "role.update", "role", role_id, data=body.model_dump(exclude_none=True))
        return await _detail(conn, role_id)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(role_id: str, response: Response, auth: AuthContext = Depends(_ROLES)) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _editable(conn, role_id)
        if await conn.fetchval(
                "select exists(select 1 from user_roles where role_id=$1) or exists(select 1 from users where role_id=$1)",
                role_id):
            raise HTTPException(status.HTTP_409_CONFLICT, "Someone still holds this role; move them first")
        await conn.execute("delete from roles where id=$1", role_id)
        await audit.event(conn, "role.delete", "role", role_id)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.put("/roles/{role_id}/grants", response_model=RoleDetail)
async def put_grants(role_id: str, body: GrantsPut, auth: AuthContext = Depends(_ROLES)) -> RoleDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _editable(conn, role_id)
        before = [dict(r) for r in await conn.fetch(
            "select permission_key, scope from role_grants where role_id=$1 order by 1", role_id)]
        # Editing a role that grants owner access is an owner's job, and may
        # never leave the workspace without an owner.
        await guard_star_change(conn, auth.user_id, role_ids=[role_id])
        grants = _check_grants(body.grants, keep_all=any(b["permission_key"] == "*" for b in before))
        await ensure_within_callers_grants(conn, auth, [(g.permission_key, g.scope) for g in grants])
        await _set_grants(conn, auth.tenant_id, role_id, grants)
        await ensure_an_owner_remains(conn)
        await audit.event(conn, "role.grants", "role", role_id, changes={
            "grants": [before, [g.model_dump() for g in grants]]})
        return await _detail(conn, role_id)


@router.put("/roles/{role_id}/inherits", response_model=RoleDetail)
async def put_inherits(role_id: str, body: RoleIdsPut, auth: AuthContext = Depends(_ROLES)) -> RoleDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _editable(conn, role_id)
        parents = list(dict.fromkeys(body.role_ids))
        for pid in parents:
            await refs.ensure_visible(conn, "roles", pid)
            # A cycle: the role would end up inheriting itself.
            if pid == role_id or await conn.fetchval(
                    """with recursive up(id) as (
                           select $1::uuid union
                           select ri.inherits_id from role_inherits ri join up on ri.role_id = up.id)
                       select exists(select 1 from up where id = $2::uuid)""", pid, role_id):
                raise HTTPException(status.HTTP_409_CONFLICT, "A role can't include itself, even indirectly")
        await guard_star_change(conn, auth.user_id, role_ids=[role_id, *parents])
        await ensure_within_callers_grants(conn, auth, await role_grant_rows(conn, parents))
        await conn.execute("delete from role_inherits where role_id=$1", role_id)
        for pid in parents:
            await conn.execute(
                "insert into role_inherits (tenant_id, role_id, inherits_id) values ($1,$2,$3)",
                auth.tenant_id, role_id, pid)
        await conn.execute("update roles set rbac_v2 = true where id=$1", role_id)
        await ensure_an_owner_remains(conn)
        await audit.event(conn, "role.inherits", "role", role_id, data={"inherits": parents})
        return await _detail(conn, role_id)


@router.post("/roles/{role_id}/copy", response_model=RoleDetail, status_code=status.HTTP_201_CREATED)
async def copy_role(role_id: str, body: RoleCopy, auth: AuthContext = Depends(_ROLES)) -> RoleDetail:
    """Copy-on-edit for system templates: the copy keeps every grant
    (the Owner's '*' too) and inheritance, and is freely editable."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "roles", role_id)
        await guard_star_change(conn, auth.user_id, role_ids=[role_id])   # copying '*' is handing it out
        await ensure_within_callers_grants(conn, auth, await role_grant_rows(conn, [role_id]))
        try:
            new_id = str(await conn.fetchval(
                """insert into roles (tenant_id, name, description, rbac_v2)
                   select tenant_id, $2, description, true from roles where id=$1 returning id""",
                role_id, body.name))
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "Role name already exists")
        await conn.execute(
            """insert into role_grants (tenant_id, role_id, permission_key, scope)
               select tenant_id, $2, permission_key, scope from role_grants where role_id=$1""", role_id, new_id)
        await conn.execute(
            """insert into role_inherits (tenant_id, role_id, inherits_id)
               select tenant_id, $2, inherits_id from role_inherits where role_id=$1""", role_id, new_id)
        await audit.event(conn, "role.copy", "role", new_id, data={"from": role_id, "name": body.name})
        return await _detail(conn, new_id)


# ── Teams (the `team` scope) ────────────────────────────────────────────────
async def _team(conn: asyncpg.Connection, team_id: str) -> TeamOut:
    t = await conn.fetchrow("select id, name, lead_user_id from teams where id=$1", team_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    members = await conn.fetch("select user_id from team_members where team_id=$1", team_id)
    return TeamOut(id=str(t["id"]), name=t["name"],
                   lead_user_id=str(t["lead_user_id"]) if t["lead_user_id"] else None,
                   member_ids=[str(m["user_id"]) for m in members])


@router.get("/teams", response_model=list[TeamOut])
async def list_teams(auth: AuthContext = Depends(perm("settings.team.read"))) -> list[TeamOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        ids = [str(r["id"]) for r in await conn.fetch("select id from teams order by name")]
        return [await _team(conn, i) for i in ids]


@router.post("/teams", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
async def create_team(body: TeamCreate, auth: AuthContext = Depends(perm("settings.team.manage"))) -> TeamOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "users", body.lead_user_id)
        try:
            team_id = str(await conn.fetchval(
                "insert into teams (tenant_id, name, lead_user_id) values ($1,$2,$3) returning id",
                auth.tenant_id, body.name, body.lead_user_id))
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "A team with that name already exists")
        await audit.event(conn, "team.create", "team", team_id, data={"name": body.name})
        return await _team(conn, team_id)


@router.put("/teams/{team_id}/members", response_model=TeamOut)
async def put_members(team_id: str, body: TeamMembersPut,
                      auth: AuthContext = Depends(perm("settings.team.manage"))) -> TeamOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "teams", team_id)
        members = list(dict.fromkeys(body.user_ids))
        for uid in members:
            await refs.ensure_visible(conn, "users", uid)
        await conn.execute("delete from team_members where team_id=$1", team_id)
        for uid in members:
            await conn.execute(
                "insert into team_members (tenant_id, team_id, user_id) values ($1,$2,$3)",
                auth.tenant_id, team_id, uid)
        await audit.event(conn, "team.members", "team", team_id, data={"members": members})
        return await _team(conn, team_id)


@router.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(team_id: str, response: Response,
                      auth: AuthContext = Depends(perm("settings.team.manage"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "teams", team_id)
        await conn.execute("delete from teams where id=$1", team_id)
        await audit.event(conn, "team.delete", "team", team_id)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
