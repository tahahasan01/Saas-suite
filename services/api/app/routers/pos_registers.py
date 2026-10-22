"""Registers, devices and register sessions (3C, migration 0076). The money
rules are in app/pos_sessions.py."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from .. import cashiers, db, pos_sessions, rbac
from ..deps import AuthContext
from ..models import TENDER_METHODS, CashMoveKind, TenderMethod
from ..rbac import perm
from ..security import hash_password, hash_token, new_session_token

router = APIRouter(prefix="/pos", tags=["pos"])


# ── Registers ───────────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    code: str = Field(pattern=r"^[A-Z0-9]{1,6}$")
    name: str = Field(min_length=1, max_length=60)
    payment_methods: list[TenderMethod] = Field(default_factory=lambda: list(TENDER_METHODS), min_length=1)
    cash_rounding_minor: int | None = Field(default=None, ge=0, le=10000)
    max_variance_minor: int = Field(default=50000, ge=0)


class RegisterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    payment_methods: list[TenderMethod] | None = Field(default=None, min_length=1)
    cash_rounding_minor: int | None = Field(default=None, ge=0, le=10000)
    max_variance_minor: int | None = Field(default=None, ge=0)
    active: bool | None = None


class RegisterOut(BaseModel):
    id: str
    code: str
    name: str
    payment_methods: list[str]
    cash_rounding_minor: int | None
    max_variance_minor: int
    config_version: int
    is_default: bool
    active: bool
    open_session_id: str | None


def _register(r: asyncpg.Record) -> RegisterOut:
    return RegisterOut(id=str(r["id"]), code=r["code"], name=r["name"], payment_methods=list(r["payment_methods"]),
                       cash_rounding_minor=r["cash_rounding_minor"], max_variance_minor=r["max_variance_minor"],
                       config_version=r["config_version"], is_default=r["is_default"], active=r["active"],
                       open_session_id=str(r["open_session_id"]) if r["open_session_id"] else None)


_REGISTERS = """select r.*, (select s.id from pos_sessions s where s.register_id = r.id and s.status = 'open')
                       as open_session_id from pos_registers r"""


@router.get("/registers", response_model=list[RegisterOut])
async def list_registers(auth: AuthContext = Depends(perm("pos.session.read"))) -> list[RegisterOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_REGISTERS + " order by r.is_default desc, r.code")
    return [_register(r) for r in rows]


@router.post("/registers", response_model=RegisterOut, status_code=status.HTTP_201_CREATED)
async def create_register(body: RegisterIn, auth: AuthContext = Depends(perm("pos.register.manage"))) -> RegisterOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            rid = await conn.fetchval(
                """insert into pos_registers (tenant_id, code, name, payment_methods, cash_rounding_minor,
                                              max_variance_minor)
                   values ($1, $2, $3, $4, $5, $6) returning id""",
                auth.tenant_id, body.code, body.name, body.payment_methods, body.cash_rounding_minor,
                body.max_variance_minor)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Register code {body.code} is taken")
        return _register(await conn.fetchrow(_REGISTERS + " where r.id = $1", rid))


@router.patch("/registers/{register_id}", response_model=RegisterOut)
async def update_register(register_id: str, body: RegisterUpdate,
                          auth: AuthContext = Depends(perm("pos.register.manage"))) -> RegisterOut:
    fields = body.model_dump(exclude_unset=True)
    async with db.tenant_conn(auth.tenant_id) as conn:
        cur = await pos_sessions.register(conn, register_id)
        if fields.get("active") is False and cur["is_default"]:
            raise HTTPException(status.HTTP_409_CONFLICT, "The default register can't be switched off")
        if fields:
            sets = ", ".join(f"{k} = ${i}" for i, k in enumerate(fields, 2))
            # Offline tills reload their settings when config_version moves (3D).
            await conn.execute(
                f"update pos_registers set {sets}, config_version = config_version + 1, updated_at = now() where id = $1",
                register_id, *fields.values())
        return _register(await conn.fetchrow(_REGISTERS + " where r.id = $1", register_id))


# ── Devices ─────────────────────────────────────────────────────────────────
class DeviceIn(BaseModel):
    register_id: UUID
    device_code: str = Field(pattern=r"^[A-Z0-9]{1,6}$")
    name: str = Field(default="", max_length=60)


class HeartbeatIn(BaseModel):
    outbox_count: int = Field(ge=0, le=100000)
    oldest_pending_at: datetime | None = None


class DeviceOut(BaseModel):
    id: str
    register_id: str
    device_code: str
    name: str
    last_seen_at: datetime | None
    outbox_count: int
    oldest_pending_at: datetime | None


class DeviceCreated(DeviceOut):
    token: str      # shown once: the device keeps it; only its hash is stored


def _device(r: asyncpg.Record) -> DeviceOut:
    return DeviceOut(id=str(r["id"]), register_id=str(r["register_id"]), device_code=r["device_code"], name=r["name"],
                     last_seen_at=r["last_seen_at"], outbox_count=r["outbox_count"],
                     oldest_pending_at=r["oldest_pending_at"])


@router.get("/devices", response_model=list[DeviceOut])
async def list_devices(register_id: str | None = None,
                       auth: AuthContext = Depends(perm("pos.session.read"))) -> list[DeviceOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            "select * from pos_devices where ($1::uuid is null or register_id = $1) and active order by device_code",
            register_id)
    return [_device(r) for r in rows]


@router.post("/devices", response_model=DeviceCreated, status_code=status.HTTP_201_CREATED)
async def add_device(body: DeviceIn, auth: AuthContext = Depends(perm("pos.register.manage"))) -> DeviceCreated:
    token = new_session_token()
    async with db.tenant_conn(auth.tenant_id) as conn:
        reg = await pos_sessions.register(conn, body.register_id)
        try:
            row = await conn.fetchrow(
                """insert into pos_devices (tenant_id, register_id, branch_id, device_code, name, token_hash)
                   values ($1, $2, $3, $4, $5, $6) returning *""",
                auth.tenant_id, body.register_id, reg["branch_id"], body.device_code, body.name, hash_token(token))
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Device code {body.device_code} is taken on this register")
    return DeviceCreated(**_device(row).model_dump(), token=token)


@router.post("/devices/{device_id}/heartbeat", response_model=DeviceOut)
async def heartbeat(device_id: str, body: HeartbeatIn,
                    x_device_token: str | None = Header(default=None, alias="X-Device-Token"),
                    auth: AuthContext = Depends(perm("pos.sale.create"))) -> DeviceOut:
    """The till says it's alive and how many sales it still holds. Only the
    device itself, with its own token, may say so."""
    if not x_device_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This device's token is missing")
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """update pos_devices set last_seen_at = now(), outbox_count = $2,
                                      oldest_pending_at = case when $2 > 0 then $3::timestamptz end
                where id = $1 and token_hash = $4 returning *""",
            device_id, body.outbox_count, body.oldest_pending_at, hash_token(x_device_token))
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This device isn't registered with that token")
    return _device(row)


# ── Sessions ────────────────────────────────────────────────────────────────
class SessionOpen(BaseModel):
    register_id: UUID | None = None
    opening_float_minor: int = Field(default=0, ge=0)


class MethodFigures(BaseModel):
    method: str
    taken_minor: int
    refunds_minor: int
    expected_minor: int
    counted_minor: int | None
    variance_minor: int | None


class SessionOut(BaseModel):
    id: str
    register_id: str
    register_code: str
    register_name: str
    status: str
    opened_at: datetime
    opened_by: str | None
    closed_at: datetime | None
    closed_by: str | None
    opening_float_minor: int
    methods: list[MethodFigures]
    pay_in_minor: int
    pay_out_minor: int
    drop_minor: int
    variance_approved_by: str | None
    notes: str
    warnings: list[str]


class SessionClose(BaseModel):
    counted: dict[TenderMethod, int] = Field(default_factory=dict)
    notes: str = Field(default="", max_length=1000)
    device_id: UUID | None = None
    approver_id: UUID | None = None
    approver_pin: str | None = Field(default=None, pattern=r"^\d{6}$")


class CashMoveIn(BaseModel):
    kind: CashMoveKind
    amount_minor: int = Field(gt=0, le=10**12)
    reason: str = Field(min_length=1, max_length=200)


class PinIn(BaseModel):
    # Approval PINs are six digits (security review of 0076).
    pin: str = Field(pattern=r"^\d{6}$")


async def _session(conn: asyncpg.Connection, session_id: str) -> asyncpg.Record:
    row: asyncpg.Record | None = await conn.fetchrow("select * from pos_sessions where id = $1", session_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return row


async def open_session(conn: asyncpg.Connection, auth: AuthContext, register_id: Any, float_minor: int) -> asyncpg.Record:
    reg = await pos_sessions.register(conn, register_id)
    if not reg["active"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "This register is switched off")
    try:
        row: asyncpg.Record = await conn.fetchrow(
            """insert into pos_sessions (tenant_id, register_id, opened_by, opening_float_minor)
               values ($1, $2, $3, $4) returning *""", auth.tenant_id, reg["id"], auth.user_id, float_minor)
    except asyncpg.UniqueViolationError:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"{reg['name']} already has an open session: close it before starting a new one.")
    return row


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(register_id: str | None = None, status_filter: str | None = Query(None, alias="status"),
                        limit: int = Query(30, ge=1, le=200),
                        auth: AuthContext = Depends(perm("pos.session.read"))) -> list[SessionOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select * from pos_sessions where ($1::uuid is null or register_id = $1) and ($2::text is null or status = $2)
                order by opened_at desc limit $3""", register_id, status_filter, limit)
        return [SessionOut(**await pos_sessions.session_out(conn, r)) for r in rows]


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def start_session(body: SessionOpen, auth: AuthContext = Depends(perm("pos.session.open"))) -> SessionOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await open_session(conn, auth, body.register_id, body.opening_float_minor)
        return SessionOut(**await pos_sessions.session_out(conn, row))


@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session(session_id: str, auth: AuthContext = Depends(perm("pos.session.read"))) -> SessionOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return SessionOut(**await pos_sessions.session_out(conn, await _session(conn, session_id)))


@router.post("/sessions/{session_id}/cash-moves", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def cash_move(session_id: str, body: CashMoveIn,
                    x_cashier_token: str | None = Header(default=None, alias="X-Cashier-Token"),
                    auth: AuthContext = Depends(perm("pos.cash.move"))) -> SessionOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        s = await _session(conn, session_id)
        if s["status"] != "open":
            raise HTTPException(status.HTTP_409_CONFLICT, "This session is closed")
        await conn.execute(
            """insert into pos_cash_moves (tenant_id, session_id, kind, amount_minor, reason, user_id, employee_id)
               values ($1, $2, $3, $4, $5, $6, $7)""",
            auth.tenant_id, session_id, body.kind, body.amount_minor, body.reason, auth.user_id,
            await cashiers.employee_for(conn, x_cashier_token))
        return SessionOut(**await pos_sessions.session_out(conn, s))


@router.post("/sessions/{session_id}/close", response_model=SessionOut)
async def close_session(session_id: str, body: SessionClose,
                        auth: AuthContext = Depends(perm("pos.session.close"))) -> SessionOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        closed, warnings = await pos_sessions.close(
            conn, auth, session_id, {k: v for k, v in body.counted.items()}, body.notes, body.device_id,
            body.approver_id, body.approver_pin)
        out = await pos_sessions.session_out(conn, closed)
    out["warnings"] = warnings
    return SessionOut(**out)


@router.get("/sessions/{session_id}/z-report")
async def z_report(session_id: str, auth: AuthContext = Depends(perm("pos.session.read"))) -> dict[str, Any]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await pos_sessions.z_report(conn, await _session(conn, session_id))


@router.put("/pin", status_code=status.HTTP_204_NO_CONTENT)
async def set_my_pin(body: PinIn, auth: AuthContext = Depends(perm("pos.session.read"))) -> Response:
    """Your own till PIN: what you enter to approve at a till."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        await conn.execute("update users set pos_pin_hash = $2 where id = $1", auth.user_id, hash_password(body.pin))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


ApprovalKey = Literal["pos.sale.discount", "pos.price.override", "pos.session.approve"]


class Approver(BaseModel):
    user_id: str
    name: str


@router.get("/approvers", response_model=list[Approver])
async def approvers(need: ApprovalKey, auth: AuthContext = Depends(perm("pos.sale.create"))) -> list[Approver]:
    """Who can approve `need` at a till: holds the key and has set a till PIN.
    Names only; the PIN is checked on the action itself."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select id, role_id, name from users
                where status = 'active' and pos_pin_hash is not null order by name""")
        return [Approver(user_id=str(r["id"]), name=r["name"]) for r in rows
                if need in await rbac.effective_permissions(conn, auth.tenant_id, r["role_id"], str(r["id"]))]
