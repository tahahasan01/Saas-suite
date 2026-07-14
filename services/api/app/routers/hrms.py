"""HRMS — employees, attendance (web check-in/out + anti-fraud flag), leave.
Guarded by the 'hrms' section. Mobile face-match/biometric plug into attendance later."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from datetime import date

from .. import db, payroll
from ..deps import AuthContext
from ..models import (
    AttendanceOut,
    CheckInRequest,
    EmployeeCreate,
    EmployeeOut,
    EmployeeUpdate,
    HrmsSummary,
    LeaveCreate,
    LeaveOut,
    PayrollOut,
    Payslip,
)
from ..rbac import require

WORKING_DAYS = 26

router = APIRouter(prefix="/hrms", tags=["hrms"])


def _emp(r) -> EmployeeOut:
    return EmployeeOut(
        id=str(r["id"]), name=r["name"], email=r["email"], phone=r["phone"], cnic=r["cnic"],
        designation=r["designation"], department=r["department"], join_date=r["join_date"],
        salary_minor=r["salary_minor"], status=r["status"],
        # Absent from the list query (create/update return the bare row) → default False.
        present_today=bool(r["present_today"]) if "present_today" in r.keys() else False)


def _att(r) -> AttendanceOut:
    return AttendanceOut(
        id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"],
        work_date=r["work_date"], check_in=r["check_in"], check_out=r["check_out"],
        status=r["status"], method=r["method"], fraud_flag=r["fraud_flag"])


# ── Employees ───────────────────────────────────────────────────────────────
@router.get("/employees", response_model=list[EmployeeOut])
async def list_employees(auth: AuthContext = Depends(require("hrms", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select e.*, (a.check_in is not null) as present_today
                 from hrms_employees e
                 left join hrms_attendance a
                   on a.employee_id = e.id and a.work_date = current_date
                where e.status = 'active' order by e.name""")
    return [_emp(r) for r in rows]


@router.post("/employees", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
async def create_employee(body: EmployeeCreate, auth: AuthContext = Depends(require("hrms", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """insert into hrms_employees (tenant_id, name, email, phone, cnic, designation, department, join_date, salary_minor)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *""",
            auth.tenant_id, body.name, body.email, body.phone, body.cnic, body.designation,
            body.department, body.join_date, body.salary_minor)
    return _emp(row)


@router.patch("/employees/{employee_id}", response_model=EmployeeOut)
async def update_employee(employee_id: str, body: EmployeeUpdate, auth: AuthContext = Depends(require("hrms", "write"))):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    async with db.tenant_conn(auth.tenant_id) as conn:
        cols = ", ".join(f"{k}=${i+2}" for i, k in enumerate(fields))
        row = await conn.fetchrow(f"update hrms_employees set {cols} where id=$1 returning *", employee_id, *fields.values())
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    return _emp(row)


# ── Attendance ──────────────────────────────────────────────────────────────
_ATT_SELECT = """select a.*, e.name as employee_name from hrms_attendance a
                 join hrms_employees e on e.id = a.employee_id"""


@router.post("/attendance/checkin", response_model=AttendanceOut)
async def check_in(body: CheckInRequest, auth: AuthContext = Depends(require("hrms", "write"))):
    flag = "mock_gps" if body.mock_gps else ""
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("select 1 from hrms_employees where id=$1", body.employee_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
        row = await conn.fetchrow(
            """insert into hrms_attendance (tenant_id, employee_id, check_in, status, method, lat, lng, fraud_flag)
               values ($1,$2, now(),
                       case when extract(hour from now()) >= 10 then 'late' else 'present' end, $3,$4,$5,$6)
               on conflict (employee_id, work_date) do update set
                 check_in = coalesce(hrms_attendance.check_in, excluded.check_in),
                 method = excluded.method, lat = excluded.lat, lng = excluded.lng,
                 fraud_flag = excluded.fraud_flag,
                 status = case when extract(hour from now()) >= 10 then 'late' else 'present' end
               returning id""",
            auth.tenant_id, body.employee_id, body.method, body.lat, body.lng, flag)
        rec = await conn.fetchrow(_ATT_SELECT + " where a.id=$1", row["id"])
    return _att(rec)


@router.post("/attendance/checkout", response_model=AttendanceOut)
async def check_out(body: CheckInRequest, auth: AuthContext = Depends(require("hrms", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            "update hrms_attendance set check_out=now() where employee_id=$1 and work_date=current_date returning id",
            body.employee_id)
        if row is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "No check-in recorded today")
        rec = await conn.fetchrow(_ATT_SELECT + " where a.id=$1", row["id"])
    return _att(rec)


@router.get("/attendance", response_model=list[AttendanceOut])
async def list_attendance(on: str | None = None, auth: AuthContext = Depends(require("hrms", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        if on:
            rows = await conn.fetch(_ATT_SELECT + " where a.work_date=$1 order by e.name", on)
        else:
            rows = await conn.fetch(_ATT_SELECT + " where a.work_date=current_date order by e.name")
    return [_att(r) for r in rows]


# ── Leave ───────────────────────────────────────────────────────────────────
_LEAVE_SELECT = """select l.*, e.name as employee_name from hrms_leave_requests l
                   join hrms_employees e on e.id = l.employee_id"""


def _leave(r) -> LeaveOut:
    return LeaveOut(
        id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"],
        leave_type=r["leave_type"], from_date=r["from_date"], to_date=r["to_date"],
        reason=r["reason"], status=r["status"])


@router.get("/leave", response_model=list[LeaveOut])
async def list_leave(auth: AuthContext = Depends(require("hrms", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_LEAVE_SELECT + " order by l.created_at desc")
    return [_leave(r) for r in rows]


@router.post("/leave", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
async def create_leave(body: LeaveCreate, auth: AuthContext = Depends(require("hrms", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rid = await conn.fetchval(
            """insert into hrms_leave_requests (tenant_id, employee_id, leave_type, from_date, to_date, reason)
               values ($1,$2,$3,$4,$5,$6) returning id""",
            auth.tenant_id, body.employee_id, body.leave_type, body.from_date, body.to_date, body.reason)
        rec = await conn.fetchrow(_LEAVE_SELECT + " where l.id=$1", rid)
    return _leave(rec)


@router.post("/leave/{leave_id}/{decision}", response_model=LeaveOut)
async def decide_leave(leave_id: str, decision: str, auth: AuthContext = Depends(require("hrms", "write"))):
    if decision not in ("approve", "reject"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "decision must be approve or reject")
    new_status = "approved" if decision == "approve" else "rejected"
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            "update hrms_leave_requests set status=$1, decided_by=$2 where id=$3 returning id",
            new_status, auth.user_id, leave_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found")
        rec = await conn.fetchrow(_LEAVE_SELECT + " where l.id=$1", leave_id)
    return _leave(rec)


@router.get("/summary", response_model=HrmsSummary)
async def summary(auth: AuthContext = Depends(require("hrms", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """select
                 (select count(*) from hrms_employees where status='active') as headcount,
                 (select count(*) from hrms_attendance where work_date=current_date and check_in is not null) as present,
                 (select count(*) from hrms_leave_requests where status='approved'
                    and current_date between from_date and to_date) as on_leave,
                 (select count(*) from hrms_leave_requests where status='pending') as pending""")
    return HrmsSummary(headcount=row["headcount"], present_today=row["present"],
                       on_leave_today=row["on_leave"], pending_leaves=row["pending"])


@router.get("/payroll", response_model=PayrollOut)
async def run_payroll(month: str | None = None, auth: AuthContext = Depends(require("hrms", "read"))):
    """Monthly payslips: gross − absence deduction − FBR tax. `month` = YYYY-MM."""
    m = month or date.today().strftime("%Y-%m")
    try:
        first = date.fromisoformat(f"{m}-01")
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "month must be YYYY-MM")
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select e.id, e.name, e.salary_minor,
                      count(a.id) filter (where a.check_in is not null) as present,
                      count(a.id) filter (where a.status = 'absent') as absent
               from hrms_employees e
               left join hrms_attendance a on a.employee_id = e.id
                    and a.work_date >= $1::date and a.work_date < ($1::date + interval '1 month')
               where e.status = 'active'
               group by e.id, e.name, e.salary_minor order by e.name""",
            first)
    slips = []
    for r in rows:
        gross = r["salary_minor"]
        per_day = gross / WORKING_DAYS if WORKING_DAYS else 0
        deduction = round(r["absent"] * per_day)
        tax = payroll.monthly_tax_minor(gross)
        slips.append(Payslip(
            employee_id=str(r["id"]), name=r["name"], gross_minor=gross,
            present_days=r["present"], absent_days=r["absent"],
            absence_deduction_minor=deduction, tax_minor=tax,
            net_minor=max(0, gross - deduction - tax)))
    return PayrollOut(month=m, working_days=WORKING_DAYS, payslips=slips)
