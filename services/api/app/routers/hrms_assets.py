"""Assets issued to staff (wave A, H22, St10, 0087).

The register and its assignment history. `hrms.asset.read` lists them;
`hrms.asset.manage` adds, issues, takes back and retires them (and sees the
value). One holder at a time: the open assignment is unique per asset, and
the asset's status says where it is. Employees see what they hold via /me.
"""
from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from .. import db, rbac, refs
from ..deps import AuthContext, current_auth, current_employee
from ..models import AssetAssignmentOut, AssetCreate, AssetIssue, AssetOut, AssetReturn, AssetUpdate
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms"])
portal = APIRouter(prefix="/me", tags=["portal"])

_SELECT = """
select a.*, h.employee_id as holder_id, e.name as holder_name, h.issued_at
  from hrms_assets a
  left join hrms_asset_assignments h on h.asset_id = a.id and h.returned_at is null
  left join hrms_employees e on e.id = h.employee_id"""


def _out(r: asyncpg.Record, *, show_value: bool) -> AssetOut:
    return AssetOut(
        id=str(r["id"]), name=r["name"], category=r["category"], tag=r["tag"], serial_no=r["serial_no"],
        purchased_on=r["purchased_on"], value_minor=r["value_minor"] if show_value else None,
        condition=r["condition"], status=r["status"], note=r["note"],
        holder_id=str(r["holder_id"]) if r["holder_id"] else None, holder_name=r["holder_name"],
        issued_at=r["issued_at"])


async def _fetch(conn: asyncpg.Connection, asset_id: UUID, show_value: bool) -> AssetOut:
    row = await conn.fetchrow(_SELECT + " where a.id = $1", asset_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
    return _out(row, show_value=show_value)


@router.get("/assets", response_model=list[AssetOut])
async def list_assets(auth: AuthContext = Depends(perm("hrms.asset.read"))) -> list[AssetOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        show = await rbac.holds_key(conn, auth, "hrms.asset.manage")
        rows = await conn.fetch(_SELECT + " order by a.status = 'retired', a.category, a.name limit 1000")
    return [_out(r, show_value=show) for r in rows]


@router.post("/assets", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
async def create_asset(body: AssetCreate, auth: AuthContext = Depends(perm("hrms.asset.manage"))) -> AssetOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            aid = await conn.fetchval(
                """insert into hrms_assets (tenant_id, name, category, tag, serial_no, purchased_on, value_minor,
                                            condition, note)
                   values ($1, btrim($2), $3, nullif(btrim($4), ''), $5, $6, $7, $8, $9) returning id""",
                auth.tenant_id, body.name, body.category, body.tag or "", body.serial_no, body.purchased_on,
                body.value_minor, body.condition, body.note)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "Another asset already has that tag")
        return await _fetch(conn, aid, True)


@router.patch("/assets/{asset_id}", response_model=AssetOut)
async def update_asset(asset_id: UUID, body: AssetUpdate,
                       auth: AuthContext = Depends(perm("hrms.asset.manage"))) -> AssetOut:
    fields = body.model_dump(exclude_unset=True)
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        cur = await conn.fetchrow("select status from hrms_assets where id = $1 for update", asset_id)
        if cur is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
        if fields.get("status") in ("retired", "lost", "available") and cur["status"] == "issued":
            raise HTTPException(status.HTTP_409_CONFLICT, "Take it back from its holder first")
        if fields.get("status") == "issued":
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Issue it to someone instead")
        if fields:
            sets = ", ".join(f"{k} = ${i}" for i, k in enumerate(fields, 2))
            try:
                await conn.execute(f"update hrms_assets set {sets}, updated_at = now() where id = $1",
                                   asset_id, *fields.values())
            except asyncpg.UniqueViolationError:
                raise HTTPException(status.HTTP_409_CONFLICT, "Another asset already has that tag")
        return await _fetch(conn, asset_id, True)


@router.post("/assets/{asset_id}/issue", response_model=AssetOut)
async def issue(asset_id: UUID, body: AssetIssue, auth: AuthContext = Depends(perm("hrms.asset.manage"))) -> AssetOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await refs.ensure_visible(conn, "hrms_employees", body.employee_id)
        cur = await conn.fetchrow("select status from hrms_assets where id = $1 for update", asset_id)
        if cur is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
        if cur["status"] != "available":
            raise HTTPException(status.HTTP_409_CONFLICT, f"This asset is {cur['status']}, not available")
        await conn.execute(
            """insert into hrms_asset_assignments (tenant_id, asset_id, employee_id, issued_by, issue_note)
               values ($1, $2, $3, $4, $5)""", auth.tenant_id, asset_id, body.employee_id, auth.user_id, body.note)
        await conn.execute("update hrms_assets set status = 'issued', updated_at = now() where id = $1", asset_id)
        return await _fetch(conn, asset_id, True)


@router.post("/assets/{asset_id}/return", response_model=AssetOut)
async def take_back(asset_id: UUID, body: AssetReturn,
                    auth: AuthContext = Depends(perm("hrms.asset.manage"))) -> AssetOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        if not await conn.fetchval("select 1 from hrms_assets where id = $1 for update", asset_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
        done = await conn.fetchval(
            """update hrms_asset_assignments set returned_at = now(), return_condition = $2, return_note = $3
                where asset_id = $1 and returned_at is null returning id""", asset_id, body.condition, body.note)
        if done is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Nobody holds this asset")
        await conn.execute(
            """update hrms_assets set status = 'available', condition = coalesce($2, condition), updated_at = now()
                where id = $1""", asset_id, body.condition)
        return await _fetch(conn, asset_id, True)


def _assignment(r: asyncpg.Record) -> AssetAssignmentOut:
    return AssetAssignmentOut(
        id=str(r["id"]), asset_id=str(r["asset_id"]), asset_name=r["asset_name"], employee_id=str(r["employee_id"]),
        employee_name=r["employee_name"], issued_at=r["issued_at"], issue_note=r["issue_note"],
        returned_at=r["returned_at"], return_condition=r["return_condition"], return_note=r["return_note"])


_HISTORY = """select h.*, a.name as asset_name, e.name as employee_name from hrms_asset_assignments h
                join hrms_assets a on a.id = h.asset_id join hrms_employees e on e.id = h.employee_id"""


@router.get("/assets/{asset_id}/history", response_model=list[AssetAssignmentOut])
async def history(asset_id: UUID, auth: AuthContext = Depends(perm("hrms.asset.read"))) -> list[AssetAssignmentOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("select 1 from hrms_assets where id = $1", asset_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
        rows = await conn.fetch(_HISTORY + " where h.asset_id = $1 order by h.issued_at desc", asset_id)
    return [_assignment(r) for r in rows]


@router.get("/employees/{employee_id}/assets", response_model=list[AssetOut])
async def employee_assets(employee_id: UUID, auth: AuthContext = Depends(perm("hrms.asset.read"))) -> list[AssetOut]:
    """What someone holds now (offboarding lists it, wave C)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        show = await rbac.holds_key(conn, auth, "hrms.asset.manage")
        rows = await conn.fetch(_SELECT + " where h.employee_id = $1 order by a.name", employee_id)
    return [_out(r, show_value=show) for r in rows]


@portal.get("/assets", response_model=list[AssetOut])
async def my_assets(auth: AuthContext = Depends(current_auth),
                    employee_id: str = Depends(current_employee)) -> list[AssetOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_SELECT + " where h.employee_id = $1 order by a.name", employee_id)
    return [_out(r, show_value=False) for r in rows]
