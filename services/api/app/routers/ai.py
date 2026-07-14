"""AI assistant endpoint — natural-language questions over the tenant's data."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from .. import billing, db
from ..ai import gateway
from ..deps import AuthContext, current_auth
from ..models import AskRequest, AskResponse
from ..ratelimit import rate_limit

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/ask", response_model=AskResponse, dependencies=[Depends(rate_limit(20, 60))])
async def ask(body: AskRequest, auth: AuthContext = Depends(current_auth)) -> AskResponse:
    """Answers across every module the tenant has enabled.

    Deliberately not gated on a single section: the whole point is that one
    question can span sales, stock and staff. Access is scoped by passing the
    enabled sections down to the guard, which allowlists views accordingly — so
    a POS-only tenant can never reach a CRM view.
    """
    async with db.tenant_conn(auth.tenant_id) as conn:
        sections = {
            r["section_key"] for r in await conn.fetch(
                "select section_key from entitlements where tenant_id=$1 and enabled", auth.tenant_id)
        }
        if not sections:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Enable a module first.")
        await billing.check_ai_limit(conn)

    try:
        result = await gateway.ask(auth.tenant_id, auth.user_id, body.question, sections)
    except gateway.AiUnavailable as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    return AskResponse(**result)
