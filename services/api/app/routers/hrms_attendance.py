"""Attendance v2 (checklist 3F, migration 0066, D-43): the portal's own
punches through the server-side geofence, shift auto check-out policy, and
correction requests decided by the employee's manager or HR."""
from __future__ import annotations

from typing import Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from .. import attendance, db, geofence, hrorg, leave, ratelimit
from ..deps import AuthContext, current_auth, current_employee
from ..models import (
    ApprovalsOut,
    AttendanceOut,
    CorrectionCreate,
    CorrectionOut,
    CorrectionStatus,
    Decision,
    PunchOut,
    PunchRequest,
    ShiftOut,
    ShiftPolicyUpdate,
)
from ..rbac import perm
from .hrms import _ATT_SELECT, _att, _shift_out

router = APIRouter(prefix="/hrms", tags=["hrms-attendance"])
portal = APIRouter(prefix="/me", tags=["portal"])


# ── Shift policy ────────────────────────────────────────────────────────────
@router.patch("/shifts/{shift_id}/policy", response_model=ShiftOut)
async def update_shift_policy(shift_id: str, body: ShiftPolicyUpdate,
                              auth: AuthContext = Depends(perm("hrms.shift.manage"))) -> ShiftOut:
    """Auto check-out and overtime threshold. Like the rest of a shift's
    rules they move pay, so this is hrms admin (hrms.shift.manage)."""
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    cols = ", ".join(f"{k}=${i + 2}" for i, k in enumerate(fields))
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(f"update hrms_shifts set {cols} where id=$1 returning *", shift_id, *fields.values())
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not found")
    return _shift_out(row)


# ── The portal's own punches (geofenced) ────────────────────────────────────
async def site_for(conn: asyncpg.Connection, employee_id: str) -> tuple[geofence.Site | None, str | None]:
    """The employee's work location as a geofence site, and its id."""
    r = await conn.fetchrow(
        """select l.id, l.name, l.lat, l.lng, l.radius_m, l.geo_mode, l.ip_mode,
                  array(select c::text from unnest(l.allowed_cidrs) c) as cidrs
             from hrms_employees e join hrms_locations l on l.id = e.location_id
            where e.id = $1 and l.active""", employee_id)
    if r is None:
        return None, None
    return geofence.Site(name=r["name"], lat=r["lat"], lng=r["lng"], radius_m=r["radius_m"],
                         allowed_cidrs=list(r["cidrs"]), geo_mode=r["geo_mode"], ip_mode=r["ip_mode"]), str(r["id"])


async def _self_punch(request: Request, auth: AuthContext, employee_id: str, body: PunchRequest,
                      kind: Literal["in", "out", "toggle"]) -> PunchOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        # One punch per employee at a time (attendance.punch takes the same lock).
        await conn.execute("select 1 from hrms_employees where id=$1 for update", employee_id)
        site, location_id = await site_for(conn, employee_id)
        v = geofence.check(site, lat=body.lat, lng=body.lng, accuracy_m=body.accuracy_m,
                           ip=ratelimit.client_ip(request), mock_gps=body.mock_gps)
        if v.refusal:
            raise HTTPException(status.HTTP_403_FORBIDDEN, v.refusal)
        k = await attendance.next_kind(conn, employee_id) if kind == "toggle" else kind
        ev = attendance.Evidence(accuracy_m=body.accuracy_m, ip=ratelimit.client_ip(request),
                                 geo_status=v.geo_status, ip_status=v.ip_status,
                                 risk_flags=tuple(v.risk_flags), location_id=location_id)
        row_id = await attendance.punch(conn, employee_id, k, method="self", lat=body.lat, lng=body.lng,
                                        flag="mock_gps" if body.mock_gps else "", by=auth.user_id, evidence=ev)
        if row_id is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "No check-in recorded today")
        rec = await conn.fetchrow(_ATT_SELECT + " where a.id=$1", row_id)
    return PunchOut(kind=k, attendance=_att(rec), geo_status=v.geo_status, ip_status=v.ip_status)


@portal.post("/attendance/punch", response_model=PunchOut, status_code=status.HTTP_201_CREATED)
async def my_punch(request: Request, body: PunchRequest | None = None,
                   auth: AuthContext = Depends(current_auth),
                   employee_id: str = Depends(current_employee)) -> PunchOut:
    """Check in, or out if checked in. Send what the browser's Geolocation
    API reported; the server decides against the work location (D-43)."""
    return await _self_punch(request, auth, employee_id, body or PunchRequest(), "toggle")


@portal.post("/attendance/checkin", response_model=AttendanceOut, status_code=status.HTTP_201_CREATED)
async def my_checkin(request: Request, body: PunchRequest | None = None,
                     auth: AuthContext = Depends(current_auth),
                     employee_id: str = Depends(current_employee)) -> AttendanceOut:
    return (await _self_punch(request, auth, employee_id, body or PunchRequest(), "in")).attendance


@portal.post("/attendance/checkout", response_model=AttendanceOut)
async def my_checkout(request: Request, body: PunchRequest | None = None,
                      auth: AuthContext = Depends(current_auth),
                      employee_id: str = Depends(current_employee)) -> AttendanceOut:
    return (await _self_punch(request, auth, employee_id, body or PunchRequest(), "out")).attendance


# ── Correction requests ─────────────────────────────────────────────────────
_CORR_SELECT = """select c.*, e.name as employee_name from hrms_attendance_corrections c
                  join hrms_employees e on e.id = c.employee_id"""


def _corr(r: asyncpg.Record) -> CorrectionOut:
    return CorrectionOut(
        id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"],
        work_date=r["work_date"], requested_in=r["requested_in"], requested_out=r["requested_out"],
        reason=r["reason"], status=r["status"], decided_by=str(r["decided_by"]) if r["decided_by"] else None,
        decided_at=r["decided_at"], decision_note=r["decision_note"], created_at=r["created_at"])


@portal.post("/attendance/corrections", response_model=CorrectionOut, status_code=status.HTTP_201_CREATED)
async def request_correction(body: CorrectionCreate, auth: AuthContext = Depends(current_auth),
                             employee_id: str = Depends(current_employee)) -> CorrectionOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        if body.requested_in is None and not await conn.fetchval(
                "select 1 from hrms_punches where employee_id=$1 and work_date=$2 and kind='in'",
                employee_id, body.work_date):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "There's no check-in that day. Give the check-in time too.")
        try:
            cid = await conn.fetchval(
                """insert into hrms_attendance_corrections (tenant_id, employee_id, work_date, requested_in,
                                                            requested_out, reason, requested_by)
                   values ($1,$2,$3,$4,$5,btrim($6),$7) returning id""",
                auth.tenant_id, employee_id, body.work_date, body.requested_in, body.requested_out,
                body.reason, auth.user_id)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                "There's already a correction waiting for that day.") from None
        return _corr(await conn.fetchrow(_CORR_SELECT + " where c.id=$1", cid))


@portal.get("/attendance/corrections", response_model=list[CorrectionOut])
async def my_corrections(auth: AuthContext = Depends(current_auth),
                         employee_id: str = Depends(current_employee)) -> list[CorrectionOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_CORR_SELECT + " where c.employee_id=$1 order by c.created_at desc limit 100",
                                employee_id)
    return [_corr(r) for r in rows]


@router.get("/attendance/corrections", response_model=list[CorrectionOut])
async def list_corrections(wanted: CorrectionStatus | None = Query(default=None, alias="status"),
                           auth: AuthContext = Depends(perm("hrms.attendance.read"))) -> list[CorrectionOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            _CORR_SELECT + " where ($1::text is null or c.status = $1) order by c.created_at desc limit 200", wanted)
    return [_corr(r) for r in rows]


@router.post("/attendance/corrections/{correction_id}/{decision}", response_model=CorrectionOut)
async def decide_correction(correction_id: str, decision: str, body: Decision | None = None,
                            auth: AuthContext = Depends(current_auth)) -> CorrectionOut:
    """The employee's manager, or anyone holding hrms.attendance.approve,
    decides — never the employee or whoever filed it (TR-SEC-33). Only a
    pending request can be decided. Approval appends `correction` punches
    and re-derives the day; a payroll-locked day can't be corrected."""
    if decision not in ("approve", "reject"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "decision must be approve or reject")
    note = (body or Decision()).note
    async with db.tenant_conn(auth.tenant_id) as conn:
        c = await conn.fetchrow("select * from hrms_attendance_corrections where id=$1 for update", correction_id)
        if c is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Correction not found")
        await hrorg.approver_role(conn, auth, str(c["employee_id"]), requested_by=c["requested_by"],
                                  key="hrms.attendance.approve")
        if c["status"] != "pending":
            raise HTTPException(status.HTTP_409_CONFLICT, f"This request was already {c['status']}.")
        await conn.execute("select 1 from hrms_employees where id=$1 for update", c["employee_id"])
        if decision == "approve":
            if await conn.fetchval("select locked from hrms_attendance where employee_id=$1 and work_date=$2",
                                   c["employee_id"], c["work_date"]):
                raise HTTPException(status.HTTP_409_CONFLICT,
                                    "That day is in a locked payroll run and can't be corrected.")
            for kind, at in (("in", c["requested_in"]), ("out", c["requested_out"])):
                if at is not None:
                    await conn.execute(
                        """insert into hrms_punches (tenant_id, employee_id, at, kind, work_date, method, created_by)
                           values ($1,$2,$3,$4,$5,'correction',$6)""",
                        c["tenant_id"], c["employee_id"], at, kind, c["work_date"], auth.user_id)
            await attendance.rederive(conn, c["tenant_id"], c["employee_id"], c["work_date"])
        await conn.execute(
            """update hrms_attendance_corrections set status=$2, decided_by=$3, decided_at=now(), decision_note=$4
                where id=$1""",
            correction_id, "approved" if decision == "approve" else "rejected", auth.user_id, note)
        return _corr(await conn.fetchrow(_CORR_SELECT + " where c.id=$1", correction_id))


async def team_corrections(conn: asyncpg.Connection, user_id: str) -> list[CorrectionOut]:
    """Pending corrections from the caller's direct reports (their inbox)."""
    rows = await conn.fetch(
        _CORR_SELECT + """ join hrms_employees m on m.id = e.manager_id
                           where c.status = 'pending' and m.user_id = $1 order by c.created_at""", user_id)
    return [_corr(r) for r in rows]


@portal.get("/approvals", response_model=ApprovalsOut)
async def my_approvals(auth: AuthContext = Depends(current_auth)) -> ApprovalsOut:
    """A manager's inbox: their direct reports' pending corrections and leave
    at the manager step. Any login may ask; someone with no reports gets an
    empty inbox."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        # The reporting link alone grants nothing: no approve key, no inbox.
        corrections = (await team_corrections(conn, auth.user_id)
                       if await hrorg.holds_hr(conn, auth, "hrms.attendance.approve") else [])
        requests = (await leave.team_pending(conn, auth.user_id)
                    if await hrorg.holds_hr(conn, auth, "hrms.leave.approve") else [])
    return ApprovalsOut(corrections=corrections, leave=requests)
