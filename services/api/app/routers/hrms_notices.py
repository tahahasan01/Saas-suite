"""Notice board and policy acknowledgement (wave A, H18/H19, St10, 0085).

HR (`hrms.notice.manage`) posts a notice for everyone, one department or one
location, optionally with an attachment (claimed through `files`). A notice
that `requires_ack` is a policy: each employee in its audience confirms it
once through /me, and HR (`hrms.notice.read`) sees who has and who hasn't.
Employees read the board only through /me (current_employee), never the HR
endpoints. Posting notifies everyone in the audience who has a login.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Response, status

from .. import db, files, notifications, rbac, refs
from ..deps import AuthContext, current_auth, current_employee
from ..models import NoticeAck, NoticeCreate, NoticeOut, NoticeUpdate
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms"])
portal = APIRouter(prefix="/me", tags=["portal"])

_ENTITY = "hrms_notice"

# Who a notice is for: everyone active, or those in its department/location.
_AUDIENCE = """
select e.id, e.name, e.user_id from hrms_employees e
 where e.status = 'active'
   and (n.audience = 'all'
        or (n.audience = 'department' and e.department_id = n.department_id)
        or (n.audience = 'location' and e.location_id = n.location_id))"""

_SELECT = f"""
select n.*, d.name as department_name, l.name as location_name,
       (select count(*) from ({_AUDIENCE}) a) as audience_size,
       (select count(*) from hrms_notice_acks k join ({_AUDIENCE}) a on a.id = k.employee_id
         where k.notice_id = n.id) as acknowledged
  from hrms_notices n
  left join hrms_departments d on d.id = n.department_id
  left join hrms_locations l on l.id = n.location_id"""


def _out(r: asyncpg.Record, acknowledged_at: Any = None) -> NoticeOut:
    return NoticeOut(
        id=str(r["id"]), title=r["title"], body=r["body"], requires_ack=r["requires_ack"], audience=r["audience"],
        department_id=str(r["department_id"]) if r["department_id"] else None,
        location_id=str(r["location_id"]) if r["location_id"] else None,
        audience_label=(r["department_name"] or r["location_name"] or "Everyone"),
        file_id=str(r["file_id"]) if r["file_id"] else None, pinned=r["pinned"], published_at=r["published_at"],
        archived_at=r["archived_at"], audience_size=r["audience_size"], acknowledged=r["acknowledged"],
        acknowledged_at=acknowledged_at)


async def _in_audience(conn: asyncpg.Connection, notice_id: Any, employee_id: Any) -> bool:
    return bool(await conn.fetchval(
        f"select exists (select 1 from hrms_notices n where n.id = $1 and exists ({_AUDIENCE} and e.id = $2))",
        notice_id, employee_id))


async def _file_reader(conn: asyncpg.Connection, user_id: str, row: asyncpg.Record) -> bool:
    """A notice's attachment opens for HR (hrms.notice.read) and for the
    employees the notice is for."""
    u = await conn.fetchrow("select role_id from users where id = $1", user_id)
    held = await rbac.effective_permissions(conn, str(row["tenant_id"]), u["role_id"] if u else None, user_id)
    if "hrms.notice.read" in held:
        return bool(await conn.fetchval("select 1 from hrms_notices where id = $1", row["entity_id"]))
    emp = await conn.fetchval("select id from hrms_employees where user_id = $1 and status = 'active'", user_id)
    return emp is not None and await _in_audience(conn, row["entity_id"], emp)


files.register_reader(_ENTITY, _file_reader)


@router.get("/notices", response_model=list[NoticeOut])
async def list_notices(archived: bool = False, auth: AuthContext = Depends(perm("hrms.notice.read"))) -> list[NoticeOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            _SELECT + " where ($1 or n.archived_at is null) order by n.pinned desc, n.published_at desc limit 300",
            archived)
    return [_out(r) for r in rows]


@router.post("/notices", response_model=NoticeOut, status_code=status.HTTP_201_CREATED)
async def create_notice(body: NoticeCreate, auth: AuthContext = Depends(perm("hrms.notice.manage"))) -> NoticeOut:
    if body.audience == "department" and body.department_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick the department this notice is for")
    if body.audience == "location" and body.location_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick the location this notice is for")
    dept = body.department_id if body.audience == "department" else None
    loc = body.location_id if body.audience == "location" else None
    async with db.tenant_conn(auth.tenant_id) as conn:
        # Any id sent must be ours, even one the chosen audience doesn't use (P1-5).
        await refs.ensure_visible(conn, "hrms_departments", body.department_id)
        await refs.ensure_visible(conn, "hrms_locations", body.location_id)
        nid = await conn.fetchval(
            """insert into hrms_notices (tenant_id, title, body, requires_ack, audience, department_id, location_id,
                                         file_id, pinned, created_by)
               values ($1, btrim($2), $3, $4, $5, $6, $7, $8, $9, $10) returning id""",
            auth.tenant_id, body.title, body.body, body.requires_ack, body.audience, dept, loc, body.file_id,
            body.pinned, auth.user_id)
        # The attachment must be the caller's own fresh upload.
        if body.file_id is not None and await files.attach(
                conn, str(body.file_id), entity=_ENTITY, entity_id=str(nid), field="file",
                user_id=auth.user_id) is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Upload the file again, then post the notice")
        row = await conn.fetchrow(_SELECT + " where n.id = $1", nid)
        title = f"Please read and acknowledge: {row['title']}" if row["requires_ack"] else f"New notice: {row['title']}"
        for a in await conn.fetch(f"select a.* from hrms_notices n, lateral ({_AUDIENCE}) a where n.id = $1", nid):
            if a["user_id"] is not None and str(a["user_id"]) != auth.user_id:
                await notifications.create(conn, user_id=str(a["user_id"]), kind="info", title=title[:200],
                                           body=row["body"][:300], link="/me/notices")
    return _out(row)


@router.patch("/notices/{notice_id}", response_model=NoticeOut)
async def update_notice(notice_id: UUID, body: NoticeUpdate,
                        auth: AuthContext = Depends(perm("hrms.notice.manage"))) -> NoticeOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        done = await conn.fetchval(
            """update hrms_notices
                  set pinned = coalesce($2, pinned),
                      archived_at = case when $3::boolean is null then archived_at
                                         when $3 then coalesce(archived_at, now()) else null end
                where id = $1 returning id""", notice_id, body.pinned, body.archived)
        if done is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Notice not found")
        return _out(await conn.fetchrow(_SELECT + " where n.id = $1", notice_id))


@router.get("/notices/{notice_id}/acknowledgements", response_model=list[NoticeAck])
async def acknowledgements(notice_id: UUID, auth: AuthContext = Depends(perm("hrms.notice.read"))) -> list[NoticeAck]:
    """Everyone the notice is for, with when they acknowledged (null: not yet)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("select 1 from hrms_notices where id = $1", notice_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Notice not found")
        rows = await conn.fetch(
            f"""select a.id, a.name, k.acknowledged_at
                  from hrms_notices n cross join lateral ({_AUDIENCE}) a
                  left join hrms_notice_acks k on k.notice_id = n.id and k.employee_id = a.id
                 where n.id = $1 order by k.acknowledged_at nulls first, a.name""", notice_id)
    return [NoticeAck(employee_id=str(r["id"]), name=r["name"], acknowledged_at=r["acknowledged_at"]) for r in rows]


# ── The employee's own board (/me) ──────────────────────────────────────────
@portal.get("/notices", response_model=list[NoticeOut])
async def my_notices(auth: AuthContext = Depends(current_auth),
                     employee_id: str = Depends(current_employee)) -> list[NoticeOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            _SELECT + f""" where n.archived_at is null and exists ({_AUDIENCE} and e.id = $1)
                          order by n.pinned desc, n.published_at desc limit 100""", employee_id)
        mine = {r["notice_id"]: r["acknowledged_at"] for r in await conn.fetch(
            "select notice_id, acknowledged_at from hrms_notice_acks where employee_id = $1", employee_id)}
    # Policies still waiting for this employee come first.
    rows = sorted(rows, key=lambda r: not (r["requires_ack"] and r["id"] not in mine))
    return [_out(r, mine.get(r["id"])) for r in rows]


@portal.post("/notices/{notice_id}/acknowledge", response_model=NoticeOut)
async def acknowledge(notice_id: UUID, response: Response, auth: AuthContext = Depends(current_auth),
                      employee_id: str = Depends(current_employee)) -> NoticeOut:
    """Once: a second call returns the first acknowledgement unchanged."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await _in_audience(conn, notice_id, employee_id) or not await conn.fetchval(
                "select 1 from hrms_notices where id = $1 and archived_at is null", notice_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Notice not found")
        await conn.execute(
            """insert into hrms_notice_acks (tenant_id, notice_id, employee_id) values ($1, $2, $3)
               on conflict (notice_id, employee_id) do nothing""", auth.tenant_id, notice_id, employee_id)
        row = await conn.fetchrow(_SELECT + " where n.id = $1", notice_id)
        at = await conn.fetchval("select acknowledged_at from hrms_notice_acks where notice_id = $1 and employee_id = $2",
                                 notice_id, employee_id)
    return _out(row, at)
