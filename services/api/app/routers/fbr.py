"""FBR Digital Invoicing settings and submission status.

Guarded by the 'pos' section: FBR invoicing only exists because of the till.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from .. import db
from ..audit import record
from ..deps import AuthContext
from ..models import FbrInvoiceOut, FbrSettingsOut, FbrSettingsUpdate
from ..rbac import require

router = APIRouter(prefix="/fbr", tags=["fbr"])

ENVIRONMENTS = ("sandbox", "production")


def _out(row) -> FbrSettingsOut:
    return FbrSettingsOut(
        enabled=row["enabled"], environment=row["environment"],
        seller_ntn_cnic=row["seller_ntn_cnic"], seller_business_name=row["seller_business_name"],
        seller_province=row["seller_province"], seller_address=row["seller_address"],
        prices_include_tax=row["prices_include_tax"],
        # Write-only: a 5-year bearer token must not be readable back out of the API.
        token_set=bool(row["token"]))


async def _ensure(conn, tenant_id: str):
    row = await conn.fetchrow("select * from fbr_settings where tenant_id=$1", tenant_id)
    if row is None:
        row = await conn.fetchrow(
            "insert into fbr_settings (tenant_id) values ($1) returning *", tenant_id)
    return row


@router.get("/settings", response_model=FbrSettingsOut)
async def get_settings(auth: AuthContext = Depends(require("pos", "read"))) -> FbrSettingsOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return _out(await _ensure(conn, auth.tenant_id))


@router.put("/settings", response_model=FbrSettingsOut)
async def update_settings(body: FbrSettingsUpdate,
                          auth: AuthContext = Depends(require("pos", "admin"))) -> FbrSettingsOut:
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    if fields.get("environment") not in (None, *ENVIRONMENTS):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "environment must be sandbox or production")

    async with db.tenant_conn(auth.tenant_id) as conn:
        await _ensure(conn, auth.tenant_id)
        if fields.get("enabled"):
            # Refuse to switch on a configuration that cannot possibly file:
            # FBR would reject every sale and the retailer would only find out
            # from a tax notice.
            merged = {**dict(await _ensure(conn, auth.tenant_id)), **fields}
            missing = [k for k in ("seller_ntn_cnic", "seller_business_name",
                                   "seller_province", "seller_address", "token") if not merged.get(k)]
            if missing:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "Add your NTN, business name, province, address and FBR token before turning this on.")

        cols = ", ".join(f"{k}=${i + 2}" for i, k in enumerate(fields))
        row = await conn.fetchrow(
            f"update fbr_settings set {cols}, updated_at=now() where tenant_id=$1 returning *",
            auth.tenant_id, *fields.values())
        await record(
            conn, actor_id=auth.user_id, action="fbr.settings.update", entity="fbr_settings",
            entity_id=auth.tenant_id,
            # Redacted: the audit trail must not become a second copy of the token.
            after={k: ("***" if k == "token" else v) for k, v in fields.items()})
    return _out(row)


@router.get("/invoices", response_model=list[FbrInvoiceOut])
async def list_invoices(pending_only: bool = False,
                        auth: AuthContext = Depends(require("pos", "read"))) -> list[FbrInvoiceOut]:
    """Submission log — the retailer's evidence of what was filed and what was not."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select sale_id, status, fbr_invoice_number, error_code, error, attempts, created_at
                 from pos_fbr_invoices
                where ($1 = false or status <> 'submitted')
                order by created_at desc limit 100""", pending_only)
    return [FbrInvoiceOut(sale_id=str(r["sale_id"]), status=r["status"],
                          fbr_invoice_number=r["fbr_invoice_number"], error_code=r["error_code"],
                          error=r["error"], attempts=r["attempts"], created_at=r["created_at"])
            for r in rows]
