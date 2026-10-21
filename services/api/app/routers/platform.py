"""Modules on and off (D-01, D-02): list, enable with a dry run, disable with
cascade, and the delayed purge. The manifests are in app/modules."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status

from .. import db
from ..deps import AuthContext, current_auth
from ..models import DisablePlanOut, EnablePlanOut, ModuleOut, PurgeOut, PurgeRequest
from ..modules import MODULES, service
from ..rbac import perm

router = APIRouter(prefix="/platform/modules", tags=["modules"])


@router.get("", response_model=list[ModuleOut])
async def list_modules(auth: AuthContext = Depends(current_auth)) -> list[ModuleOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        st = await service.states(conn)
        purges = {r["module_key"]: r["run_after"] for r in await conn.fetch(
            "select module_key, run_after from module_purges where status = 'pending'")}
    out = []
    for k, m in MODULES.items():
        state, reason = st.get(k, ("enabled" if m.always_on else "disabled", None))
        out.append(ModuleOut(
            key=k, label=m.label, description=m.description, application=m.application,
            always_on=m.always_on, state="enabled" if m.always_on else state,  # type: ignore[arg-type]
            reason=reason,  # type: ignore[arg-type]
            depends=list(m.depends), auto_enable=list(m.auto_enable),
            purgeable=bool(m.purge_tables), pending_purge_at=purges.get(k)))
    return out


@router.post("/{key}/enable", response_model=EnablePlanOut)
async def enable_module(key: str, dry_run: bool = False,
                        auth: AuthContext = Depends(perm("settings.modules.manage"))) -> EnablePlanOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        plan = await service.enable(conn, key, user_id=auth.user_id, dry_run=dry_run)
    return EnablePlanOut(module=key, to_enable=plan.to_enable, violations=plan.violations,
                         applied=not dry_run)


@router.post("/{key}/disable", response_model=DisablePlanOut)
async def disable_module(key: str, cascade: bool = False, dry_run: bool = False,
                         auth: AuthContext = Depends(perm("settings.modules.manage"))) -> DisablePlanOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        to_disable, blocked = await service.disable(conn, key, cascade=cascade, dry_run=dry_run)
    return DisablePlanOut(module=key, to_disable=to_disable, blocked_by=blocked, applied=not dry_run)


@router.post("/{key}/purge", response_model=PurgeOut, status_code=status.HTTP_202_ACCEPTED)
async def purge_module(key: str, body: PurgeRequest, response: Response,
                       auth: AuthContext = Depends(perm("settings.modules.manage"))) -> PurgeOut:
    """Schedules the deletion of a disabled module's data, 7 days out. Typing
    "DELETE <module>" confirms; turning the module back on cancels it."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        out = await service.request_purge(conn, key, confirm=body.confirm, user_id=auth.user_id)
    response.status_code = status.HTTP_202_ACCEPTED
    return PurgeOut(**out)
