"""Entitlements — which sections a tenant has turned on. Read under RLS."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import db
from ..deps import AuthContext, current_auth
from ..models import EntitlementOut

router = APIRouter(prefix="/entitlements", tags=["entitlements"])


@router.get("", response_model=list[EntitlementOut])
async def list_entitlements(auth: AuthContext = Depends(current_auth)) -> list[EntitlementOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            "select section_key, enabled, limits from entitlements where tenant_id=$1 order by section_key",
            auth.tenant_id,
        )
    return [EntitlementOut(section_key=r["section_key"], enabled=r["enabled"], limits=r["limits"]) for r in rows]
