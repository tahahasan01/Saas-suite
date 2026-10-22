"""Final settlement and gratuity (wave C, H12, St12, 0104): the endpoints.

The arithmetic and booking live in app/settlement.py. Settlements are pay:
`payroll.settlement.read` sees them, `payroll.settlement.manage` drafts,
edits and approves them (never one's own). Gratuity rules are payroll
settings.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from .. import db, refs, settlement
from ..deps import AuthContext
from ..models import (GratuitySettings, GratuitySettingsOut, HeldAsset, SettlementLineIn, SettlementLineOut,
                      SettlementOut, SettlementStatus)
from ..rbac import perm

router = APIRouter(tags=["payroll"])

READ, MANAGE = "payroll.settlement.read", "payroll.settlement.manage"

_SELECT = """select s.*, e.name as employee_name, e.join_date, e.user_id as employee_user
               from hrms_final_settlements s join hrms_employees e on e.id = s.employee_id"""


async def _out(conn: asyncpg.Connection, row: asyncpg.Record) -> SettlementOut:
    lines = await conn.fetch("select * from hrms_final_settlement_lines where settlement_id = $1 order by sort",
                             row["id"])
    pay = sum(ln["amount_minor"] for ln in lines if ln["kind"] == "payable")
    rec = sum(ln["amount_minor"] for ln in lines if ln["kind"] == "receivable")
    _, verified = await settlement.rule_for(conn)
    held = await settlement.held_assets(conn, row["employee_id"]) if row["status"] == "draft" else []
    return SettlementOut(
        id=str(row["id"]), employee_id=str(row["employee_id"]), employee_name=row["employee_name"],
        join_date=row["join_date"], last_working_day=row["last_working_day"], status=row["status"],
        service_years=row["service_years"], pay_month=row["pay_month"], payable_minor=pay, receivable_minor=rec,
        net_minor=pay - rec, gratuity_verified=verified, note=row["note"], created_at=row["created_at"],
        approved_at=row["approved_at"], paid_at=row["paid_at"],
        assets_held=[HeldAsset(id=str(a["id"]), name=a["name"], tag=a["tag"]) for a in held],
        lines=[SettlementLineOut(
            id=str(ln["id"]), kind=ln["kind"], code=ln["code"], name=ln["name"], amount_minor=ln["amount_minor"],
            taxable=ln["taxable"], auto=ln["auto"], days=float(ln["days"]) if ln["days"] is not None else None,
            explain=ln["explain"] or {}, one_off_id=str(ln["one_off_id"]) if ln["one_off_id"] else None)
            for ln in lines])


async def _fetch(conn: asyncpg.Connection, settlement_id: Any) -> SettlementOut:
    row = await conn.fetchrow(_SELECT + " where s.id = $1", settlement_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Settlement not found")
    return await _out(conn, row)


async def _draft(conn: asyncpg.Connection, auth: AuthContext, settlement_id: Any) -> asyncpg.Record:
    row = await conn.fetchrow(_SELECT + " where s.id = $1 for update of s", settlement_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Settlement not found")
    if row["employee_user"] is not None and str(row["employee_user"]) == auth.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't settle your own leaving")
    if row["status"] != "draft":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This settlement is {row['status']}")
    return row


# ── Gratuity settings ───────────────────────────────────────────────────────
@router.get("/payroll/gratuity-settings", response_model=GratuitySettingsOut)
async def get_gratuity(auth: AuthContext = Depends(perm(READ))) -> GratuitySettingsOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        r = await conn.fetchrow("select * from payroll_gratuity_settings")
    if r is None:
        return GratuitySettingsOut()
    return GratuitySettingsOut(enabled=r["enabled"], days_per_year=r["days_per_year"],
                               min_service_months=r["min_service_months"], part_year_months=r["part_year_months"],
                               note=r["note"], verified=r["verified"])


@router.put("/payroll/gratuity-settings", response_model=GratuitySettingsOut)
async def put_gratuity(body: GratuitySettings,
                       auth: AuthContext = Depends(perm("payroll.settings.manage"))) -> GratuitySettingsOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await conn.execute(
            """insert into payroll_gratuity_settings (tenant_id, enabled, days_per_year, min_service_months,
                                                      part_year_months, note, updated_by)
               values ($1, $2, $3, $4, $5, $6, $7)
               on conflict (tenant_id) do update set enabled = excluded.enabled,
                  days_per_year = excluded.days_per_year, min_service_months = excluded.min_service_months,
                  part_year_months = excluded.part_year_months, note = excluded.note,
                  updated_by = excluded.updated_by, updated_at = now()""",
            auth.tenant_id, body.enabled, body.days_per_year, body.min_service_months, body.part_year_months,
            body.note, auth.user_id)
    return await get_gratuity(auth)


# ── Settlements ─────────────────────────────────────────────────────────────
@router.post("/hrms/employees/{employee_id}/final-settlement", response_model=SettlementOut,
             status_code=status.HTTP_201_CREATED)
async def draft(employee_id: UUID, auth: AuthContext = Depends(perm(MANAGE))) -> SettlementOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        e = await conn.fetchrow("select exit_date, user_id from hrms_employees where id = $1 for update", employee_id)
        if e["exit_date"] is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "Record their leaving first: the settlement runs to the last working day")
        if e["user_id"] is not None and str(e["user_id"]) == auth.user_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't settle your own leaving")
        try:
            sid = await conn.fetchval(
                """insert into hrms_final_settlements (tenant_id, employee_id, last_working_day, created_by)
                   values ($1, $2, $3, $4) returning id""", auth.tenant_id, employee_id, e["exit_date"], auth.user_id)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "This person already has a settlement")
        row = await conn.fetchrow("select * from hrms_final_settlements where id = $1", sid)
        await settlement.build_auto_lines(conn, auth.tenant_id, row)
        return await _fetch(conn, sid)


@router.get("/hrms/final-settlements", response_model=list[SettlementOut])
async def list_settlements(status_filter: SettlementStatus | None = Query(None, alias="status"),
                           auth: AuthContext = Depends(perm(READ))) -> list[SettlementOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_SELECT + """ where ($1::text is null or s.status = $1)
                                              order by s.status = 'draft' desc, s.last_working_day desc limit 200""",
                                status_filter)
        return [await _out(conn, r) for r in rows]


@router.get("/hrms/final-settlements/{settlement_id}", response_model=SettlementOut)
async def get_settlement(settlement_id: UUID, auth: AuthContext = Depends(perm(READ))) -> SettlementOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _fetch(conn, settlement_id)


@router.post("/hrms/final-settlements/{settlement_id}/recalculate", response_model=SettlementOut)
async def recalculate(settlement_id: UUID, auth: AuthContext = Depends(perm(MANAGE))) -> SettlementOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        row = await _draft(conn, auth, settlement_id)
        await settlement.build_auto_lines(conn, auth.tenant_id, row)
        return await _fetch(conn, settlement_id)


@router.post("/hrms/final-settlements/{settlement_id}/lines", response_model=SettlementLineOut,
             status_code=status.HTTP_201_CREATED)
async def add_line(settlement_id: UUID, body: SettlementLineIn,
                   auth: AuthContext = Depends(perm(MANAGE))) -> SettlementLineOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await _draft(conn, auth, settlement_id)
        taxable = (body.kind == "payable") if body.taxable is None else (body.taxable and body.kind == "payable")
        ln = await conn.fetchrow(
            """insert into hrms_final_settlement_lines (tenant_id, settlement_id, kind, code, name, amount_minor,
                                                        taxable, sort)
               values ($1, $2, $3, $4, btrim($5), $6, $7,
                       (select coalesce(max(sort), 0) + 1 from hrms_final_settlement_lines where settlement_id = $2))
               returning *""", auth.tenant_id, settlement_id, body.kind, body.code, body.name, body.amount_minor,
            taxable)
        return SettlementLineOut(id=str(ln["id"]), kind=ln["kind"], code=ln["code"], name=ln["name"],
                                 amount_minor=ln["amount_minor"], taxable=ln["taxable"], auto=False, days=None,
                                 explain={}, one_off_id=None)


@router.delete("/hrms/final-settlement-lines/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_line(line_id: UUID, auth: AuthContext = Depends(perm(MANAGE))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        sid = await conn.fetchval("select settlement_id from hrms_final_settlement_lines where id = $1", line_id)
        if sid is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Line not found")
        await _draft(conn, auth, sid)
        await conn.execute("delete from hrms_final_settlement_lines where id = $1", line_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/hrms/final-settlements/{settlement_id}/approve", response_model=SettlementOut)
async def approve(settlement_id: UUID, auth: AuthContext = Depends(perm(MANAGE))) -> SettlementOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        row = await _draft(conn, auth, settlement_id)
        await settlement.approve(conn, auth.tenant_id, auth.user_id, row)
        return await _fetch(conn, settlement_id)


@router.post("/hrms/final-settlements/{settlement_id}/cancel", response_model=SettlementOut)
async def cancel(settlement_id: UUID, auth: AuthContext = Depends(perm(MANAGE))) -> SettlementOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await _draft(conn, auth, settlement_id)
        await conn.execute("update hrms_final_settlements set status = 'cancelled', cancelled_at = now() where id = $1",
                           settlement_id)
        return await _fetch(conn, settlement_id)
