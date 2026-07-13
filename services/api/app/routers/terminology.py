"""Terminology engine — serves the industry-specific label map that re-skins the UI."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import db
from ..deps import AuthContext, current_auth
from ..models import INDUSTRIES, TerminologyResponse

router = APIRouter(prefix="/terminology", tags=["terminology"])


async def _labels_for(industry_type: str, locale: str = "en") -> dict[str, str]:
    # terminology is global reference data (no RLS) → owner pool is fine.
    async with db.owner_conn() as conn:
        rows = await conn.fetch(
            "select key, label from terminology where industry_type=$1 and locale=$2",
            industry_type, locale,
        )
    return {r["key"]: r["label"] for r in rows}


@router.get("", response_model=TerminologyResponse)
async def my_terminology(auth: AuthContext = Depends(current_auth)) -> TerminologyResponse:
    """Label map for the signed-in tenant's industry."""
    labels = await _labels_for(auth.industry_type)
    return TerminologyResponse(industry_type=auth.industry_type, locale="en", labels=labels)


@router.get("/preview/{industry_type}", response_model=TerminologyResponse)
async def preview_terminology(industry_type: str) -> TerminologyResponse:
    """Public preview used during signup/onboarding (before a session exists)."""
    industry = industry_type if industry_type in INDUSTRIES else "retail"
    labels = await _labels_for(industry)
    return TerminologyResponse(industry_type=industry, locale="en", labels=labels)
