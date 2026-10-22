"""Onboarding and offboarding checklists (wave C, H23/H24, St12, 0100).

A template lists tasks with an owner and a due offset in days; starting a
boarding copies them, dated from the anchor (the joining date, or the last
working day when leaving). Without a template a starter list is used. A
boarding completes only when every task is done or skipped, and an
offboarding also waits for every asset to come back. Offboarding sets the
employee's exit date; cancelling it clears the date.

`hrms.boarding.read` sees boardings; `hrms.boarding.manage` runs them and
alone sees the exit interview. Employees tick their own tasks via /me.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import db, rbac, refs
from ..deps import AuthContext, current_auth, current_employee
from ..models import (BoardingClose, BoardingKind, BoardingOut, BoardingStatus, BoardingTaskCreate,
                      BoardingTaskOut, BoardingTaskUpdate, BoardingTemplateCreate, BoardingTemplateOut,
                      BoardingTemplateTaskIn, BoardingTemplateTaskOut, BoardingTemplateUpdate, ExitInterviewIn,
                      ExitInterviewOut, HeldAsset, MyBoardingTask, OffboardingStart, OnboardingStart)
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms"])
portal = APIRouter(prefix="/me", tags=["portal"])

READ, MANAGE = "hrms.boarding.read", "hrms.boarding.manage"

# Used when no template is chosen: a sensible first list, edited per person.
STARTER: dict[str, list[tuple[str, str, int]]] = {
    "onboarding": [
        ("Collect CNIC copy, photos and certificates", "hr", -3),
        ("Set up email, system accounts and devices", "it", -1),
        ("Issue assets (laptop, phone, ID card)", "hr", 0),
        ("Welcome and introduce to the team", "manager", 0),
        ("Read and acknowledge company policies", "employee", 1),
        ("Give bank details for salary", "employee", 3),
        ("Agree first-month goals", "manager", 7),
        ("Probation check-in", "manager", 30),
    ],
    "offboarding": [
        ("Confirm the last working day in writing", "hr", -30),
        ("Exit interview", "hr", -3),
        ("Hand over work and files", "manager", -2),
        ("Return company assets", "employee", 0),
        ("Close email and system access", "it", 0),
        ("Final settlement", "hr", 7),
        ("Experience letter", "hr", 7),
    ],
}


# ── Templates ───────────────────────────────────────────────────────────────
async def _template(conn: asyncpg.Connection, template_id: Any) -> BoardingTemplateOut:
    t = await conn.fetchrow("select * from hrms_boarding_templates where id = $1", template_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    tasks = await conn.fetch(
        "select * from hrms_boarding_template_tasks where template_id = $1 order by sort, offset_days", template_id)
    return BoardingTemplateOut(
        id=str(t["id"]), kind=t["kind"], name=t["name"], active=t["active"],
        tasks=[BoardingTemplateTaskOut(id=str(x["id"]), title=x["title"], owner=x["owner"],
                                       offset_days=x["offset_days"]) for x in tasks])


async def _replace_tasks(conn: asyncpg.Connection, tenant_id: str, template_id: Any,
                         tasks: list[BoardingTemplateTaskIn]) -> None:
    await conn.execute("delete from hrms_boarding_template_tasks where template_id = $1", template_id)
    await conn.executemany(
        """insert into hrms_boarding_template_tasks (tenant_id, template_id, title, owner, offset_days, sort)
           values ($1, $2, btrim($3), $4, $5, $6)""",
        [(tenant_id, template_id, x.title, x.owner, x.offset_days, i) for i, x in enumerate(tasks)])


@router.get("/boarding-templates", response_model=list[BoardingTemplateOut])
async def list_templates(kind: BoardingKind | None = None,
                         auth: AuthContext = Depends(perm(READ))) -> list[BoardingTemplateOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        ids = await conn.fetch(
            """select id from hrms_boarding_templates where ($1::text is null or kind = $1)
                order by not active, kind, name""", kind)
        return [await _template(conn, r["id"]) for r in ids]


@router.post("/boarding-templates", response_model=BoardingTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(body: BoardingTemplateCreate,
                          auth: AuthContext = Depends(perm(MANAGE))) -> BoardingTemplateOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        try:
            tid = await conn.fetchval(
                "insert into hrms_boarding_templates (tenant_id, kind, name) values ($1, $2, btrim($3)) returning id",
                auth.tenant_id, body.kind, body.name)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "A template with that name already exists")
        await _replace_tasks(conn, auth.tenant_id, tid, body.tasks)
        return await _template(conn, tid)


@router.patch("/boarding-templates/{template_id}", response_model=BoardingTemplateOut)
async def update_template(template_id: UUID, body: BoardingTemplateUpdate,
                          auth: AuthContext = Depends(perm(MANAGE))) -> BoardingTemplateOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        if not await conn.fetchval("select 1 from hrms_boarding_templates where id = $1 for update", template_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
        try:
            await conn.execute(
                """update hrms_boarding_templates set name = coalesce(btrim($2), name), active = coalesce($3, active)
                    where id = $1""", template_id, body.name, body.active)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "A template with that name already exists")
        if body.tasks is not None:
            await _replace_tasks(conn, auth.tenant_id, template_id, body.tasks)
        return await _template(conn, template_id)


# ── Boardings ───────────────────────────────────────────────────────────────
_SELECT = """select b.*, e.name as employee_name,
                    (select count(*) from hrms_boarding_tasks t where t.boarding_id = b.id) as total,
                    (select count(*) from hrms_boarding_tasks t
                      where t.boarding_id = b.id and t.status <> 'open') as done
               from hrms_boardings b join hrms_employees e on e.id = b.employee_id"""


def _task(r: asyncpg.Record) -> BoardingTaskOut:
    return BoardingTaskOut(id=str(r["id"]), boarding_id=str(r["boarding_id"]), title=r["title"], owner=r["owner"],
                           due_on=r["due_on"], status=r["status"], note=r["note"], done_at=r["done_at"])


def _summary(r: asyncpg.Record) -> BoardingOut:
    return BoardingOut(
        id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"], kind=r["kind"],
        template_id=str(r["template_id"]) if r["template_id"] else None, anchor_date=r["anchor_date"],
        status=r["status"], reason=r["reason"], notice_date=r["notice_date"], last_working_day=r["last_working_day"],
        note=r["note"], done=r["done"], total=r["total"], created_at=r["created_at"], closed_at=r["closed_at"])


async def _held_assets(conn: asyncpg.Connection, employee_id: Any) -> list[HeldAsset]:
    rows = await conn.fetch(
        """select a.id, a.name, a.tag from hrms_asset_assignments h join hrms_assets a on a.id = h.asset_id
            where h.employee_id = $1 and h.returned_at is null order by a.name""", employee_id)
    return [HeldAsset(id=str(r["id"]), name=r["name"], tag=r["tag"]) for r in rows]


async def _full(conn: asyncpg.Connection, auth: AuthContext, boarding_id: Any) -> BoardingOut:
    row = await conn.fetchrow(_SELECT + " where b.id = $1", boarding_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Boarding not found")
    out = _summary(row)
    out.tasks = [_task(t) for t in await conn.fetch(
        "select * from hrms_boarding_tasks where boarding_id = $1 order by due_on nulls last, sort", boarding_id)]
    if row["kind"] == "offboarding":
        out.assets_held = await _held_assets(conn, row["employee_id"])
        if await rbac.holds_key(conn, auth, MANAGE):      # the interview is confidential
            iv = await conn.fetchrow("select * from hrms_exit_interviews where boarding_id = $1", boarding_id)
            if iv is not None:
                out.exit_interview = ExitInterviewOut(
                    held_on=iv["held_on"], outcome=iv["outcome"], rating=iv["rating"],
                    primary_reason=iv["primary_reason"], would_rejoin=iv["would_rejoin"], notes=iv["notes"],
                    updated_at=iv["updated_at"])
    return out


async def _tasks_from(conn: asyncpg.Connection, kind: str, template_id: UUID | None) -> list[tuple[str, str, int]]:
    if template_id is None:
        return STARTER[kind]
    t = await conn.fetchrow("select kind, active from hrms_boarding_templates where id = $1", template_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    if t["kind"] != kind:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"That is an {t['kind']} template")
    if not t["active"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "That template is switched off")
    rows = await conn.fetch(
        "select title, owner, offset_days from hrms_boarding_template_tasks where template_id = $1 order by sort",
        template_id)
    return [(r["title"], r["owner"], r["offset_days"]) for r in rows]


async def _start(conn: asyncpg.Connection, auth: AuthContext, employee_id: UUID, kind: str,
                 template_id: UUID | None, anchor: date, **leaving: Any) -> UUID:
    tasks = await _tasks_from(conn, kind, template_id)
    try:
        bid = await conn.fetchval(
            """insert into hrms_boardings (tenant_id, employee_id, kind, template_id, anchor_date, reason, notice_date,
                                           last_working_day, note, created_by)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id""",
            auth.tenant_id, employee_id, kind, template_id, anchor, leaving.get("reason"), leaving.get("notice_date"),
            leaving.get("last_working_day"), leaving.get("note", ""), auth.user_id)
    except asyncpg.UniqueViolationError:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This person already has an open {kind}")
    await conn.executemany(
        """insert into hrms_boarding_tasks (tenant_id, boarding_id, title, owner, due_on, sort)
           values ($1, $2, $3, $4, $5, $6)""",
        [(auth.tenant_id, bid, title, owner, anchor + timedelta(days=offset), i)
         for i, (title, owner, offset) in enumerate(tasks)])
    return UUID(str(bid))


@router.post("/employees/{employee_id}/onboarding", response_model=BoardingOut, status_code=status.HTTP_201_CREATED)
async def start_onboarding(employee_id: UUID, body: OnboardingStart,
                           auth: AuthContext = Depends(perm(MANAGE))) -> BoardingOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        joined = await conn.fetchval("select join_date from hrms_employees where id = $1", employee_id)
        anchor = body.anchor_date or joined or await conn.fetchval("select current_date")
        bid = await _start(conn, auth, employee_id, "onboarding", body.template_id, anchor, note=body.note)
        return await _full(conn, auth, bid)


@router.post("/employees/{employee_id}/offboarding", response_model=BoardingOut, status_code=status.HTTP_201_CREATED)
async def start_offboarding(employee_id: UUID, body: OffboardingStart,
                            auth: AuthContext = Depends(perm(MANAGE))) -> BoardingOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        joined = await conn.fetchval("select join_date from hrms_employees where id = $1 for update", employee_id)
        if joined and body.last_working_day < joined:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The last working day is before they joined")
        bid = await _start(conn, auth, employee_id, "offboarding", body.template_id, body.last_working_day,
                           reason=body.reason, notice_date=body.notice_date,
                           last_working_day=body.last_working_day, note=body.note)
        await conn.execute("update hrms_employees set exit_date = $2, exit_reason = $3 where id = $1",
                           employee_id, body.last_working_day, body.reason)
        return await _full(conn, auth, bid)


@router.get("/boardings", response_model=list[BoardingOut])
async def list_boardings(kind: BoardingKind | None = None,
                         status_filter: BoardingStatus | None = Query(None, alias="status"),
                         auth: AuthContext = Depends(perm(READ))) -> list[BoardingOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            _SELECT + """ where ($1::text is null or b.kind = $1) and ($2::text is null or b.status = $2)
                          order by b.status = 'open' desc, b.anchor_date desc limit 500""", kind, status_filter)
    return [_summary(r) for r in rows]


@router.get("/boardings/{boarding_id}", response_model=BoardingOut)
async def get_boarding(boarding_id: UUID, auth: AuthContext = Depends(perm(READ))) -> BoardingOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _full(conn, auth, boarding_id)


async def _open_boarding(conn: asyncpg.Connection, boarding_id: Any) -> asyncpg.Record:
    row = await conn.fetchrow("select * from hrms_boardings where id = $1 for update", boarding_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Boarding not found")
    if row["status"] != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This {row['kind']} is {row['status']}")
    return row


@router.post("/boardings/{boarding_id}/tasks", response_model=BoardingTaskOut, status_code=status.HTTP_201_CREATED)
async def add_task(boarding_id: UUID, body: BoardingTaskCreate,
                   auth: AuthContext = Depends(perm(MANAGE))) -> BoardingTaskOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await _open_boarding(conn, boarding_id)
        row = await conn.fetchrow(
            """insert into hrms_boarding_tasks (tenant_id, boarding_id, title, owner, due_on, sort)
               values ($1, $2, btrim($3), $4, $5,
                       (select coalesce(max(sort), 0) + 1 from hrms_boarding_tasks where boarding_id = $2))
               returning *""", auth.tenant_id, boarding_id, body.title, body.owner, body.due_on)
        return _task(row)


async def _set_task(conn: asyncpg.Connection, auth: AuthContext, task: asyncpg.Record,
                    new_status: str | None, note: str | None, due_on: date | None) -> asyncpg.Record:
    note = task["note"] if note is None else note
    if new_status == "skipped" and not note.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Say why the task is skipped")
    closing = new_status in ("done", "skipped") and task["status"] == "open"
    reopening = new_status == "open" and task["status"] != "open"
    row = await conn.fetchrow(
        """update hrms_boarding_tasks set status = coalesce($2, status), note = $3, due_on = coalesce($4, due_on),
                  done_at = case when $5 then now() when $6 then null else done_at end,
                  done_by = case when $5 then $7::uuid when $6 then null else done_by end
            where id = $1 returning *""",
        task["id"], new_status, note, due_on, closing, reopening, auth.user_id)
    assert row is not None
    return row


@router.patch("/boarding-tasks/{task_id}", response_model=BoardingTaskOut)
async def update_task(task_id: UUID, body: BoardingTaskUpdate,
                      auth: AuthContext = Depends(perm(MANAGE))) -> BoardingTaskOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        task = await conn.fetchrow("select * from hrms_boarding_tasks where id = $1", task_id)
        if task is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
        await _open_boarding(conn, task["boarding_id"])
        task = await conn.fetchrow("select * from hrms_boarding_tasks where id = $1 for update", task_id)
        return _task(await _set_task(conn, auth, task, body.status, body.note, body.due_on))


@router.post("/boardings/{boarding_id}/complete", response_model=BoardingOut)
async def complete(boarding_id: UUID, body: BoardingClose | None = None,
                   auth: AuthContext = Depends(perm(MANAGE))) -> BoardingOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        b = await _open_boarding(conn, boarding_id)
        left = await conn.fetchval(
            "select count(*) from hrms_boarding_tasks where boarding_id = $1 and status = 'open'", boarding_id)
        if left:
            raise HTTPException(status.HTTP_409_CONFLICT, f"{left} task(s) are still open: tick or skip them first")
        if b["kind"] == "offboarding":
            held = await _held_assets(conn, b["employee_id"])
            if held:
                raise HTTPException(status.HTTP_409_CONFLICT,
                                    "Still holding: " + ", ".join(a.name for a in held) + ". Take them back first")
        await conn.execute(
            """update hrms_boardings set status = 'completed', closed_at = now(), closed_by = $2,
                      note = case when $3 = '' then note else $3 end where id = $1""",
            boarding_id, auth.user_id, body.note if body else "")
        return await _full(conn, auth, boarding_id)


@router.post("/boardings/{boarding_id}/cancel", response_model=BoardingOut)
async def cancel(boarding_id: UUID, body: BoardingClose | None = None,
                 auth: AuthContext = Depends(perm(MANAGE))) -> BoardingOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        b = await _open_boarding(conn, boarding_id)
        await conn.execute(
            """update hrms_boardings set status = 'cancelled', closed_at = now(), closed_by = $2,
                      note = case when $3 = '' then note else $3 end where id = $1""",
            boarding_id, auth.user_id, body.note if body else "")
        if b["kind"] == "offboarding":       # they're staying after all
            await conn.execute(
                "update hrms_employees set exit_date = null, exit_reason = null where id = $1 and exit_date = $2",
                b["employee_id"], b["last_working_day"])
        return await _full(conn, auth, boarding_id)


@router.put("/boardings/{boarding_id}/exit-interview", response_model=BoardingOut)
async def save_exit_interview(boarding_id: UUID, body: ExitInterviewIn,
                              auth: AuthContext = Depends(perm(MANAGE))) -> BoardingOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        b = await conn.fetchrow("select kind from hrms_boardings where id = $1", boarding_id)
        if b is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Boarding not found")
        if b["kind"] != "offboarding":
            raise HTTPException(status.HTTP_409_CONFLICT, "Only a leaver has an exit interview")
        await conn.execute(
            """insert into hrms_exit_interviews (tenant_id, boarding_id, held_on, outcome, rating, primary_reason,
                                                 would_rejoin, notes, updated_by)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               on conflict (boarding_id) do update set held_on = excluded.held_on, outcome = excluded.outcome,
                  rating = excluded.rating, primary_reason = excluded.primary_reason,
                  would_rejoin = excluded.would_rejoin, notes = excluded.notes, updated_by = excluded.updated_by,
                  updated_at = now()""",
            auth.tenant_id, boarding_id, body.held_on, body.outcome, body.rating, body.primary_reason,
            body.would_rejoin, body.notes, auth.user_id)
        return await _full(conn, auth, boarding_id)


# ── The employee's own tasks (/me) ──────────────────────────────────────────
_MINE = """select t.*, b.kind from hrms_boarding_tasks t join hrms_boardings b on b.id = t.boarding_id
            where b.employee_id = $1 and b.status = 'open' and t.owner = 'employee'"""


def _mine(r: asyncpg.Record) -> MyBoardingTask:
    return MyBoardingTask(**_task(r).model_dump(), kind=r["kind"])


@portal.get("/boarding", response_model=list[MyBoardingTask])
async def my_tasks(auth: AuthContext = Depends(current_auth),
                   employee_id: str = Depends(current_employee)) -> list[MyBoardingTask]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_MINE + " order by t.status <> 'open', t.due_on nulls last, t.sort", employee_id)
    return [_mine(r) for r in rows]


@portal.post("/boarding-tasks/{task_id}/done", response_model=MyBoardingTask)
async def my_task_done(task_id: UUID, auth: AuthContext = Depends(current_auth),
                       employee_id: str = Depends(current_employee)) -> MyBoardingTask:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        task = await conn.fetchrow(_MINE + " and t.id = $2 for update of t", employee_id, task_id)
        if task is None:                    # not theirs, not theirs to tick, or closed
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
        await _set_task(conn, auth, task, "done", None, None)
        return _mine(await conn.fetchrow(_MINE + " and t.id = $2", employee_id, task_id))
