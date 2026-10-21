"""Activities and activity types (D-32, St02 §6.4, §6.10) — My Day's API.

`GET /activities` lists the caller's open activities, due first (or anyone's
with `assigned=all`, or a record's with `entity_id`); `GET /activities/summary`
feeds the nav badge. Today is the tenant's business day.
Reads need crm:read; planning and finishing need `crm.activity.manage`;
editing the type list needs `crm.settings.manage`.
"""
from __future__ import annotations

from typing import Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from .. import activities, db
from ..deps import AuthContext
from ..models import (
    ACTIVITY_STATES,
    ActivityCreate,
    ActivityDone,
    ActivityEntity,
    ActivityOut,
    ActivitySnooze,
    ActivitySummary,
    ActivityTypeCreate,
    ActivityTypeOut,
    ActivityTypeUpdate,
    ActivityUpdate,
)
from ..rbac import perm

router = APIRouter(tags=["activities"])


def _states(raw: str | None) -> list[str]:
    if not raw:
        return ["overdue", "today", "planned"]
    wanted = [s.strip() for s in raw.split(",") if s.strip()]
    bad = [s for s in wanted if s not in ACTIVITY_STATES]
    if bad:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown state: {', '.join(bad)}")
    return wanted


@router.get("/activities", response_model=list[ActivityOut])
async def list_activities(
    state: str | None = Query(None, description="Comma list of overdue, today, planned, done, cancelled"),
    assigned: Literal["me", "all"] | None = None,
    entity_type: ActivityEntity | None = None,
    entity_id: str | None = None,
    limit: int = Query(200, ge=1, le=500),
    auth: AuthContext = Depends(perm("crm.lead.read")),
) -> list[ActivityOut]:
    states = _states(state)
    # A record's activities are everyone's; otherwise "mine" unless asked.
    who = assigned or ("all" if entity_id else "me")
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            f"""select * from ({activities.SELECT}) a
                 where a.state = any($1::text[])
                   and ($2::uuid is null or a.assigned_to = $2)
                   and ($3::text is null or a.entity_type = $3)
                   and ($4::uuid is null or a.entity_id = $4)
                 order by a.due_date, a.due_at nulls last, a.created_at
                 limit $5""",
            states, auth.user_id if who == "me" else None, entity_type, entity_id, limit)
    return [activities.out(r) for r in rows]


@router.get("/activities/summary", response_model=ActivitySummary)
async def activity_summary(auth: AuthContext = Depends(perm("crm.lead.read"))) -> ActivitySummary:
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            f"""select count(*) filter (where due_date < current_date) as overdue,
                       count(*) filter (where due_date = current_date) as today,
                       count(*) filter (where due_date > current_date) as planned
                  from activities a
                 where a.assigned_to = $1 and {activities.OPEN}""", auth.user_id)
    return ActivitySummary(overdue=row["overdue"], today=row["today"], planned=row["planned"])


@router.post("/activities", response_model=ActivityOut, status_code=status.HTTP_201_CREATED)
async def create_activity(body: ActivityCreate, auth: AuthContext = Depends(perm("crm.activity.manage"))) -> ActivityOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await activities.create(
            conn, entity_type=body.entity_type, entity_id=body.entity_id, type_id=body.type_id,
            due_date=body.due_date, due_at=body.due_at, created_by=auth.user_id, summary=body.summary,
            note=body.note, assigned_to=body.assigned_to)
    return activities.out(row)


@router.patch("/activities/{activity_id}", response_model=ActivityOut)
async def update_activity(activity_id: str, body: ActivityUpdate,
                          auth: AuthContext = Depends(perm("crm.activity.manage"))) -> ActivityOut:
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None or k == "due_at"}
    async with db.tenant_conn(auth.tenant_id) as conn:
        await activities.lock_open(conn, activity_id)
        if "type_id" in fields:
            await activities.active_type(conn, fields["type_id"])
        await activities.ensure_user(conn, fields.get("assigned_to"))
        if "due_date" in fields or "due_at" in fields:
            fields.update(reminder_sent_at=None, overdue_notified_at=None)
        if fields:
            cols = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
            await conn.execute(f"update activities set {cols}, updated_at = now() where id = $1",
                               activity_id, *fields.values())
        return activities.out(await activities.fetch(conn, activity_id))


@router.post("/activities/{activity_id}/done", response_model=ActivityOut)
async def complete_activity(activity_id: str, body: ActivityDone,
                            auth: AuthContext = Depends(perm("crm.activity.manage"))) -> ActivityOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await activities.complete(conn, auth.user_id, activity_id, outcome=body.outcome, feedback=body.feedback)
        if body.next is not None:
            await activities.create(
                conn, entity_type=row["entity_type"], entity_id=str(row["entity_id"]), type_id=body.next.type_id,
                due_date=body.next.due_date, created_by=auth.user_id, summary=body.next.summary,
                assigned_to=str(row["assigned_to"]) if row["assigned_to"] else auth.user_id)
    return activities.out(row)


@router.post("/activities/{activity_id}/snooze", response_model=ActivityOut)
async def snooze_activity(activity_id: str, body: ActivitySnooze,
                          auth: AuthContext = Depends(perm("crm.activity.manage"))) -> ActivityOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await activities.lock_open(conn, activity_id)
        await conn.execute(
            """update activities set due_date = due_date + $2::int, due_at = due_at + make_interval(days => $2::int),
                      reminder_sent_at = null, overdue_notified_at = null, updated_at = now()
                where id = $1""", activity_id, body.days)
        return activities.out(await activities.fetch(conn, activity_id))


@router.post("/activities/{activity_id}/cancel", response_model=ActivityOut)
async def cancel_activity(activity_id: str, auth: AuthContext = Depends(perm("crm.activity.manage"))) -> ActivityOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await activities.lock_open(conn, activity_id)
        await conn.execute("update activities set cancelled_at = now(), updated_at = now() where id = $1", activity_id)
        return activities.out(await activities.fetch(conn, activity_id))


# ── Activity types ──────────────────────────────────────────────────────────
def _type(r: asyncpg.Record) -> ActivityTypeOut:
    return ActivityTypeOut(id=str(r["id"]), name=r["name"], code=r["code"], icon=r["icon"],
                           default_days=r["default_days"], position=r["position"], active=r["active"])


@router.get("/activity-types", response_model=list[ActivityTypeOut])
async def list_activity_types(include_retired: bool = False,
                              auth: AuthContext = Depends(perm("crm.lead.read"))) -> list[ActivityTypeOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            "select * from activity_types where active or $1 order by active desc, position, name", include_retired)
    return [_type(r) for r in rows]


@router.post("/activity-types", response_model=ActivityTypeOut, status_code=status.HTTP_201_CREATED)
async def create_activity_type(body: ActivityTypeCreate,
                               auth: AuthContext = Depends(perm("crm.settings.manage"))) -> ActivityTypeOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """insert into activity_types (tenant_id, name, icon, default_days, position)
                       values ($1, $2, $3, $4, (select coalesce(max(position), 0) + 1 from activity_types))
                       returning *""", auth.tenant_id, body.name.strip(), body.icon, body.default_days)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "There's already a type with that name")
    return _type(row)


@router.patch("/activity-types/{type_id}", response_model=ActivityTypeOut)
async def update_activity_type(type_id: str, body: ActivityTypeUpdate,
                               auth: AuthContext = Depends(perm("crm.settings.manage"))) -> ActivityTypeOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """update activity_types set name = coalesce($2, name), icon = coalesce($3, icon),
                              default_days = coalesce($4, default_days), position = coalesce($5, position)
                        where id = $1 returning *""",
                    type_id, body.name.strip() if body.name else None, body.icon, body.default_days, body.position)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "There's already a type with that name")
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activity type not found")
    return _type(row)


@router.delete("/activity-types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity_type(type_id: str, response: Response,
                               auth: AuthContext = Depends(perm("crm.settings.manage"))) -> Response:
    """Retires the type: it leaves the picker, old activities keep their label,
    and automations naming it fall back to To-do."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("update activity_types set active = false where id = $1 returning 1", type_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Activity type not found")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
