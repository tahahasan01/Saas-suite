"""Pay policies each company sets, and the presets (0112; see app/pay_policies.py).

Anyone who reads payroll sees them; payroll.settings.manage changes them.
"""
from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from .. import db, leave, pay_policies
from ..deps import AuthContext
from ..payroll_models import PoliciesIn, PoliciesOut, PolicyLeaveType, PresetIn, PresetOut
from ..rbac import perm, require_key

router = APIRouter(prefix="/payroll", tags=["payroll"])
READ = require_key("payroll.run.read", "hrms")


async def _out(conn: asyncpg.Connection, tenant_id: str) -> PoliciesOut:
    await leave.ensure_types(conn, tenant_id)
    r = await conn.fetchrow("select * from payroll_policies")
    types = await conn.fetch("select id, code, name, paid_on_leaving from hrms_leave_types where active "
                             "order by sort, name")
    return PoliciesOut(
        encash_basis=r["encash_basis"] if r else "days_30", gratuity_tax=r["gratuity_tax"] if r else "taxed",
        gratuity_exempt_minor=r["gratuity_exempt_minor"] if r else None, preset=r["preset"] if r else None,
        leave_types=[PolicyLeaveType(id=str(t["id"]), code=t["code"], name=t["name"],
                                     paid_on_leaving=t["paid_on_leaving"]) for t in types])


@router.get("/policies", response_model=PoliciesOut)
async def get_policies(auth: AuthContext = Depends(READ)) -> PoliciesOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _out(conn, auth.tenant_id)


@router.put("/policies", response_model=PoliciesOut)
async def put_policies(body: PoliciesIn, auth: AuthContext = Depends(perm("payroll.settings.manage"))) -> PoliciesOut:
    if (body.gratuity_tax == "exempt_up_to") != (body.gratuity_exempt_minor is not None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "Give the tax-free limit for \"tax-free up to\" (and only then)")
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await conn.execute(
            """insert into payroll_policies (tenant_id, encash_basis, gratuity_tax, gratuity_exempt_minor, updated_by)
               values ($1, $2, $3, $4, $5)
               on conflict (tenant_id) do update set encash_basis = excluded.encash_basis,
                  gratuity_tax = excluded.gratuity_tax, gratuity_exempt_minor = excluded.gratuity_exempt_minor,
                  updated_by = excluded.updated_by, updated_at = now()""",
            auth.tenant_id, body.encash_basis, body.gratuity_tax, body.gratuity_exempt_minor, auth.user_id)
        if body.paid_on_leaving_ids is not None:
            await leave.ensure_types(conn, auth.tenant_id)
            known = {str(r["id"]) for r in await conn.fetch("select id from hrms_leave_types")}
            if any(str(t) not in known for t in body.paid_on_leaving_ids):
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave type not found")
            await conn.execute("update hrms_leave_types set paid_on_leaving = (id = any($1::uuid[]))",
                               body.paid_on_leaving_ids)
        return await _out(conn, auth.tenant_id)


@router.get("/policy-presets", response_model=list[PresetOut])
async def presets(auth: AuthContext = Depends(READ)) -> list[PresetOut]:
    return [PresetOut(key=k, name=p.name, summary=p.summary) for k, p in pay_policies.PRESETS.items()]  # type: ignore[arg-type]


@router.post("/policies/apply-preset", response_model=PoliciesOut)
async def apply_preset(body: PresetIn, auth: AuthContext = Depends(perm("payroll.settings.manage"))) -> PoliciesOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await pay_policies.apply_preset(conn, auth.tenant_id, auth.user_id, body.preset)
        return await _out(conn, auth.tenant_id)
