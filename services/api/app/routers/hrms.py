"""HRMS — employees, attendance, leave, the working-day calendar, and payroll.
Guarded by the 'hrms' section. Mobile face-match/biometric plug into attendance later."""
from __future__ import annotations

import calendar
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status

from datetime import date, datetime, timedelta

from .. import attendance, audit, db, email, hrorg, payroll, refs
from ..deps import AuthContext, current_auth, current_employee
from ..models import (
    AttendanceOut,
    CheckInRequest,
    EmployeeCreate,
    EmployeeOut,
    EmployeeUpdate,
    HolidayCreate,
    HolidayOut,
    HrmsSummary,
    LeaveBalance,
    LeaveCreate,
    LeaveOut,
    LeavePolicyOut,
    LeavePolicyUpdate,
    PayrollOut,
    Payslip,
    RequestType,
    ShiftAssign,
    ShiftAssignmentOut,
    ShiftCreate,
    ShiftOut,
    WeekOut,
    WeekRow,
)
from ..rbac import holds, perm, require, require_key

router = APIRouter(prefix="/hrms", tags=["hrms"])

# Absence is derived from evidence, not from a status field: a working day with
# no check-in and no approved leave. The previous query counted
# `attendance.status = 'absent'`, which no code path ever wrote, so the
# deduction was structurally always zero.
#
# $1 = first day of the month, $2 = the tenant's weekly rest days (ISO dow).
_PAYROLL = """
with working_days as (
  select d::date as day
    from generate_series($1::date,
                         ($1::date + interval '1 month' - interval '1 day')::date,
                         interval '1 day') d
   where not (extract(dow from d)::int = any($2::int[]))
     and not exists (select 1 from hrms_holidays h where h.holiday_date = d::date)
)
select e.id, e.name, e.salary_minor,
       -- Per-day pay divides by the whole month's working days …
       (select count(*) from working_days) as month_days,
       -- … and only *completed* working days can be judged: `< current_date`,
       -- never `<=`, or everyone is absent until they clock in this morning.
       -- The created_at floor matters too — without it a business that signs up
       -- mid-month sees staff docked for days before the system existed.
       (select count(*) from working_days w
         where w.day < current_date
           and w.day >= greatest(coalesce(e.join_date, e.created_at::date), e.created_at::date)
       ) as elapsed_days,
       -- A check-in is presence unless the shift's thresholds derived the
       -- day as an absence (worked under absent_below_min, 0045).
       (select count(distinct a.work_date) from hrms_attendance a
         where a.employee_id = e.id and a.check_in is not null and a.status <> 'absent'
           and a.work_date in (select day from working_days)) as present_days,
       -- Half days cost half a day, unless approved leave or WFH covers them.
       (select count(distinct a.work_date) from hrms_attendance a
         where a.employee_id = e.id and a.status = 'half_day'
           and a.work_date in (select day from working_days)
           and not exists (select 1 from hrms_leave_requests l
                            where l.employee_id = e.id and l.status = 'approved'
                              and a.work_date between l.from_date and l.to_date)) as half_days,
       (select count(*) from working_days w
         where w.day < current_date
           and exists (select 1 from hrms_leave_requests l
                        where l.employee_id = e.id and l.status = 'approved'
                          and l.request_type = 'leave' and l.leave_type <> 'unpaid'
                          and w.day between l.from_date and l.to_date)) as paid_leave_days,
       (select count(*) from working_days w
         where w.day < current_date
           and exists (select 1 from hrms_leave_requests l
                        where l.employee_id = e.id and l.status = 'approved'
                          and l.request_type = 'leave' and l.leave_type = 'unpaid'
                          and w.day between l.from_date and l.to_date)) as unpaid_leave_days,
       -- Approved WFH is time worked. It counts toward presence and is never
       -- deducted; the `request_type` filters above keep it out of leave.
       (select count(*) from working_days w
         where w.day < current_date
           and exists (select 1 from hrms_leave_requests l
                        where l.employee_id = e.id and l.status = 'approved'
                          and l.request_type = 'wfh'
                          and w.day between l.from_date and l.to_date)) as wfh_days
  from hrms_employees e
 where e.status = 'active'
 order by e.name
"""


def _mask_cnic(cnic: str) -> str:
    """Keep the shape and the last digit so HR can tell records apart
    (35202-1234567-3 -> *****-*******-3) without reading the number."""
    return "".join("*" if ch.isdigit() else ch for ch in cnic[:-1]) + cnic[-1:] if cnic else ""


def _emp(r, *, reveal: bool) -> EmployeeOut:
    """`reveal` = the caller holds payroll.salary.read, or this is their own
    record. Otherwise salary and CNIC are withheld (D-42, St03 §7.10)."""
    return EmployeeOut(
        id=str(r["id"]), name=r["name"], email=r["email"], phone=r["phone"],
        cnic=r["cnic"] if reveal else _mask_cnic(r["cnic"]),
        designation=r["designation"], department=r["department"], join_date=r["join_date"],
        salary_minor=r["salary_minor"] if reveal else None, status=r["status"],
        pay_masked=not reveal,
        # Absent from the list query (create/update return the bare row) → default False.
        present_today=bool(r["present_today"]) if "present_today" in r.keys() else False,
        has_login="user_id" in r.keys() and r["user_id"] is not None)


def _att(r) -> AttendanceOut:
    return AttendanceOut(
        id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"],
        work_date=r["work_date"], check_in=r["check_in"], check_out=r["check_out"],
        status=r["status"], method=r["method"], fraud_flag=r["fraud_flag"],
        late_min=r["late_min"], early_min=r["early_min"], worked_min=r["worked_min"],
        shift_id=str(r["shift_id"]) if r["shift_id"] else None, locked=r["locked"],
        missing_checkout=r["missing_checkout"],
        auto_closed=r["auto_closed"], overtime_min=r["overtime_min"], corrected=r["corrected"],
        geo_status=r["geo_status"], ip_status=r["ip_status"])


# ── Employees ───────────────────────────────────────────────────────────────
async def _sees_pay(conn, auth: AuthContext) -> bool:
    return await holds(conn, auth.role_id, "payroll.salary.read")


async def _guard_pay_write(conn, auth: AuthContext, salary_minor: int | None) -> None:
    # Setting pay is a payroll action; an HR clerk onboarding staff leaves it at 0.
    if salary_minor and not await holds(conn, auth.role_id, "payroll.salary.update"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires payroll.salary.update to set pay")


@router.get("/employees", response_model=list[EmployeeOut])
async def list_employees(auth: AuthContext = Depends(require("hrms", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        reveal = await _sees_pay(conn, auth)
        rows = await conn.fetch(
            """select e.*, (a.check_in is not null) as present_today
                 from hrms_employees e
                 left join hrms_attendance a
                   on a.employee_id = e.id and a.work_date = current_date
                where e.status = 'active' order by e.name""")
    return [_emp(r, reveal=reveal) for r in rows]


@router.post("/employees", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
async def create_employee(body: EmployeeCreate, auth: AuthContext = Depends(require("hrms", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _guard_pay_write(conn, auth, body.salary_minor)
        reveal = await _sees_pay(conn, auth)
        row = await conn.fetchrow(
            """insert into hrms_employees (tenant_id, name, email, phone, cnic, designation, department, join_date, salary_minor)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *""",
            auth.tenant_id, body.name, body.email, body.phone, body.cnic, body.designation,
            body.department, body.join_date, body.salary_minor)
        # Org links (0065): set ones win; text-only department/designation is linked.
        await hrorg.apply_job(conn, str(row["id"]),
                              body.model_dump(include=set(hrorg.JOB_FIELDS), exclude_none=True))
        await hrorg.link_text(conn)
        row = await conn.fetchrow("select * from hrms_employees where id=$1", row["id"])
    return _emp(row, reveal=reveal)


async def _employee_role(conn, tenant_id: str) -> str:
    """The zero-permission role every portal login sits on. Created lazily and
    reused. No permissions rows means the RBAC guards 403 it out of every admin
    endpoint — the portal only reaches /me/*, which checks employee linkage."""
    role_id = await conn.fetchval(
        "select id from roles where tenant_id=$1 and name='Employee'", tenant_id)
    if role_id is None:
        role_id = await conn.fetchval(
            "insert into roles (tenant_id, name, is_system) values ($1,'Employee',true) returning id",
            tenant_id)
    return str(role_id)


@router.post("/employees/{employee_id}/invite", status_code=status.HTTP_204_NO_CONTENT)
async def invite_employee(employee_id: str, response: Response, background: BackgroundTasks,
                          auth: AuthContext = Depends(require("hrms", "admin"))) -> Response:
    """Give an employee their own self-service login. Sends an invite they accept
    to set a password — the same flow as team invites, on the Employee role."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        emp = await conn.fetchrow(
            "select email, name, user_id from hrms_employees where id=$1", employee_id)
        if emp is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
        if not emp["email"]:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "Add an email to this employee before inviting them.")
        if emp["user_id"]:
            raise HTTPException(status.HTTP_409_CONFLICT, "This employee already has a login.")
        if await conn.fetchval("select 1 from users where email=$1", emp["email"]):
            raise HTTPException(status.HTTP_409_CONFLICT, "That email already has an account.")
        role_id = await _employee_role(conn, auth.tenant_id)
        tenant_name = await conn.fetchval("select name from tenants where id=$1", auth.tenant_id)
        # Queued with the request, sent after commit (the outbox): a mail outage can't fail it.
        mail = await email.queue_invite(conn, auth.tenant_id, emp["email"], tenant_name, role_id,
                                        employee_id=employee_id)
    background.add_task(email.deliver_now, mail)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.patch("/employees/{employee_id}", response_model=EmployeeOut)
async def update_employee(employee_id: str, body: EmployeeUpdate, auth: AuthContext = Depends(require("hrms", "write"))):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    async with db.tenant_conn(auth.tenant_id) as conn:
        if "salary_minor" in fields and not await holds(conn, auth.role_id, "payroll.salary.update"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires payroll.salary.update to change pay")
        reveal = await _sees_pay(conn, auth)
        cols = ", ".join(f"{k}=${i+2}" for i, k in enumerate(fields))
        row = await conn.fetchrow(f"update hrms_employees set {cols} where id=$1 returning *", employee_id, *fields.values())
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
        # A department or designation typed as text re-points the link (0065).
        if {"department", "designation"} & fields.keys():
            await conn.execute(
                """update hrms_employees set
                     department_id = case when $2 then null else department_id end,
                     job_title_id  = case when $3 then null else job_title_id end
                    where id=$1""", employee_id, "department" in fields, "designation" in fields)
            await hrorg.link_text(conn)
            row = await conn.fetchrow("select * from hrms_employees where id=$1", employee_id)
    return _emp(row, reveal=reveal)


# ── Attendance ──────────────────────────────────────────────────────────────
_ATT_SELECT = """select a.*, e.name as employee_name from hrms_attendance a
                 join hrms_employees e on e.id = a.employee_id"""


async def _do_checkin(conn, employee_id: str, *, method: str, lat=None, lng=None, flag: str = "",
                      at: datetime | None = None, by: str | None = None):
    """The check-in write, shared by the admin action and an employee's own.

    `at` is the punch instant (now, unless a test freezes it). It is appended
    to the punch log and the day is re-derived from the log (D-43): the work
    day and lateness come from the employee's shift, or tenants.late_after
    without one, in the tenant's local time (D-11)."""
    row_id = await attendance.punch(conn, employee_id, "in", method=method, at=at,
                                    lat=lat, lng=lng, flag=flag, by=by)
    if row_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    return {"id": row_id}


async def _do_checkout(conn, employee_id: str, *, method: str = "web", at: datetime | None = None,
                       by: str | None = None):
    """None when there is no check-in on the punch's work day (then nothing is
    recorded). An overnight shift's morning check-out closes last night."""
    row_id = await attendance.punch(conn, employee_id, "out", method=method, at=at, by=by)
    return None if row_id is None else {"id": row_id}


@router.post("/attendance/checkin", response_model=AttendanceOut)
async def check_in(body: CheckInRequest, auth: AuthContext = Depends(require("hrms", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await _do_checkin(conn, body.employee_id, method=body.method, lat=body.lat, lng=body.lng,
                                flag="mock_gps" if body.mock_gps else "", by=auth.user_id)
        rec = await conn.fetchrow(_ATT_SELECT + " where a.id=$1", row["id"])
    return _att(rec)


@router.post("/attendance/checkout", response_model=AttendanceOut)
async def check_out(body: CheckInRequest, auth: AuthContext = Depends(require("hrms", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", body.employee_id)
        row = await _do_checkout(conn, body.employee_id, method=body.method, by=auth.user_id)
        if row is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "No check-in recorded today")
        rec = await conn.fetchrow(_ATT_SELECT + " where a.id=$1", row["id"])
    return _att(rec)


@router.get("/attendance", response_model=list[AttendanceOut])
async def list_attendance(on: date | None = None, auth: AuthContext = Depends(require("hrms", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        await attendance.finalise_open_days(conn)  # days that ended with nobody punching out
        if on:
            rows = await conn.fetch(_ATT_SELECT + " where a.work_date=$1 order by e.name", on)
        else:
            rows = await conn.fetch(_ATT_SELECT + " where a.work_date=current_date order by e.name")
    return [_att(r) for r in rows]


@router.get("/attendance/week", response_model=WeekOut)
async def attendance_week(auth: AuthContext = Depends(require("hrms", "read"))):
    """Last 7 days as a matrix: one derived status per employee per day.

    Derivation mirrors the payroll rules exactly — the matrix and the payslip
    must never disagree about the same day. In particular: today with no
    check-in is 'pending', not absent (the day isn't over), and WFH is its own
    state, never leave.
    """
    async with db.tenant_conn(auth.tenant_id) as conn:
        # One clock for the whole matrix: `started`, attendance dates and
        # "today" all come from the database, so a UTC/local split can't make an
        # employee created moments ago look absent yesterday.
        today = await conn.fetchval("select current_date")
        days = [today - timedelta(days=i) for i in range(6, -1, -1)]
        # Judge days that ended without a check-out first, exactly as payroll does.
        await attendance.finalise_open_days(conn)
        # `started` is floored at created_at exactly as payroll does — a
        # backdated join_date must not make someone "absent" for days before
        # the company was tracking them, or the grid and the payslip disagree.
        employees = await conn.fetch(
            """select id, name,
                      greatest(coalesce(join_date, created_at::date), created_at::date) as started
                 from hrms_employees where status='active' order by name""")
        att = {(r["employee_id"], r["work_date"]): r["status"] for r in await conn.fetch(
            "select employee_id, work_date, status from hrms_attendance where work_date >= $1", days[0])}
        leave = await conn.fetch(
            """select employee_id, request_type, from_date, to_date from hrms_leave_requests
                where status='approved' and to_date >= $1 and from_date <= $2""", days[0], today)
        holidays = {r["holiday_date"] for r in await conn.fetch(
            "select holiday_date from hrms_holidays where holiday_date between $1 and $2", days[0], today)}
        off_days = set(await conn.fetchval(
            "select weekly_off_days from tenants where id=$1", auth.tenant_id) or [0])

    on_leave = {(l["employee_id"], d): ("wfh" if l["request_type"] == "wfh" else "leave")
                for l in leave
                for d in days if l["from_date"] <= d <= l["to_date"]}

    def cell(emp, d: date) -> str:
        if d < emp["started"]:
            return "none"                      # before the company tracked them
        derived = att.get((emp["id"], d))
        if derived and derived != "absent":
            return derived                     # 'present' | 'late' | 'half_day'
        if (emp["id"], d) in on_leave:
            return on_leave[(emp["id"], d)]
        if d in holidays:
            return "holiday"
        if d.isoweekday() % 7 in off_days:     # ISO Mon=1..Sun=7 -> dow Sun=0
            return "off"
        if d == today and not derived:
            return "pending"                   # the day isn't over yet
        # No evidence, or a day too short to count (payroll agrees: such a
        # check-in is not presence).
        return "absent"

    return WeekOut(
        days=days,
        employees=[WeekRow(id=str(e["id"]), name=e["name"], cells=[cell(e, d) for d in days])
                   for e in employees])


# ── Shifts ──────────────────────────────────────────────────────────────────
# Defining the rules that decide late, half day and absence moves pay, so it
# is hrms admin; putting someone on a shift (rostering) is day-to-day HR work.
def _shift_out(r) -> ShiftOut:
    return ShiftOut(id=str(r["id"]), name=r["name"], start_time=r["start_time"], end_time=r["end_time"],
                    grace_in_min=r["grace_in_min"], grace_out_min=r["grace_out_min"],
                    half_day_below_min=r["half_day_below_min"], absent_below_min=r["absent_below_min"],
                    overnight=r["overnight"], active=r["active"],
                    auto_checkout=r["auto_checkout"], auto_checkout_after_min=r["auto_checkout_after_min"],
                    overtime_after_min=r["overtime_after_min"])


@router.get("/shifts", response_model=list[ShiftOut])
async def list_shifts(auth: AuthContext = Depends(perm("hrms.shift.read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select * from hrms_shifts order by name")
    return [_shift_out(r) for r in rows]


@router.post("/shifts", response_model=ShiftOut, status_code=status.HTTP_201_CREATED)
async def create_shift(body: ShiftCreate, auth: AuthContext = Depends(perm("hrms.shift.manage"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """insert into hrms_shifts (tenant_id, name, start_time, end_time, grace_in_min, grace_out_min,
                                        half_day_below_min, absent_below_min)
               values ($1,$2,$3,$4,$5,$6,$7,$8)
               on conflict (tenant_id, name) do nothing returning *""",
            auth.tenant_id, body.name, body.start_time, body.end_time, body.grace_in_min,
            body.grace_out_min, body.half_day_below_min, body.absent_below_min)
    if row is None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A shift named {body.name!r} already exists.")
    return _shift_out(row)


_ASSIGNMENT_SELECT = """select a.*, e.name as employee_name, s.name as shift_name
                          from hrms_shift_assignments a
                          join hrms_employees e on e.id = a.employee_id
                          join hrms_shifts s on s.id = a.shift_id"""


def _assignment(r) -> ShiftAssignmentOut:
    return ShiftAssignmentOut(id=str(r["id"]), employee_id=str(r["employee_id"]),
                              employee_name=r["employee_name"], shift_id=str(r["shift_id"]),
                              shift_name=r["shift_name"], date_from=r["date_from"], date_to=r["date_to"])


@router.post("/shifts/{shift_id}/assign", response_model=ShiftAssignmentOut,
             status_code=status.HTTP_201_CREATED)
async def assign_shift(shift_id: str, body: ShiftAssign,
                       auth: AuthContext = Depends(perm("hrms.shift.assign"))):
    """Put an employee on a shift from `date_from`. An open-ended assignment
    that started earlier is closed the day before; any other overlap is a 409,
    so a day never has two shifts. It applies to punches from then on — days
    already derived keep their derivation."""
    if body.date_to is not None and body.date_to < body.date_from:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "date_to cannot be before date_from")
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", body.employee_id)
        shift = await conn.fetchrow("select active from hrms_shifts where id=$1", shift_id)
        if shift is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not found")
        if not shift["active"]:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That shift is no longer in use.")
        # One roster change per employee at a time, in step with punches
        # (attendance.punch takes the same lock).
        await conn.execute("select 1 from hrms_employees where id=$1 for update", body.employee_id)
        # Everything that overlaps the new span, except an open-ended
        # assignment that started earlier — that one is closed below.
        clash = await conn.fetchrow(
            """select date_from, date_to from hrms_shift_assignments
                where employee_id=$1 and (date_to is null or date_to >= $2)
                  and ($3::date is null or date_from <= $3)
                  and not (date_from < $2 and date_to is null)
                limit 1""",
            body.employee_id, body.date_from, body.date_to)
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"Overlaps an existing assignment ({clash['date_from']} → "
                                f"{clash['date_to'] or 'open'}).")
        await conn.execute(
            """update hrms_shift_assignments set date_to = $2::date - 1
                where employee_id=$1 and date_from < $2 and date_to is null""",
            body.employee_id, body.date_from)
        aid = await conn.fetchval(
            """insert into hrms_shift_assignments (tenant_id, employee_id, shift_id, date_from, date_to, created_by)
               values ($1,$2,$3,$4,$5,$6) returning id""",
            auth.tenant_id, body.employee_id, shift_id, body.date_from, body.date_to, auth.user_id)
        rec = await conn.fetchrow(_ASSIGNMENT_SELECT + " where a.id=$1", aid)
    return _assignment(rec)


@router.get("/shift-assignments", response_model=list[ShiftAssignmentOut])
async def list_shift_assignments(employee_id: str | None = None,
                                 auth: AuthContext = Depends(perm("hrms.shift.read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            _ASSIGNMENT_SELECT + """ where ($1::uuid is null or a.employee_id = $1::uuid)
                                     order by e.name, a.date_from""", employee_id)
    return [_assignment(r) for r in rows]


# ── Leave ───────────────────────────────────────────────────────────────────
_LEAVE_SELECT = """select l.*, e.name as employee_name from hrms_leave_requests l
                   join hrms_employees e on e.id = l.employee_id"""


def _leave(r) -> LeaveOut:
    return LeaveOut(
        id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"],
        request_type=r["request_type"], leave_type=r["leave_type"], from_date=r["from_date"],
        to_date=r["to_date"], reason=r["reason"], status=r["status"])


@router.get("/leave", response_model=list[LeaveOut])
async def list_leave(request_type: RequestType | None = None,
                     auth: AuthContext = Depends(require("hrms", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            _LEAVE_SELECT + " where ($1::text is null or l.request_type = $1) order by l.created_at desc",
            request_type)
    return [_leave(r) for r in rows]


@router.post("/leave", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
async def create_leave(body: LeaveCreate, auth: AuthContext = Depends(require("hrms", "write"))):
    if body.to_date < body.from_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "to_date cannot be before from_date")
    # A WFH day is worked, so it carries no leave subtype — storing one would
    # let it be mistaken for unpaid leave and deducted.
    leave_type = "annual" if body.request_type == "wfh" else body.leave_type
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", body.employee_id)
        # One person cannot be in two states on the same day — a pending or
        # approved request already covering any of these dates blocks a new one.
        clash = await conn.fetchrow(
            """select from_date, to_date from hrms_leave_requests
                where employee_id=$1 and status in ('pending','approved')
                  and from_date <= $3 and to_date >= $2 limit 1""",
            body.employee_id, body.from_date, body.to_date)
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"Overlaps an existing request ({clash['from_date']} → {clash['to_date']}).")
        rid = await conn.fetchval(
            """insert into hrms_leave_requests (tenant_id, employee_id, request_type, leave_type,
                                                from_date, to_date, reason)
               values ($1,$2,$3,$4,$5,$6,$7) returning id""",
            auth.tenant_id, body.employee_id, body.request_type, leave_type,
            body.from_date, body.to_date, body.reason)
        rec = await conn.fetchrow(_LEAVE_SELECT + " where l.id=$1", rid)
    return _leave(rec)


# Working days in a date range — same calendar the payroll uses (weekly off +
# holidays), so a Friday-to-Monday request costs 2 days, not 4.
_RANGE_DAYS = """
select count(*) from generate_series($1::date, $2::date, interval '1 day') d
 where not (extract(dow from d)::int = any($3::int[]))
   and not exists (select 1 from hrms_holidays h where h.holiday_date = d::date)
"""

# Approved working days per leave type within the calendar year, clamped to it.
_USED_BY_TYPE = """
select l.leave_type, coalesce(sum(wd.n), 0)::int as used
  from hrms_leave_requests l,
  lateral (
    select count(*) as n
      from generate_series(greatest(l.from_date, $2::date),
                           least(l.to_date, $3::date), interval '1 day') d
     where not (extract(dow from d)::int = any($4::int[]))
       and not exists (select 1 from hrms_holidays h where h.holiday_date = d::date)
  ) wd
 where l.employee_id = $1 and l.status = 'approved' and l.request_type = 'leave'
   and l.from_date <= $3::date and l.to_date >= $2::date
 group by l.leave_type
"""


_POLICY_SELECT = "select * from hrms_leave_policies where tenant_id=$1"


async def _policy(conn, tenant_id: str):
    """The tenant's leave policy, created with defaults on first use.

    Signup creates the row; this covers tenants from before that. Concurrent
    first uses race, so the insert is `on conflict do nothing` — a select-then-
    insert lets two requests both see "missing" and the loser 500s on the pkey.
    The re-select sees the winner's row: under READ COMMITTED a conflicting
    insert waits for the other transaction and each statement takes a fresh
    snapshot.
    """
    row = await conn.fetchrow(_POLICY_SELECT, tenant_id)
    if row is None:
        await conn.execute(
            "insert into hrms_leave_policies (tenant_id) values ($1) on conflict (tenant_id) do nothing",
            tenant_id)
        row = await conn.fetchrow(_POLICY_SELECT, tenant_id)
    return row


async def _balances(conn, tenant_id: str, employee_id: str) -> list[LeaveBalance]:
    policy = await _policy(conn, tenant_id)
    off = list(await conn.fetchval("select weekly_off_days from tenants where id=$1", tenant_id) or [0])
    today = await conn.fetchval("select current_date")  # the tenant's local day
    year_start = date(today.year, 1, 1)
    year_end = date(today.year, 12, 31)
    used = {r["leave_type"]: r["used"]
            for r in await conn.fetch(_USED_BY_TYPE, employee_id, year_start, year_end, off)}
    out = []
    for lt, quota in (("annual", policy["annual_days"]), ("sick", policy["sick_days"]),
                      ("casual", policy["casual_days"])):
        u = used.get(lt, 0)
        out.append(LeaveBalance(leave_type=lt, quota=quota, used=u, remaining=max(0, quota - u)))
    return out


@router.get("/leave/policy", response_model=LeavePolicyOut)
async def get_leave_policy(auth: AuthContext = Depends(require("hrms", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        p = await _policy(conn, auth.tenant_id)
    return LeavePolicyOut(annual_days=p["annual_days"], sick_days=p["sick_days"], casual_days=p["casual_days"])


@router.put("/leave/policy", response_model=LeavePolicyOut)
async def update_leave_policy(body: LeavePolicyUpdate,
                              auth: AuthContext = Depends(require("hrms", "admin"))):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _policy(conn, auth.tenant_id)
        cols = ", ".join(f"{k}=${i + 2}" for i, k in enumerate(fields))
        p = await conn.fetchrow(
            f"update hrms_leave_policies set {cols}, updated_at=now() where tenant_id=$1 returning *",
            auth.tenant_id, *fields.values())
    return LeavePolicyOut(annual_days=p["annual_days"], sick_days=p["sick_days"], casual_days=p["casual_days"])


@router.get("/leave/balances", response_model=list[LeaveBalance])
async def leave_balances(employee_id: str, auth: AuthContext = Depends(require("hrms", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _balances(conn, auth.tenant_id, employee_id)


@router.post("/leave/{leave_id}/{decision}", response_model=LeaveOut)
async def decide_leave(leave_id: str, decision: str,
                       auth: AuthContext = Depends(require("hrms", "admin"))):
    """Approval needs hrms:admin — with plain write, anyone who could request
    leave could approve their own (the audit's separation-of-duties finding)."""
    if decision not in ("approve", "reject"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "decision must be approve or reject")
    new_status: Literal["approved", "rejected"] = "approved" if decision == "approve" else "rejected"
    async with db.tenant_conn(auth.tenant_id) as conn:
        # Locked so two approvers can't both decide it.
        req = await conn.fetchrow("select * from hrms_leave_requests where id=$1 for update", leave_id)
        if req is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found")
        if req["status"] != "pending":
            raise HTTPException(status.HTTP_409_CONFLICT, f"This request was already {req['status']}.")
        # Decisions for one employee run one at a time: two requests that each
        # fit the remaining quota must not both pass the balance check below.
        await conn.execute("select 1 from hrms_employees where id=$1 for update", req["employee_id"])
        requester = await conn.fetchval(
            "select user_id from hrms_employees where id=$1", req["employee_id"])
        if requester is not None and str(requester) == auth.user_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                "You can't decide your own leave — another approver must.")

        # Quota applies to paid leave only: unpaid is already deducted from pay,
        # and WFH is worked time.
        if (decision == "approve" and req["request_type"] == "leave"
                and req["leave_type"] != "unpaid"):
            balance = next(b for b in await _balances(conn, auth.tenant_id, str(req["employee_id"]))
                           if b.leave_type == req["leave_type"])
            off = list(await conn.fetchval(
                "select weekly_off_days from tenants where id=$1", auth.tenant_id) or [0])
            requested = await conn.fetchval(_RANGE_DAYS, req["from_date"], req["to_date"], off)
            if requested > balance.remaining:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"That's {requested} working days of {req['leave_type']} leave, but only "
                    f"{balance.remaining} of {balance.quota} remain this year.")

        await conn.execute(
            "update hrms_leave_requests set status=$1, decided_by=$2 where id=$3",
            new_status, auth.user_id, leave_id)
        # The row diff is audited by trigger; the decision is a semantic event
        # and an entry on the request's timeline.
        await audit.track(conn, entity_type="leave_request", entity_id=leave_id, kind=new_status,
                          event=f"hrms.leave.{decision}")
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


# ── Holidays ────────────────────────────────────────────────────────────────
@router.get("/holidays", response_model=list[HolidayOut])
async def list_holidays(auth: AuthContext = Depends(require("hrms", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select * from hrms_holidays order by holiday_date")
    return [HolidayOut(id=str(r["id"]), holiday_date=r["holiday_date"], name=r["name"]) for r in rows]


@router.post("/holidays", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
async def create_holiday(body: HolidayCreate, auth: AuthContext = Depends(require("hrms", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """insert into hrms_holidays (tenant_id, holiday_date, name) values ($1,$2,$3)
               on conflict (tenant_id, holiday_date) do update set name = excluded.name
               returning *""",
            auth.tenant_id, body.holiday_date, body.name)
    return HolidayOut(id=str(row["id"]), holiday_date=row["holiday_date"], name=row["name"])


@router.delete("/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_holiday(holiday_id: str, response: Response,
                         auth: AuthContext = Depends(require("hrms", "write"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        # 404, not a silent 204, for an id this tenant can't see.
        if await conn.fetchval("delete from hrms_holidays where id=$1 returning id", holiday_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Holiday not found")
    # Must set the code on the injected response, as logout/read-all do —
    # returning it unset yields no status at all.
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


def _payslip(r, month_days: int, pay_date: date, ty: payroll.TaxYear) -> Payslip:
    gross = r["salary_minor"]
    unpaid = r["unpaid_leave_days"]
    wfh = r["wfh_days"]
    # Whatever is left once presence, approved leave and remote days are
    # accounted for. A WFH day someone also clocked in for is counted once:
    # accounted is capped at the days actually elapsed.
    accounted = min(r["elapsed_days"], r["present_days"] + r["paid_leave_days"] + unpaid + wfh)
    absent = max(0, r["elapsed_days"] - accounted)
    per_day = gross / month_days if month_days else 0
    half = r["half_days"]
    deduction = round((absent + unpaid + 0.5 * half) * per_day)
    tax = payroll.monthly_tax_minor(gross, pay_date)
    return Payslip(
        employee_id=str(r["id"]), name=r["name"], gross_minor=gross,
        present_days=r["present_days"], paid_leave_days=r["paid_leave_days"],
        unpaid_leave_days=unpaid, wfh_days=wfh, absent_days=absent, half_days=half,
        absence_deduction_minor=deduction, tax_minor=tax,
        net_minor=max(0, gross - deduction - tax),
        tax_year=ty.label, tax_rates_verified=ty.verified)


async def _compute_payroll(conn, tenant_id: str, month: str) -> PayrollOut:
    """Shared by the admin payroll run and an employee's own payslip — one code
    path, so a payslip a worker sees can never disagree with the run."""
    try:
        first = date.fromisoformat(f"{month}-01")
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "month must be YYYY-MM")
    off_days = await conn.fetchval("select weekly_off_days from tenants where id=$1", tenant_id)
    # A day derived while still open (a check-in, no check-out) must be judged
    # as over before it is counted, or a check-in alone earns a full day.
    await attendance.finalise_open_days(conn)
    rows = await conn.fetch(_PAYROLL, first, list(off_days or [0]))
    month_days = rows[0]["month_days"] if rows else 0
    # Salaries are paid for the month, so its last day decides the tax year.
    pay_date = first.replace(day=calendar.monthrange(first.year, first.month)[1])
    ty = payroll.tax_year_for(pay_date)
    return PayrollOut(month=month, working_days=month_days,
                      payslips=[_payslip(r, month_days, pay_date, ty) for r in rows],
                      tax_year=ty.label, tax_rates_verified=ty.verified)


@router.get("/payroll", response_model=PayrollOut)
async def run_payroll(month: str | None = None,
                      auth: AuthContext = Depends(require_key("payroll.run.read", "hrms"))):
    """Monthly payslips: gross − absence deduction − FBR tax. `month` = YYYY-MM.
    Everyone's pay is on it, so it needs a payroll key, not hrms:read (D-42)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        month = month or (await conn.fetchval("select current_date")).strftime("%Y-%m")
        return await _compute_payroll(conn, auth.tenant_id, month)


# ── Employee self-service (/me) ──────────────────────────────────────────────
# A separate router, guarded by current_employee rather than the section RBAC:
# these endpoints resolve the caller to their OWN record and never take an
# employee id from the path, so one employee can never read another's data.
portal = APIRouter(prefix="/me", tags=["portal"])


@portal.get("/profile", response_model=EmployeeOut)
async def my_profile(auth: AuthContext = Depends(current_auth),
                     employee_id: str = Depends(current_employee)):
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow("select * from hrms_employees where id=$1", employee_id)
    return _emp(row, reveal=True)  # their own record


@portal.get("/attendance", response_model=list[AttendanceOut])
async def my_attendance(auth: AuthContext = Depends(current_auth),
                        employee_id: str = Depends(current_employee)):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            _ATT_SELECT + """ where a.employee_id=$1
                              and a.work_date >= date_trunc('month', current_date)
                              order by a.work_date desc""", employee_id)
    return [_att(r) for r in rows]


# The portal's own punches (/me/attendance/punch, checkin, checkout) are in
# routers/hrms_attendance.py: they run the server-side geofence (D-43).


@portal.get("/leave", response_model=list[LeaveOut])
async def my_leave(auth: AuthContext = Depends(current_auth),
                   employee_id: str = Depends(current_employee)):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_LEAVE_SELECT + " where l.employee_id=$1 order by l.created_at desc",
                                employee_id)
    return [_leave(r) for r in rows]


@portal.get("/leave/balances", response_model=list[LeaveBalance])
async def my_balances(auth: AuthContext = Depends(current_auth),
                      employee_id: str = Depends(current_employee)):
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _balances(conn, auth.tenant_id, employee_id)


@portal.post("/leave", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
async def my_request_leave(body: LeaveCreate, auth: AuthContext = Depends(current_auth),
                           employee_id: str = Depends(current_employee)):
    """An employee requests their own leave. The employee_id in the body is
    ignored — it is forced to the caller, so nobody can file against someone
    else. Approval still belongs to an admin (hrms:admin)."""
    # Direct call, not the HTTP route: this bypasses the hrms:write guard on
    # purpose (the employee has no such permission) — /me is guarded by
    # current_employee instead. The employee_id is forced to the caller.
    forced = body.model_copy(update={"employee_id": employee_id})
    return await create_leave(forced, auth)


@portal.get("/payslips", response_model=list[Payslip])
async def my_payslips(month: str | None = None, auth: AuthContext = Depends(current_auth),
                      employee_id: str = Depends(current_employee)):
    async with db.tenant_conn(auth.tenant_id) as conn:
        m = month or (await conn.fetchval("select current_date")).strftime("%Y-%m")
        run = await _compute_payroll(conn, auth.tenant_id, m)
    # Return only the caller's slip — the run computed everyone, but an employee
    # sees exactly one payslip: their own.
    return [s for s in run.payslips if s.employee_id == employee_id]
