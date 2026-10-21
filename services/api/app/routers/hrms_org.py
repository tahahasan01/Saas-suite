"""HR org: departments, job titles, locations, the employee profile and
documents (checklist 3F, migration 0065). Reading is hrms read; shaping the
org (departments, titles, locations) is hrms.org.manage."""
from __future__ import annotations

from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from .. import db, hrorg, refs
from ..deps import AuthContext
from ..models import (
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    DocumentCreate,
    DocumentOut,
    EmployeeJobUpdate,
    EmployeeProfile,
    JobTitleCreate,
    JobTitleOut,
    JobTitleUpdate,
    LocationCreate,
    LocationOut,
    LocationUpdate,
    check_location,
)
from ..rbac import holds, perm
from .hrms import _emp

router = APIRouter(prefix="/hrms", tags=["hrms-org"])


def _s(v: Any) -> str | None:
    return str(v) if v is not None else None


def _set(body: BaseModel) -> dict[str, Any]:
    """The fields the caller actually sent; an explicit null clears."""
    return {k: getattr(body, k) for k in body.model_fields_set}


def _duplicate(what: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, f"A {what} with that name already exists.")


# ── Departments ─────────────────────────────────────────────────────────────
_DEPT_SELECT = """select d.*, (select count(*) from hrms_employees e
                                where e.department_id = d.id and e.status = 'active') as headcount
                    from hrms_departments d"""


def _dept(r: asyncpg.Record) -> DepartmentOut:
    return DepartmentOut(id=str(r["id"]), name=r["name"], parent_id=_s(r["parent_id"]),
                         head_employee_id=_s(r["head_employee_id"]), active=r["active"],
                         headcount=r["headcount"])


@router.get("/departments", response_model=list[DepartmentOut])
async def list_departments(auth: AuthContext = Depends(perm("hrms.employee.read"))) -> list[DepartmentOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_DEPT_SELECT + " order by d.name")
    return [_dept(r) for r in rows]


@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
async def create_department(body: DepartmentCreate, auth: AuthContext = Depends(perm("hrms.org.manage"))) -> DepartmentOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_departments", body.parent_id)
        await refs.ensure_visible(conn, "hrms_employees", body.head_employee_id)
        try:
            did = await conn.fetchval(
                """insert into hrms_departments (tenant_id, name, parent_id, head_employee_id)
                   values ($1, btrim($2), $3, $4) returning id""",
                auth.tenant_id, body.name, body.parent_id, body.head_employee_id)
        except asyncpg.UniqueViolationError:
            raise _duplicate("department") from None
        return _dept(await conn.fetchrow(_DEPT_SELECT + " where d.id=$1", did))


@router.patch("/departments/{dept_id}", response_model=DepartmentOut)
async def update_department(dept_id: str, body: DepartmentUpdate,
                            auth: AuthContext = Depends(perm("hrms.org.manage"))) -> DepartmentOut:
    fields = _set(body)
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_departments", dept_id)
        if fields.get("parent_id") is not None:
            await refs.ensure_visible(conn, "hrms_departments", fields["parent_id"])
            if await hrorg.department_loop(conn, dept_id, fields["parent_id"]):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                    "A department can't sit under itself or one of its own sub-departments.")
        if fields.get("head_employee_id") is not None:
            await refs.ensure_visible(conn, "hrms_employees", fields["head_employee_id"])
        if fields.get("active") is None:
            fields.pop("active", None)
        cols = ", ".join(f"{k}=${i + 2}" for i, k in enumerate(fields))
        try:
            await conn.execute(f"update hrms_departments set {cols} where id=$1", dept_id, *fields.values())
            # Renaming a department renames the text copy on its staff (§7.10).
            if "name" in fields:
                await conn.execute("update hrms_employees set department=$2 where department_id=$1",
                                   dept_id, fields["name"])
        except asyncpg.UniqueViolationError:
            raise _duplicate("department") from None
        return _dept(await conn.fetchrow(_DEPT_SELECT + " where d.id=$1", dept_id))


# ── Job titles ──────────────────────────────────────────────────────────────
def _title(r: asyncpg.Record) -> JobTitleOut:
    return JobTitleOut(id=str(r["id"]), name=r["name"], department_id=_s(r["department_id"]), active=r["active"])


@router.get("/job-titles", response_model=list[JobTitleOut])
async def list_job_titles(auth: AuthContext = Depends(perm("hrms.employee.read"))) -> list[JobTitleOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select * from hrms_job_titles order by name")
    return [_title(r) for r in rows]


@router.post("/job-titles", response_model=JobTitleOut, status_code=status.HTTP_201_CREATED)
async def create_job_title(body: JobTitleCreate, auth: AuthContext = Depends(perm("hrms.org.manage"))) -> JobTitleOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_departments", body.department_id)
        try:
            row = await conn.fetchrow(
                """insert into hrms_job_titles (tenant_id, name, department_id)
                   values ($1, btrim($2), $3) returning *""",
                auth.tenant_id, body.name, body.department_id)
        except asyncpg.UniqueViolationError:
            raise _duplicate("job title") from None
    return _title(row)


@router.patch("/job-titles/{title_id}", response_model=JobTitleOut)
async def update_job_title(title_id: str, body: JobTitleUpdate,
                           auth: AuthContext = Depends(perm("hrms.org.manage"))) -> JobTitleOut:
    fields = _set(body)
    if fields.get("active") is None:
        fields.pop("active", None)
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_job_titles", title_id)
        if fields.get("department_id") is not None:
            await refs.ensure_visible(conn, "hrms_departments", fields["department_id"])
        cols = ", ".join(f"{k}=${i + 2}" for i, k in enumerate(fields))
        try:
            row = await conn.fetchrow(f"update hrms_job_titles set {cols} where id=$1 returning *",
                                      title_id, *fields.values())
            if "name" in fields:
                await conn.execute("update hrms_employees set designation=$2 where job_title_id=$1",
                                   title_id, fields["name"])
        except asyncpg.UniqueViolationError:
            raise _duplicate("job title") from None
    return _title(row)


# ── Locations ───────────────────────────────────────────────────────────────
_LOC_SELECT = """select l.*, array(select c::text from unnest(l.allowed_cidrs) c) as cidrs,
                        (select count(*) from hrms_kiosks k
                          where k.location_id = l.id and k.revoked_at is null) as kiosks
                   from hrms_locations l"""


def _loc(r: asyncpg.Record) -> LocationOut:
    return LocationOut(id=str(r["id"]), name=r["name"], kind=r["kind"], address=r["address"],
                       lat=r["lat"], lng=r["lng"], radius_m=r["radius_m"], allowed_cidrs=list(r["cidrs"]),
                       province=r["province"], geo_mode=r["geo_mode"], ip_mode=r["ip_mode"],
                       active=r["active"], kiosks=r["kiosks"])


@router.get("/locations", response_model=list[LocationOut])
async def list_locations(auth: AuthContext = Depends(perm("hrms.employee.read"))) -> list[LocationOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_LOC_SELECT + " order by l.name")
    return [_loc(r) for r in rows]


@router.post("/locations", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
async def create_location(body: LocationCreate, auth: AuthContext = Depends(perm("hrms.org.manage"))) -> LocationOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            lid = await conn.fetchval(
                """insert into hrms_locations (tenant_id, name, kind, address, lat, lng, radius_m,
                                               allowed_cidrs, province, geo_mode, ip_mode)
                   values ($1, btrim($2), $3, $4, $5, $6, $7, $8::text[]::cidr[], $9, $10, $11) returning id""",
                auth.tenant_id, body.name, body.kind, body.address, body.lat, body.lng, body.radius_m,
                body.allowed_cidrs, body.province, body.geo_mode, body.ip_mode)
        except asyncpg.UniqueViolationError:
            raise _duplicate("location") from None
        return _loc(await conn.fetchrow(_LOC_SELECT + " where l.id=$1", lid))


@router.patch("/locations/{location_id}", response_model=LocationOut)
async def update_location(location_id: str, body: LocationUpdate,
                          auth: AuthContext = Depends(perm("hrms.org.manage"))) -> LocationOut:
    fields = _set(body)
    for k in ("name", "kind", "address", "radius_m", "geo_mode", "ip_mode", "active", "allowed_cidrs"):
        if k in fields and fields[k] is None:
            fields.pop(k)                       # these can't be cleared, only changed
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    async with db.tenant_conn(auth.tenant_id) as conn:
        cur = await conn.fetchrow(_LOC_SELECT + " where l.id=$1", location_id)
        if cur is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Location not found")
        merged = {**dict(cur), "allowed_cidrs": list(cur["cidrs"]), **fields}
        try:
            check_location(merged["lat"], merged["lng"], merged["geo_mode"], merged["ip_mode"],
                           merged["allowed_cidrs"])
        except ValueError as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from None
        sets = []
        for i, k in enumerate(fields):
            sets.append(f"{k}=${i + 2}::text[]::cidr[]" if k == "allowed_cidrs" else f"{k}=${i + 2}")
        try:
            await conn.execute(f"update hrms_locations set {', '.join(sets)} where id=$1",
                               location_id, *fields.values())
        except asyncpg.UniqueViolationError:
            raise _duplicate("location") from None
        return _loc(await conn.fetchrow(_LOC_SELECT + " where l.id=$1", location_id))


# ── The employee profile ────────────────────────────────────────────────────
async def load_profile(conn: asyncpg.Connection, auth: AuthContext, employee_id: str) -> EmployeeProfile:
    row = await conn.fetchrow(hrorg.PROFILE_SELECT, employee_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    reveal = await holds(conn, auth.role_id, "payroll.salary.read")
    base = _emp(row, reveal=reveal).model_dump()
    return EmployeeProfile(**base, **hrorg.profile_fields(row))


@router.get("/employees/{employee_id}", response_model=EmployeeProfile)
async def get_employee(employee_id: str, auth: AuthContext = Depends(perm("hrms.employee.read"))) -> EmployeeProfile:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await load_profile(conn, auth, employee_id)


@router.patch("/employees/{employee_id}/job", response_model=EmployeeProfile)
async def update_employee_job(employee_id: str, body: EmployeeJobUpdate,
                              auth: AuthContext = Depends(perm("hrms.employee.update"))) -> EmployeeProfile:
    fields = _set(body)
    if fields.get("employment_type", "x") is None:
        fields.pop("employment_type")
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        # One org change per employee at a time, so two edits can't together
        # build a loop each one alone wouldn't.
        await conn.execute("select 1 from hrms_employees where id=$1 for update", employee_id)
        await hrorg.apply_job(conn, employee_id, fields)
        return await load_profile(conn, auth, employee_id)


# ── Documents ───────────────────────────────────────────────────────────────
def _doc(r: asyncpg.Record) -> DocumentOut:
    return DocumentOut(
        id=str(r["id"]), employee_id=str(r["employee_id"]),
        employee_name=r["employee_name"] if "employee_name" in r.keys() else "",
        kind=r["kind"], title=r["title"], number=r["number"], issued_on=r["issued_on"],
        expires_on=r["expires_on"], file_id=_s(r["file_id"]), note=r["note"],
        days_left=r["days_left"] if "days_left" in r.keys() else None)


_DOC_SELECT = """select d.*, e.name as employee_name, (d.expires_on - current_date) as days_left
                   from hrms_employee_documents d join hrms_employees e on e.id = d.employee_id"""


@router.get("/employees/{employee_id}/documents", response_model=list[DocumentOut])
async def list_documents(employee_id: str, auth: AuthContext = Depends(perm("hrms.document.read"))) -> list[DocumentOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        rows = await conn.fetch(_DOC_SELECT + " where d.employee_id=$1 order by d.expires_on nulls last, d.title",
                                employee_id)
    return [_doc(r) for r in rows]


@router.post("/employees/{employee_id}/documents", response_model=DocumentOut,
             status_code=status.HTTP_201_CREATED)
async def add_document(employee_id: str, body: DocumentCreate,
                       auth: AuthContext = Depends(perm("hrms.document.manage"))) -> DocumentOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        did = await conn.fetchval(
            """insert into hrms_employee_documents (tenant_id, employee_id, kind, title, number, issued_on,
                                                    expires_on, file_id, note, created_by)
               values ($1,$2,$3,btrim($4),$5,$6,$7,$8,$9,$10) returning id""",
            auth.tenant_id, employee_id, body.kind, body.title, body.number, body.issued_on,
            body.expires_on, body.file_id, body.note, auth.user_id)
        return _doc(await conn.fetchrow(_DOC_SELECT + " where d.id=$1", did))


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(doc_id: str, response: Response,
                          auth: AuthContext = Depends(perm("hrms.document.manage"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        if await conn.fetchval("delete from hrms_employee_documents where id=$1 returning id", doc_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/documents/expiring", response_model=list[DocumentOut])
async def expiring_documents(days: int = 30, auth: AuthContext = Depends(perm("hrms.document.read"))) -> list[DocumentOut]:
    """Expired documents and those expiring within `days`, soonest first, for
    active staff — the list HR works through before an inspection."""
    days = max(0, min(days, 365))
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            _DOC_SELECT + """ where d.expires_on is not null and d.expires_on <= current_date + $1::int
                                and e.status = 'active' order by d.expires_on, e.name""", days)
    return [_doc(r) for r in rows]
