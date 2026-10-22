"""Promotions and transfers with history (wave C, H30, St12, 0106).

Making a change needs hrms.employee.update; changing the reporting line
also hrms.org.manage (and never making yourself someone's manager), and a
new salary payroll.salary.update. A change dated today or earlier applies
at once; a later one waits for the daily job. Salaries show only to
payroll.salary.read.
"""
from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from .. import db, hrorg, job_changes, rbac, refs
from ..deps import AuthContext
from ..models import JobChangeIn, JobChangeOut
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms"])


def _out(r: asyncpg.Record, *, show_pay: bool) -> JobChangeOut:
    return JobChangeOut(
        id=str(r["id"]), employee_id=str(r["employee_id"]), kind=r["kind"], effective_on=r["effective_on"],
        status=r["status"], from_title=r["from_title"], to_title=r["to_title"],
        from_department=r["from_department"], to_department=r["to_department"],
        from_location=r["from_location"], to_location=r["to_location"],
        from_manager=r["from_manager"], to_manager=r["to_manager"],
        old_base_minor=r["old_base_minor"] if show_pay else None,
        new_base_minor=r["new_base_minor"] if show_pay else None,
        note=r["note"], applied_at=r["applied_at"], created_at=r["created_at"])


@router.post("/employees/{employee_id}/job-changes", response_model=JobChangeOut, status_code=status.HTTP_201_CREATED)
async def create(employee_id: UUID, body: JobChangeIn,
                 auth: AuthContext = Depends(perm("hrms.employee.update"))) -> JobChangeOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        if not body.changes_something():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "Say what changes: a title, department, location, manager or salary")
        await conn.execute("select 1 from hrms_employees where id = $1 for update", employee_id)
        for col, table in (("job_title_id", "hrms_job_titles"), ("department_id", "hrms_departments"),
                           ("location_id", "hrms_locations"), ("manager_id", "hrms_employees")):
            await refs.ensure_visible(conn, table, getattr(body, col))
        if body.new_base_minor is not None and not await rbac.holds_key(conn, auth, "payroll.salary.update"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "A new salary needs payroll.salary.update")
        if body.manager_id is not None:
            if not await hrorg.holds_hr(conn, auth, "hrms.org.manage"):
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires hrms.org.manage to change a manager")
            if body.manager_id == employee_id:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Someone can't manage themselves")
            if await conn.fetchval("select 1 from hrms_employees where id = $1 and user_id = $2",
                                   body.manager_id, auth.user_id):
                raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't make yourself someone's manager")
        names = await job_changes.snapshot(conn, employee_id, body.model_dump())
        old_base = await conn.fetchval(
            """select base_minor from hrms_compensation where employee_id = $1 and effective_from <= $2
                order by effective_from desc, seq desc limit 1""", employee_id, body.effective_on)
        cid = await conn.fetchval(
            """insert into hrms_job_changes (tenant_id, employee_id, kind, effective_on, job_title_id, department_id,
                                             location_id, manager_id, new_base_minor, old_base_minor, from_title,
                                             to_title, from_department, to_department, from_location, to_location,
                                             from_manager, to_manager, note, created_by)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
               returning id""",
            auth.tenant_id, employee_id, body.kind, body.effective_on, body.job_title_id, body.department_id,
            body.location_id, body.manager_id, body.new_base_minor,
            old_base if body.new_base_minor is not None else None,
            names.get("from_title"), names.get("to_title"), names.get("from_department"), names.get("to_department"),
            names.get("from_location"), names.get("to_location"), names.get("from_manager"), names.get("to_manager"),
            body.note, auth.user_id)
        row = await conn.fetchrow("select * from hrms_job_changes where id = $1", cid)
        if body.effective_on <= await conn.fetchval("select current_date"):
            if not await job_changes.apply(conn, row):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                    "That would make the reporting line go round in a circle.")
            row = await conn.fetchrow("select * from hrms_job_changes where id = $1", cid)
        return _out(row, show_pay=await rbac.holds_key(conn, auth, "payroll.salary.read"))


@router.get("/employees/{employee_id}/job-changes", response_model=list[JobChangeOut])
async def history(employee_id: UUID, auth: AuthContext = Depends(perm("hrms.employee.read"))) -> list[JobChangeOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        show = await rbac.holds_key(conn, auth, "payroll.salary.read")
        rows = await conn.fetch(
            "select * from hrms_job_changes where employee_id = $1 order by effective_on desc, created_at desc",
            employee_id)
    return [_out(r, show_pay=show) for r in rows]


@router.post("/job-changes/{change_id}/cancel", response_model=JobChangeOut)
async def cancel(change_id: UUID, auth: AuthContext = Depends(perm("hrms.employee.update"))) -> JobChangeOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        cur = await conn.fetchval("select status from hrms_job_changes where id = $1 for update", change_id)
        if cur is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Job change not found")
        if cur != "scheduled":
            raise HTTPException(status.HTTP_409_CONFLICT, f"This change was already {cur}")
        row = await conn.fetchrow(
            "update hrms_job_changes set status = 'cancelled' where id = $1 returning *", change_id)
        return _out(row, show_pay=await rbac.holds_key(conn, auth, "payroll.salary.read"))
