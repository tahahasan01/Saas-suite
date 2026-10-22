"""Cashier sign-in at a till (3C, migration 0080, pos_hrms). The rules are
in app/cashiers.py."""
from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Response, status
from pydantic import BaseModel, Field

from .. import cashiers, db
from ..deps import AuthContext
from ..rbac import perm

router = APIRouter(prefix="/pos", tags=["pos"])


class SignIn(BaseModel):
    employee_id: UUID
    pin: str = Field(pattern=r"^\d{4,6}$")
    device_id: UUID | None = None


class SignedIn(BaseModel):
    cashier_token: str
    employee_id: str
    employee_name: str
    expires_in_hours: int


@router.post("/cashiers/sign-in", response_model=SignedIn)
async def sign_in(body: SignIn, auth: AuthContext = Depends(perm("pos.sale.create"))) -> SignedIn:
    async with db.tenant_conn(auth.tenant_id) as conn:
        token, emp = await cashiers.sign_in(conn, auth.tenant_id, body.employee_id, body.pin, body.device_id)
    return SignedIn(cashier_token=token, employee_id=str(emp["id"]), employee_name=emp["name"],
                    expires_in_hours=cashiers.TOKEN_HOURS)


@router.post("/cashiers/sign-out", status_code=status.HTTP_204_NO_CONTENT)
async def sign_out(x_cashier_token: str | None = Header(default=None, alias="X-Cashier-Token"),
                   auth: AuthContext = Depends(perm("pos.sale.create"))) -> Response:
    if x_cashier_token:
        async with db.tenant_conn(auth.tenant_id) as conn:
            await cashiers.sign_out(conn, x_cashier_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/cashiers")
async def cashier_list(auth: AuthContext = Depends(perm("pos.sale.create"))) -> list[dict[str, Any]]:
    """Who can sign in at a till: active staff with a PIN."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        await cashiers.require_link(conn)
        rows = await conn.fetch(
            """select id, name from hrms_employees where status = 'active' and kiosk_pin_hash is not null
                order by name""")
    return [{"employee_id": str(r["id"]), "name": r["name"]} for r in rows]

