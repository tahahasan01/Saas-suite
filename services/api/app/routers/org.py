"""Company profile, branches and Pakistan regions (3A, migration 0055).

Name, timezone and FY start are columns of `tenants` (app_user may update
just those three, column grant in 0055); the rest of the profile is
`tenant_company`. Branches: list and edit only; adding branches and the
branch switcher are Phase 6 (D-03).
"""
from __future__ import annotations

from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from .. import audit, branches, branding, db
from ..deps import AuthContext, current_auth
from ..org_models import (
    BranchOut, BranchUpdate, BrandingOut, BrandingUpdate, CompanyOut, CompanyUpdate, RegionOut,
)
from ..rbac import perm

router = APIRouter(prefix="/org", tags=["org"])

_TENANT_COLS = ("name", "timezone", "fy_start_month")
_COMPANY_COLS = ("legal_name", "ntn", "strn", "address", "city", "phone", "email", "region_code")
_NULLABLE = ("ntn", "strn", "region_code")


def invalid(e: asyncpg.PostgresError) -> HTTPException:
    """A CHECK/FK the model couldn't see (timezone list, region codes) is the
    caller's mistake: 422 with words, never a 500."""
    msg = {
        "tenants_timezone_check": "Unknown timezone",
        "branches_timezone_check": "Unknown timezone",
        "branches_default_is_active": "The default branch can't be switched off",
    }.get(getattr(e, "constraint_name", "") or "", "That value isn't allowed")
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, msg)


async def _company(conn: asyncpg.Connection, tenant_id: str) -> CompanyOut:
    row = await conn.fetchrow(
        """select t.name, t.timezone, t.fy_start_month,
                  coalesce(c.legal_name, '') as legal_name, c.ntn, c.strn,
                  coalesce(c.address, '') as address, coalesce(c.city, '') as city,
                  coalesce(c.phone, '') as phone, coalesce(c.email, '') as email, c.region_code
             from tenants t left join tenant_company c on c.tenant_id = t.id
            where t.id = $1""", tenant_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    logo = await conn.fetchval("select logo_file_id from tenant_branding where tenant_id = $1", tenant_id)
    return CompanyOut(**dict(row), logo_file_id=str(logo) if logo else None)


@router.get("/regions", response_model=list[RegionOut])
async def regions(auth: AuthContext = Depends(current_auth)) -> list[RegionOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            "select code, name, name_ur, fbr_name, kind, pst_authority from pk_regions order by sort")
    return [RegionOut(**dict(r)) for r in rows]


@router.get("/company", response_model=CompanyOut)
async def get_company(auth: AuthContext = Depends(perm("settings.company.read"))) -> CompanyOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _company(conn, auth.tenant_id)


@router.put("/company", response_model=CompanyOut)
async def update_company(body: CompanyUpdate,
                         auth: AuthContext = Depends(perm("settings.company.manage"))) -> CompanyOut:
    fields: dict[str, Any] = body.model_dump(exclude_unset=True)
    for k, v in list(fields.items()):
        if isinstance(v, str):
            fields[k] = v.strip()
        if k in _NULLABLE and not fields[k]:
            fields[k] = None
    tenant = {k: v for k, v in fields.items() if k in _TENANT_COLS and v is not None}
    company = {k: ("" if v is None and k not in _NULLABLE else v)
               for k, v in fields.items() if k in _COMPANY_COLS}
    try:
        async with db.tenant_conn(auth.tenant_id) as conn:
            before = dict(await conn.fetchrow(
                f"select {', '.join(_TENANT_COLS)} from tenants where id = $1", auth.tenant_id))
            if tenant:
                sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(tenant))
                await conn.execute(f"update tenants set {sets}, updated_at = now() where id = $1",
                                   auth.tenant_id, *tenant.values())
                # Audited here: tenants carries no audit trigger.
                await audit.event(conn, "company.update", "tenant", auth.tenant_id,
                                  changes=audit.diff({k: before[k] for k in tenant}, tenant) or None)
            if company:
                cols = list(company)
                await conn.execute(
                    f"""insert into tenant_company (tenant_id, {', '.join(cols)})
                        values ($1, {', '.join(f'${i + 2}' for i in range(len(cols)))})
                        on conflict (tenant_id) do update
                        set {', '.join(f'{c} = excluded.{c}' for c in cols)}, updated_at = now()""",
                    auth.tenant_id, *company.values())
            return await _company(conn, auth.tenant_id)
    except (asyncpg.CheckViolationError, asyncpg.ForeignKeyViolationError) as e:
        raise invalid(e)


# ── Branches ────────────────────────────────────────────────────────────────
@router.get("/branches", response_model=list[BranchOut])
async def list_branches(auth: AuthContext = Depends(perm("settings.branches.read"))) -> list[BranchOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return [BranchOut(**b) for b in await branches.visible(conn)]


@router.patch("/branches/{branch_id}", response_model=BranchOut)
async def update_branch(branch_id: str, body: BranchUpdate,
                        auth: AuthContext = Depends(perm("settings.branches.manage"))) -> BranchOut:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
    try:
        async with db.tenant_conn(auth.tenant_id) as conn:
            row = await conn.fetchrow(
                f"""update branches set {sets}, updated_at = now()
                     where id = $1 and app_branch_visible(id) returning id""",
                branch_id, *fields.values())
            if row is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found")
            got = [b for b in await branches.all_branches(conn) if b["id"] == str(row["id"])]
    except asyncpg.UniqueViolationError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Another branch already uses that code")
    except (asyncpg.CheckViolationError, asyncpg.ForeignKeyViolationError) as e:
        raise invalid(e)
    return BranchOut(**got[0])


# ── Branding (D-12) ─────────────────────────────────────────────────────────
@router.get("/branding", response_model=BrandingOut)
async def get_branding(auth: AuthContext = Depends(current_auth)) -> BrandingOut:
    """Everyone in the tenant reads it: the shell and documents render with it."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        return BrandingOut(**await branding.load(conn))


@router.put("/branding", response_model=BrandingOut)
async def update_branding(body: BrandingUpdate,
                          auth: AuthContext = Depends(perm("settings.branding.manage"))) -> BrandingOut:
    fields = body.model_dump(exclude_unset=True)
    try:
        async with db.tenant_conn(auth.tenant_id) as conn:
            return BrandingOut(**await branding.save(conn, fields, user_id=auth.user_id))
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))
    except (asyncpg.CheckViolationError, asyncpg.ForeignKeyViolationError) as e:
        raise invalid(e)
