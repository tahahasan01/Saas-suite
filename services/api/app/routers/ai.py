"""AI assistant endpoint — natural-language questions over the tenant's data."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..ai import gateway
from ..deps import AuthContext
from ..models import AskRequest, AskResponse
from ..ratelimit import rate_limit
from ..rbac import require

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/ask", response_model=AskResponse, dependencies=[Depends(rate_limit(20, 60))])
async def ask(body: AskRequest, auth: AuthContext = Depends(require("crm", "read"))) -> AskResponse:
    result = await gateway.ask(auth.tenant_id, auth.user_id, body.question)
    return AskResponse(**result)
