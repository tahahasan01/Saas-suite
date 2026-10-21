"""HR org structure: departments, job titles, locations and the employee's
place in them (checklist 3F, migration 0065, St03 §6.2).

The text columns `department` and `designation` predate the tables (§7.10).
They are kept for one release — the AI views, older clients and rollback read
them — so whenever a link changes, the text follows it here.
"""
from __future__ import annotations

from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import refs
from .deps import AuthContext
from .rbac import holds

# Columns of hrms_employees this module writes, and the table each id names.
_LINKS = {
    "department_id": "hrms_departments",
    "job_title_id": "hrms_job_titles",
    "location_id": "hrms_locations",
    "manager_id": "hrms_employees",
}
JOB_FIELDS = ("code", "department_id", "job_title_id", "location_id", "manager_id",
              "employment_type", "probation_end")


async def _manager_loop(conn: asyncpg.Connection, employee_id: str, manager_id: Any) -> bool:
    """Would `manager_id` above `employee_id` close a loop? Walks up from the
    proposed manager; meeting the employee means yes."""
    return bool(await conn.fetchval(
        """with recursive up(id, depth) as (
               select $2::uuid, 0
               union
               select e.manager_id, up.depth + 1 from hrms_employees e join up on e.id = up.id
                where e.manager_id is not null and up.depth < 50)
           select exists (select 1 from up where id = $1::uuid)""",
        employee_id, manager_id))


async def department_loop(conn: asyncpg.Connection, dept_id: str, parent_id: Any) -> bool:
    return bool(await conn.fetchval(
        """with recursive up(id, depth) as (
               select $2::uuid, 0
               union
               select d.parent_id, up.depth + 1 from hrms_departments d join up on d.id = up.id
                where d.parent_id is not null and up.depth < 50)
           select exists (select 1 from up where id = $1::uuid)""",
        dept_id, parent_id))


async def apply_job(conn: asyncpg.Connection, auth: AuthContext, employee_id: str,
                    fields: dict[str, Any]) -> None:
    """Write org fields on an employee. `fields` holds only what the caller
    set; None clears a link. Ids must be this tenant's (404), the reporting
    line can't loop (422), a code is unique per tenant (409).

    The manager link decides who may approve someone's requests, so changing
    it needs hrms.org.manage, not just employee update, and nobody may make
    themselves anyone's manager (security review)."""
    fields = {k: v for k, v in fields.items() if k in JOB_FIELDS}
    if not fields:
        return
    for col, table in _LINKS.items():
        if fields.get(col) is not None:
            await refs.ensure_visible(conn, table, fields[col])
    if "manager_id" in fields:
        current = await conn.fetchval("select manager_id from hrms_employees where id=$1", employee_id)
        new = fields["manager_id"]
        if (str(current) if current else None) != (str(new) if new else None):
            if not await holds_hr(conn, auth, "hrms.org.manage"):
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires hrms.org.manage to change a manager")
            if new is not None and str(new) != str(employee_id) and await conn.fetchval(
                    "select 1 from hrms_employees where id=$1 and user_id=$2", new, auth.user_id):
                raise HTTPException(status.HTTP_403_FORBIDDEN,
                                    "You can't make yourself someone's manager — another admin must.")
    if fields.get("manager_id") is not None:
        if str(fields["manager_id"]) == str(employee_id) or await _manager_loop(
                conn, employee_id, fields["manager_id"]):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "That would make the reporting line go round in a circle.")
    if "code" in fields and fields["code"] is not None:
        fields["code"] = fields["code"].strip() or None
    cols = ", ".join(f"{k}=${i + 2}" for i, k in enumerate(fields))
    try:
        await conn.execute(f"update hrms_employees set {cols} where id=$1", employee_id, *fields.values())
    except asyncpg.UniqueViolationError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Another employee already has that code.") from None
    # The text columns follow the links (§7.10), so older readers stay right.
    if "department_id" in fields:
        await conn.execute(
            """update hrms_employees e
                  set department = coalesce((select name from hrms_departments where id = e.department_id), '')
                where e.id = $1""", employee_id)
    if "job_title_id" in fields:
        await conn.execute(
            """update hrms_employees e
                  set designation = coalesce((select name from hrms_job_titles where id = e.job_title_id), '')
                where e.id = $1""", employee_id)


async def holds_hr(conn: asyncpg.Connection, auth: AuthContext, key: str) -> bool:
    """`key` held by the caller's role, with HRMS switched on for the tenant."""
    enabled = await conn.fetchval(
        "select enabled from entitlements where tenant_id=$1 and section_key='hrms'", auth.tenant_id)
    return bool(enabled) and await holds(conn, auth.role_id, key)


async def approver_role(conn: asyncpg.Connection, auth: AuthContext, employee_id: str, *,
                        requested_by: Any, key: str) -> str:
    """Who may decide a request about `employee_id`. Everyone needs `key`
    (the link alone grants nothing — security review); with it, the
    employee's manager (the manager employee's login) decides as 'manager',
    anyone else as 'hr'. Never the employee or whoever filed it
    (TR-SEC-33): 403."""
    row = await conn.fetchrow(
        """select e.user_id, m.user_id as manager_user from hrms_employees e
             left join hrms_employees m on m.id = e.manager_id where e.id = $1""", employee_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    if (row["user_id"] is not None and str(row["user_id"]) == auth.user_id) or (
            requested_by is not None and str(requested_by) == auth.user_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't decide your own request — another approver must.")
    if not await holds_hr(conn, auth, key):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {key}")
    if row["manager_user"] is not None and str(row["manager_user"]) == auth.user_id:
        return "manager"
    return "hr"


async def link_text(conn: asyncpg.Connection) -> None:
    """An employee saved with only text department/designation (older
    clients, sample data) gets the matching rows, created if new."""
    await conn.execute("select hrms_link_org_text()")


PROFILE_SELECT = """
select e.*, (a.check_in is not null) as present_today,
       l.name as location_name, l.province, m.name as manager_name,
       (select count(*) from hrms_employee_documents d
         where d.employee_id = e.id and d.expires_on is not null
           and d.expires_on <= current_date + 30) as documents_expiring
  from hrms_employees e
  left join hrms_attendance a on a.employee_id = e.id and a.work_date = current_date
  left join hrms_locations l on l.id = e.location_id
  left join hrms_employees m on m.id = e.manager_id
 where e.id = $1"""


def _s(v: Any) -> str | None:
    return str(v) if v is not None else None


def profile_fields(r: asyncpg.Record) -> dict[str, Any]:
    return dict(
        code=r["code"], department_id=_s(r["department_id"]), job_title_id=_s(r["job_title_id"]),
        location_id=_s(r["location_id"]), location_name=r["location_name"], province=r["province"],
        manager_id=_s(r["manager_id"]), manager_name=r["manager_name"],
        employment_type=r["employment_type"], probation_end=r["probation_end"],
        has_kiosk_pin=r["kiosk_pin_hash"] is not None, documents_expiring=r["documents_expiring"])
