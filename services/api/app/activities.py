"""Activities: planned, typed work on a record (D-32, St02 §6.4, migration 0063).

An activity is open until it is done or cancelled. Its state is computed in
SQL against the tenant's business day (tenant_conn sets the session time
zone), never stored, so it can't go stale:

    done | cancelled | overdue (due before today) | today | planned

Finishing one writes an `activity_done` event on the record's timeline and
fires `activity.done`. Records are polymorphic, like timeline_events:
`ENTITY_TABLES` names the table behind each entity type ('contact' is
registered by the contacts module).
"""
from __future__ import annotations

import datetime as dt
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import timeline
from .models import ActivityOut

# entity_type -> the table holding the record (its `name` labels the activity).
ENTITY_TABLES: dict[str, str] = {"lead": "crm_leads"}

STATE_SQL = """case when a.done_at is not null then 'done'
                    when a.cancelled_at is not null then 'cancelled'
                    when a.due_date < current_date then 'overdue'
                    when a.due_date = current_date then 'today'
                    else 'planned' end"""

SELECT = f"""
select a.*, {STATE_SQL} as state, t.name as type_name, t.icon as type_icon, t.code as type_code,
       u.name as assigned_name,
       case a.entity_type when 'lead' then (select l.name from crm_leads l where l.id = a.entity_id) end as entity_name,
       case a.entity_type when 'lead' then (select l.owner_id from crm_leads l where l.id = a.entity_id) end as entity_owner
  from activities a
  join activity_types t on t.id = a.type_id
  left join users u on u.id = a.assigned_to"""

OPEN = "a.done_at is null and a.cancelled_at is null"


def out(r: asyncpg.Record) -> ActivityOut:
    return ActivityOut(
        id=str(r["id"]), entity_type=r["entity_type"], entity_id=str(r["entity_id"]),
        entity_name=r["entity_name"], type_id=str(r["type_id"]), type_name=r["type_name"],
        type_icon=r["type_icon"], summary=r["summary"], note=r["note"], due_date=r["due_date"],
        due_at=r["due_at"], assigned_to=str(r["assigned_to"]) if r["assigned_to"] else None,
        assigned_name=r["assigned_name"], automated=r["automated"], state=r["state"],
        done_at=r["done_at"], outcome=r["outcome"], feedback=r["feedback"], created_at=r["created_at"])


async def fetch(conn: asyncpg.Connection, activity_id: str) -> asyncpg.Record:
    row = await conn.fetchrow(SELECT + " where a.id = $1", activity_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activity not found")
    return row


async def ensure_entity(conn: asyncpg.Connection, entity_type: str, entity_id: str) -> None:
    table = ENTITY_TABLES.get(entity_type)
    if table is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Activities on {entity_type} aren't available yet")
    if await conn.fetchval(f"select 1 from {table} where id = $1", entity_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Record not found")


async def active_type(conn: asyncpg.Connection, type_id: str) -> asyncpg.Record:
    row = await conn.fetchrow("select id, name, code, active from activity_types where id = $1", type_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activity type not found")
    if not row["active"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That activity type has been retired")
    return row


async def type_by_code_or_name(conn: asyncpg.Connection, key: str | None) -> asyncpg.Record | None:
    """An active type by its seeded code or its name; To-do when nothing matches."""
    row = None
    if key:
        row = await conn.fetchrow(
            """select id, name, code from activity_types
                where active and (code = $1 or lower(name) = lower($1)) order by position limit 1""", key)
    if row is None:
        row = await conn.fetchrow("select id, name, code from activity_types where active and code = 'todo' limit 1")
    return row


async def ensure_user(conn: asyncpg.Connection, user_id: str | None) -> None:
    if user_id is not None and await conn.fetchval("select 1 from users where id = $1", user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")


async def create(conn: asyncpg.Connection, *, entity_type: str, entity_id: str, type_id: str,
                 due_date: dt.date, created_by: str | None, summary: str = "", note: str = "",
                 due_at: dt.datetime | None = None, assigned_to: str | None = None,
                 automated: bool = False, source_ref: str | None = None) -> asyncpg.Record:
    await ensure_entity(conn, entity_type, entity_id)
    typ = await active_type(conn, type_id)
    await ensure_user(conn, assigned_to)
    new_id = await conn.fetchval(
        """insert into activities (tenant_id, entity_type, entity_id, type_id, summary, note, due_date, due_at,
                                   assigned_to, created_by, automated, source_ref)
           values (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           on conflict (tenant_id, source_ref) where source_ref is not null do nothing
           returning id""",
        entity_type, entity_id, type_id, summary.strip() or typ["name"], note, due_date, due_at,
        assigned_to or created_by, created_by, automated, source_ref)
    if new_id is None:  # a repeated source_ref: the earlier one stands
        new_id = await conn.fetchval("select id from activities where source_ref = $1", source_ref)
    return await fetch(conn, str(new_id))


def _require_open(row: asyncpg.Record) -> None:
    if row["state"] in ("done", "cancelled"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"This activity is already {row['state']}")


async def lock_open(conn: asyncpg.Connection, activity_id: str) -> asyncpg.Record:
    if await conn.fetchval("select 1 from activities where id = $1 for update", activity_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activity not found")
    row = await fetch(conn, activity_id)
    _require_open(row)
    return row


def event_payload(row: asyncpg.Record) -> dict[str, Any]:
    entity_type, entity_id = row["entity_type"], str(row["entity_id"])
    return {
        "activity_id": str(row["id"]), "entity_type": entity_type, "entity_id": entity_id,
        f"{entity_type}_id": entity_id, "name": row["entity_name"], "summary": row["summary"],
        "type": row["type_name"], "type_code": row["type_code"], "due_date": row["due_date"].isoformat(),
        "outcome": row["outcome"], "feedback": row["feedback"],
        "assigned_to": str(row["assigned_to"]) if row["assigned_to"] else None,
        "owner_id": str(row["entity_owner"]) if row["entity_owner"] else None,
    }


async def complete(conn: asyncpg.Connection, actor_id: str, activity_id: str, *, outcome: str | None,
                   feedback: str) -> asyncpg.Record:
    from .workflow import engine as wf  # engine plans activities too: import late, no cycle

    await lock_open(conn, activity_id)
    await conn.execute(
        """update activities set done_at = now(), done_by = $2, outcome = $3, feedback = $4, updated_at = now()
            where id = $1""", activity_id, actor_id, outcome, feedback.strip())
    row = await fetch(conn, activity_id)
    await timeline.record(
        conn, entity_type=row["entity_type"], entity_id=str(row["entity_id"]), kind="activity_done",
        body=row["feedback"] or None,
        payload={"activity_id": str(row["id"]), "type_name": row["type_name"], "type_code": row["type_code"],
                 "summary": row["summary"], "outcome": row["outcome"], "due_date": row["due_date"].isoformat()})
    await wf.emit(conn, actor_id, "activity.done", event_payload(row))
    return row
