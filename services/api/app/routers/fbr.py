"""FBR Digital Invoicing settings and submission status.

Guarded by the 'pos' section: FBR invoicing only exists because of the till.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from .. import audit, crypto, db, fbr, fbr_submit
from ..deps import AuthContext
from ..models import FbrInvoiceOut, FbrResolve, FbrSettingsOut, FbrSettingsUpdate
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
        token_set=bool(row["token_enc"]))


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

    # Encrypted before it reaches SQL; the plaintext column only accepts '' (0046).
    token = fields.pop("token", None)
    if token is not None:
        fields["token_enc"] = crypto.encrypt(token, fbr.token_aad(auth.tenant_id)) if token else None

    async with db.tenant_conn(auth.tenant_id) as conn:
        await _ensure(conn, auth.tenant_id)
        if fields.get("enabled"):
            # Refuse to switch on a configuration that cannot possibly file:
            # FBR would reject every sale and the retailer would only find out
            # from a tax notice.
            merged = {**dict(await _ensure(conn, auth.tenant_id)), **fields}
            missing = [k for k in ("seller_ntn_cnic", "seller_business_name",
                                   "seller_province", "seller_address", "token_enc") if not merged.get(k)]
            if missing:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "Add your NTN, business name, province, address and FBR token before turning this on.")
            # FBR rejects every line without an HS code (error 0052), so each
            # sale would sit in the retry queue until it failed for good.
            no_hs = await conn.fetchval(
                "select count(*) from pos_products where active and coalesce(trim(hs_code), '') = ''")
            if no_hs:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"{no_hs} active product(s) have no HS code. Add one to each before turning FBR on.")

        cols = ", ".join(f"{k}=${i + 2}" for i, k in enumerate(fields))
        row = await conn.fetchrow(
            f"update fbr_settings set {cols}, updated_at=now() where tenant_id=$1 returning *",
            auth.tenant_id, *fields.values())
        # Audited by the fbr_settings trigger (0044/0048), the token masked there.
    return _out(row)


@router.get("/invoices", response_model=list[FbrInvoiceOut])
async def list_invoices(pending_only: bool = False,
                        auth: AuthContext = Depends(require("pos", "read"))) -> list[FbrInvoiceOut]:
    """Submission log — the retailer's evidence of what was filed and what was not."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            f"""select {_INVOICE_COLS} from pos_fbr_invoices
                where ($1 = false or status <> 'submitted')
                order by created_at desc limit 100""", pending_only)
    return [_invoice_out(r) for r in rows]


_INVOICE_COLS = ("id, sale_id, return_id, status, fbr_invoice_number, error_code, error, "
                 "attempts, created_at")


def _invoice_out(r) -> FbrInvoiceOut:
    return FbrInvoiceOut(id=str(r["id"]), sale_id=str(r["sale_id"]),
                         return_id=str(r["return_id"]) if r["return_id"] else None,
                         status=r["status"], fbr_invoice_number=r["fbr_invoice_number"],
                         error_code=r["error_code"], error=r["error"], attempts=r["attempts"],
                         created_at=r["created_at"])


@router.post("/invoices/{invoice_id}/resolve", response_model=FbrInvoiceOut)
async def resolve_invoice(invoice_id: UUID, body: FbrResolve,
                          auth: AuthContext = Depends(require("pos", "admin"))) -> FbrInvoiceOut:
    """Settle a filing whose outcome is unknown (the connection dropped after
    it was sent). FBR offers no lookup, so a person checks IRIS: filed (record
    FBR's number, never resend) or not filed (send it once more)."""
    if body.filed and not body.fbr_invoice_number:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Enter the FBR invoice number shown in IRIS.")
    # Another tenant's filing (or a made-up id) is "not found" — answering 409
    # would confirm that it exists.
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("select 1 from pos_fbr_invoices where id=$1", invoice_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Filing not found")
    settled = await fbr_submit.resolve_unknown(
        auth.tenant_id, str(invoice_id), filed=body.filed, invoice_number=body.fbr_invoice_number)
    if not settled:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Only a filing whose outcome is unknown can be settled by hand.")
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(f"select {_INVOICE_COLS} from pos_fbr_invoices where id=$1", invoice_id)
        await audit.event(conn, "fbr.invoice.resolve", "pos_fbr_invoices", str(invoice_id),
                          data={"filed": body.filed, "fbr_invoice_number": body.fbr_invoice_number})
    return _invoice_out(row)
