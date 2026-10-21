"""Read-only tax reference data (D-10). Any signed-in user may read it."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from .. import db, tax
from ..deps import AuthContext, current_auth
from ..models import RegionCode
from ..org_models import TaxCategoryOut, TaxRateOut, TaxRatesOut

router = APIRouter(prefix="/tax", tags=["tax"])


@router.get("/rates", response_model=TaxRatesOut)
async def rates(on: date | None = None, region: RegionCode | None = Query(default=None),
                auth: AuthContext = Depends(current_auth)) -> TaxRatesOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        day: date = on or await conn.fetchval("select current_date")  # the tenant's today
        rows = await tax.rates_on(conn, day, region)
    out = [TaxRateOut(**{**dict(r), "id": str(r["id"]), "rate_pct": float(r["rate_pct"])}) for r in rows]
    return TaxRatesOut(on=day, rates=out, unverified_in_use=any(not r.verified for r in out))


@router.get("/categories", response_model=list[TaxCategoryOut])
async def categories(auth: AuthContext = Depends(current_auth)) -> list[TaxCategoryOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return [TaxCategoryOut(**dict(r)) for r in await tax.categories(conn)]
