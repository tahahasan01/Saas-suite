"""HRMS — employees, attendance, leave, the working-day calendar, and payroll.
Guarded by the 'hrms' section. Mobile face-match/biometric plug into attendance later."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from datetime import date, timedelta

from .. import db, payroll
from ..deps import AuthContext
from ..models import (
    REQUEST_TYPES,
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
    WeekOut,
    WeekRow,
)
from ..rbac import require

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
       (select count(distinct a.work_date) from hrms_attendance a
         where a.employee_id = e.id and a.check_in is not null
           and a.work_date in (select day from working_days)) as present_days,
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
        if (emp["id"], d) in att:
            return att[(emp["id"], d)]         # 'present' | 'late'
        if (emp["id"], d) in on_leave:
            return on_leave[(emp["id"], d)]
        if d in holidays:
            return "holiday"
        if d.isoweekday() % 7 in off_days:     # ISO Mon=1..Sun=7 -> dow Sun=0
            return "off"
        if d == today:
            return "pending"                   # the day isn't over yet
        return "absent"

    return WeekOut(
        days=days,
        employees=[WeekRow(id=str(e["id"]), name=e["name"], cells=[cell(e, d) for d in days])
                   for e in employees])


# ── Leave ───────────────────────────────────────────────────────────────────
_LEAVE_SELECT = """select l.*, e.name as employee_name from hrms_leave_requests l
                   join hrms_employees e on e.id = l.employee_id"""


def _leave(r) -> LeaveOut:
    return LeaveOut(
        id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"],
        request_type=r["request_type"], leave_type=r["leave_type"], from_date=r["from_date"],
        to_date=r["to_date"], reason=r["reason"], status=r["status"])


@router.get("/leave", response_model=list[LeaveOut])
async def list_leave(request_type: str | None = None,
                     auth: AuthContext = Depends(require("hrms", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            _LEAVE_SELECT + " where ($1::text is null or l.request_type = $1) order by l.created_at desc",
            request_type)
    return [_leave(r) for r in rows]


@router.post("/leave", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
async def create_leave(body: LeaveCreate, auth: AuthContext = Depends(require("hrms", "write"))):
    if body.request_type not in REQUEST_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"request_type must be one of {REQUEST_TYPES}")
    if body.to_date < body.from_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "to_date cannot be before from_date")
    # A WFH day is worked, so it carries no leave subtype — storing one would
    # let it be mistaken for unpaid leave and deducted.
    leave_type = "annual" if body.request_type == "wfh" else body.leave_type
    async with db.tenant_conn(auth.tenant_id) as conn:
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


async def _policy(conn, tenant_id: str):
    row = await conn.fetchrow("select * from hrms_leave_policies where tenant_id=$1", tenant_id)
    if row is None:
        row = await conn.fetchrow(
            "insert into hrms_leave_policies (tenant_id) values ($1) returning *", tenant_id)
    return row


async def _balances(conn, tenant_id: str, employee_id: str) -> list[LeaveBalance]:
    policy = await _policy(conn, tenant_id)
    off = list(await conn.fetchval("select weekly_off_days from tenants where id=$1", tenant_id) or [0])
    year_start = date(date.today().year, 1, 1)
    year_end = date(date.today().year, 12, 31)
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
    new_status = "approved" if decision == "approve" else "rejected"
    async with db.tenant_conn(auth.tenant_id) as conn:
        req = await conn.fetchrow("select * from hrms_leave_requests where id=$1", leave_id)
        if req is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found")

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
        await conn.execute("delete from hrms_holidays where id=$1", holiday_id)
    # Must set the code on the injected response, as logout/read-all do —
    # returning it unset yields no status at all.
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/payroll", response_model=PayrollOut)
async def run_payroll(month: str | None = None, auth: AuthContext = Depends(require("hrms", "read"))):
    """Monthly payslips: gross − absence deduction − FBR tax. `month` = YYYY-MM."""
    m = month or date.today().strftime("%Y-%m")
    try:
        first = date.fromisoformat(f"{m}-01")
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "month must be YYYY-MM")
    async with db.tenant_conn(auth.tenant_id) as conn:
        off_days = await conn.fetchval(
            "select weekly_off_days from tenants where id=$1", auth.tenant_id)
        rows = await conn.fetch(_PAYROLL, first, list(off_days or [0]))

    slips = []
    month_days = rows[0]["month_days"] if rows else 0
    for r in rows:
        gross = r["salary_minor"]
        unpaid = r["unpaid_leave_days"]
        wfh = r["wfh_days"]
        # Whatever is left once presence, approved leave and remote days are
        # accounted for. A WFH day someone also clocked in for is counted once:
        # accounted is capped at the days actually elapsed.
        accounted = min(r["elapsed_days"], r["present_days"] + r["paid_leave_days"] + unpaid + wfh)
        absent = max(0, r["elapsed_days"] - accounted)
        per_day = gross / month_days if month_days else 0
        deduction = round((absent + unpaid) * per_day)
        tax = payroll.monthly_tax_minor(gross)
        slips.append(Payslip(
            employee_id=str(r["id"]), name=r["name"], gross_minor=gross,
            present_days=r["present_days"], paid_leave_days=r["paid_leave_days"],
            unpaid_leave_days=unpaid, wfh_days=wfh, absent_days=absent,
            absence_deduction_minor=deduction, tax_minor=tax,
            net_minor=max(0, gross - deduction - tax)))
    return PayrollOut(month=m, working_days=month_days, payslips=slips)
