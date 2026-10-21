"""Entitlements — the pre-registry view of which sections are on.

Deprecated (12-trd §5.3): an alias over the module registry for one release.
Reads come from the `entitlements` table, which migration 0052 keeps in step
with `tenant_modules`; a toggle goes through the registry, so turning POS on
here brings its supporting modules exactly as /platform/modules does."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from .. import audit, db
from ..deps import AuthContext, current_auth
from ..models import SECTIONS, EntitlementOut, EntitlementUpdate
from ..modules import service
from ..rbac import perm

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
                         auth: AuthContext = Depends(perm("settings.modules.manage"))) -> EntitlementOut:
    if section not in SECTIONS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown section: {section}")
    async with db.tenant_conn(auth.tenant_id) as conn:
        already = bool(await conn.fetchval(
            "select enabled from entitlements where section_key=$1", section))
        if body.enabled:
            # The old contract answered a plan refusal with 403; keep it here.
            await service.enable(conn, section, user_id=auth.user_id,
                                 limit_status=status.HTTP_403_FORBIDDEN)
        else:
            # The old switch simply turned the section off: cascade.
            await service.disable(conn, section, cascade=True)
        await audit.event(conn, "module.enable" if body.enabled else "module.disable",
                          "entitlement", section, changes={"enabled": [already, body.enabled]})
        row = await conn.fetchrow(
            "select section_key, enabled, limits from entitlements where section_key=$1", section)
    return EntitlementOut(section_key=row["section_key"], enabled=row["enabled"], limits=row["limits"])
