"""One request tracker (wave A, H16, St10).

A read model over the request tables that already exist; nothing new is
stored. /me/requests lists everything the employee asked for (leave, WFH,
attendance corrections, overtime). /hrms/requests/pending lists what waits
for a decision, limited to the kinds the caller may decide: leave and WFH
need `hrms.leave.approve`, corrections and overtime `hrms.attendance.approve`.
Each row links to the page where it is decided or followed up.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from .. import db, rbac
from ..deps import AuthContext, current_auth, current_employee
from ..models import RequestRow

router = APIRouter(prefix="/hrms", tags=["hrms"])
portal = APIRouter(prefix="/me", tags=["portal"])

# One row shape for every kind: kind, id, employee, title, status, when asked.
_UNION = """
select 'leave' as kind, l.id, l.employee_id, l.from_date as day, l.to_date as until,
       coalesce(lt.name, initcap(l.leave_type)) as what, l.status, l.created_at, l.reason
  from hrms_leave_requests l left join hrms_leave_types lt on lt.id = l.leave_type_id
 where coalesce(l.request_type, 'leave') = 'leave'
union all
select 'wfh', l.id, l.employee_id, l.from_date, l.to_date, 'Work from home', l.status, l.created_at, l.reason
  from hrms_leave_requests l where l.request_type = 'wfh'
union all
select 'correction', c.id, c.employee_id, c.work_date, null, 'Attendance correction', c.status, c.created_at, c.reason
  from hrms_attendance_corrections c
union all
select 'overtime', o.id, o.employee_id, o.work_date, null,
       'Overtime ' || (o.minutes / 60) || 'h ' || lpad((o.minutes % 60)::text, 2, '0') || 'm',
       o.status, o.created_at, o.reason
  from hrms_overtime_claims o"""

_MINE = {"leave": "/me/leave", "wfh": "/me/leave", "correction": "/me/attendance", "overtime": "/me/attendance"}
_DECIDE = {"leave": "/hrms/leave", "wfh": "/hrms/leave", "correction": "/hrms/attendance", "overtime": "/hrms/attendance"}


def _title(r: Any) -> str:
    when = f"{r['day']:%d %b}" + (f" – {r['until']:%d %b}" if r["until"] and r["until"] != r["day"] else "")
    return f"{r['what']} · {when}"


def _row(r: Any, links: dict[str, str]) -> RequestRow:
    return RequestRow(id=str(r["id"]), kind=r["kind"], title=_title(r), status=r["status"], reason=r["reason"] or "",
                      employee_id=str(r["employee_id"]), employee_name=r["employee_name"], created_at=r["created_at"],
                      link=links[r["kind"]])


@portal.get("/requests", response_model=list[RequestRow])
async def my_requests(auth: AuthContext = Depends(current_auth),
                      employee_id: str = Depends(current_employee)) -> list[RequestRow]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            f"""select u.*, e.name as employee_name from ({_UNION}) u join hrms_employees e on e.id = u.employee_id
                 where u.employee_id = $1 order by u.created_at desc limit 200""", employee_id)
    return [_row(r, _MINE) for r in rows]


@router.get("/requests/pending", response_model=list[RequestRow])
async def pending(auth: AuthContext = Depends(current_auth)) -> list[RequestRow]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        kinds = []
        if await rbac.holds_key(conn, auth, "hrms.leave.approve"):
            kinds += ["leave", "wfh"]
        if await rbac.holds_key(conn, auth, "hrms.attendance.approve"):
            kinds += ["correction", "overtime"]
        if not kinds:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires hrms.leave.approve or hrms.attendance.approve")
        rows = await conn.fetch(
            f"""select u.*, e.name as employee_name from ({_UNION}) u join hrms_employees e on e.id = u.employee_id
                 where u.status = 'pending' and u.kind = any($1::text[])
                 order by u.created_at limit 500""", kinds)
    return [_row(r, _DECIDE) for r in rows]
