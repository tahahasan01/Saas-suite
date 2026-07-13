"""Entitlements — which sections a tenant has turned on. Read under RLS."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from .. import audit, db
from ..deps import AuthContext, current_auth
from ..models import SECTIONS, EntitlementOut, EntitlementUpdate
from ..rbac import require

router = APIRouter(prefix="/entitlements", tags=["entitlements"])


@router.get("", response_model=list[EntitlementOut])
async def list_entitlements(auth: AuthContext = Depends(current_auth)) -> list[EntitlementOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            "select section_key, enabled, limits from entitlements where tenant_id=$1 order by section_key",
            auth.tenant_id,
        )
    return [EntitlementOut(section_key=r["section_key"], enabled=r["enabled"], limits=r["limits"]) for r in rows]


@router.patch("/{section}", response_model=EntitlementOut)
async def toggle_section(section: str, body: EntitlementUpdate,
                         auth: AuthContext = Depends(require("settings", "admin"))) -> EntitlementOut:
    if section not in SECTIONS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown section: {section}")
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """insert into entitlements (tenant_id, section_key, enabled) values ($1,$2,$3)
               on conflict (tenant_id, section_key) do update set enabled = excluded.enabled
               returning section_key, enabled, limits""",
            auth.tenant_id, section, body.enabled,
        )
        await audit.record(conn, actor_id=auth.user_id, action="entitlement.update",
                           entity="entitlement", entity_id=section, after={"enabled": body.enabled})
    return EntitlementOut(section_key=row["section_key"], enabled=row["enabled"], limits=row["limits"])
