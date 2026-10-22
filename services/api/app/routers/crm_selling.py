"""CRM selling (wave D): products on deals and the selling settings. The
line logic is in app/deal_lines.py. Lines follow the lead's record scope
(out of scope reads as not found, D-04); a discount over the tenant's
ceiling needs crm.deal.discount_override."""
from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends

from .. import db, deal_lines, leads, rbac
from ..crm_selling_models import CrmSettingsIn, CrmSettingsOut, DealLines, DealLinesPut
from ..deps import AuthContext
from ..rbac import perm

router = APIRouter(prefix="/crm", tags=["crm-selling"])


async def _can_override(conn: asyncpg.Connection, auth: AuthContext) -> bool:
    return await rbac.scope_of(conn, auth, "crm.deal.discount_override") is not None


@router.get("/leads/{lead_id}/lines", response_model=DealLines)
async def get_lines(lead_id: str, auth: AuthContext = Depends(perm("crm.lead.read"))) -> DealLines:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leads.ensure_in_scope(conn, auth, "crm.lead.read", lead_id)
        return await deal_lines.read(conn, lead_id)


@router.put("/leads/{lead_id}/lines", response_model=DealLines)
async def put_lines(lead_id: str, body: DealLinesPut,
                    auth: AuthContext = Depends(perm("crm.lead.update"))) -> DealLines:
    """Replace the deal's lines (an empty list clears them)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leads.ensure_in_scope(conn, auth, "crm.lead.update", lead_id)
        return await deal_lines.replace(conn, auth.tenant_id, auth.user_id, lead_id, body.lines,
                                        body.tax_inclusive, can_override=await _can_override(conn, auth))


@router.post("/leads/{lead_id}/lines/update-prices", response_model=DealLines)
async def update_prices(lead_id: str, auth: AuthContext = Depends(perm("crm.lead.update"))) -> DealLines:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leads.ensure_in_scope(conn, auth, "crm.lead.update", lead_id)
        return await deal_lines.update_prices(conn, auth.tenant_id, auth.user_id, lead_id,
                                              can_override=await _can_override(conn, auth))


@router.get("/settings", response_model=CrmSettingsOut)
async def get_settings(auth: AuthContext = Depends(perm("crm.lead.read"))) -> CrmSettingsOut:
    """Reps read the settings too: the line editor shows the discount ceiling."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await deal_lines.settings(conn)


@router.put("/settings", response_model=CrmSettingsOut)
async def put_settings(body: CrmSettingsIn,
                       auth: AuthContext = Depends(perm("crm.settings.manage"))) -> CrmSettingsOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await conn.execute(
            """insert into crm_settings (tenant_id, max_discount_pct) values ($1, $2)
               on conflict (tenant_id) do update set max_discount_pct = excluded.max_discount_pct,
                                                     updated_at = now()""",
            auth.tenant_id, body.max_discount_pct)
        return await deal_lines.settings(conn)
