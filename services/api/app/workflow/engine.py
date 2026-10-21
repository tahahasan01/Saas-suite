"""Workflow / ECA engine.

`emit()` is called inside a tenant_conn transaction after a domain event. It
loads the tenant's enabled workflows for that trigger, evaluates their
conditions against the event payload (safe, declarative — no eval), and runs
the matching actions. Action catalog: `notify` (in-app; external channels
plug in here later) and `create_activity` (plans an activity on the record
the event is about, St02 §6.10).
"""
from __future__ import annotations

from typing import Any

import datetime as dt

import asyncpg

from .. import activities, notifications

# Declarative triggers other modules emit. contact.created is emitted by the
# contacts module; activity.overdue by the crm.activity_overdue job.
TRIGGERS = ["lead.created", "lead.stage_changed", "interaction.logged",
            "lead.won", "lead.lost", "lead.restored",
            "activity.done", "activity.overdue", "contact.created"]

# Safe comparison operators.
OPS = {
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
    "gt": lambda a, b: a is not None and a > b,
    "gte": lambda a, b: a is not None and a >= b,
    "lt": lambda a, b: a is not None and a < b,
    "lte": lambda a, b: a is not None and a <= b,
    "contains": lambda a, b: b is not None and str(b).lower() in str(a).lower(),
    "in": lambda a, b: isinstance(b, list) and a in b,
}


def _match(conditions: list[dict], payload: dict[str, Any]) -> bool:
    for c in conditions:
        if not isinstance(c, dict):  # malformed rule → do not fire
            return False
        op = OPS.get(c.get("op", "eq"))
        if op is None:
            return False
        try:
            if not op(payload.get(c.get("field", "")), c.get("value")):
                return False
        except (TypeError, ValueError):
            return False
    return True


def _render(template: str, payload: dict[str, Any]) -> str:
    out = template
    for k, v in payload.items():
        out = out.replace("{" + k + "}", str(v))
    return out


async def _create_activity(conn: asyncpg.Connection, action: dict, payload: dict, actor_id: str) -> bool:
    """{type: create_activity, activity_type: <code or name>, summary, offset_days,
    assignee: owner|actor}. Plans it on the event's lead (or contact). Returns
    whether one was planned: an event about no record plans nothing."""
    if payload.get("lead_id"):
        entity_type, entity_id = "lead", str(payload["lead_id"])
    elif payload.get("contact_id") and "contact" in activities.ENTITY_TABLES:
        entity_type, entity_id = "contact", str(payload["contact_id"])
    else:
        return False
    typ = await activities.type_by_code_or_name(conn, action.get("activity_type"))
    if typ is None:
        return False
    try:
        offset = max(0, min(365, int(action.get("offset_days", 0))))
    except (TypeError, ValueError):
        offset = 0
    today: dt.date = await conn.fetchval("select current_date")
    assignee = payload.get("owner_id") if action.get("assignee", "owner") == "owner" else actor_id
    await activities.create(
        conn, entity_type=entity_type, entity_id=entity_id, type_id=str(typ["id"]),
        due_date=today + dt.timedelta(days=offset), created_by=actor_id,
        summary=_render(str(action.get("summary") or typ["name"]), payload)[:200],
        assigned_to=str(assignee or actor_id), automated=True)
    return True


async def _run_action(conn: asyncpg.Connection, action: dict, payload: dict, actor_id: str) -> None:
    if action.get("type") == "create_activity":
        await _create_activity(conn, action, payload, actor_id)
    elif action.get("type") == "notify":
        recipient = action.get("recipient", "owner")
        user_id = payload.get("owner_id") if recipient == "owner" else actor_id
        user_id = user_id or actor_id  # fall back to the actor if no owner
        await notifications.create(
            conn,
            user_id=str(user_id),
            title=_render(action.get("message", "Update"), payload),
            body=_render(action.get("body", ""), payload),
            kind=action.get("kind", "info"),
            link=action.get("link", "/crm"),
        )


async def emit(conn: asyncpg.Connection, actor_id: str, event: str, payload: dict[str, Any]) -> int:
    """Run all enabled workflows matching `event`. Returns actions fired."""
    rows = await conn.fetch(
        "select conditions, actions from workflows where trigger = $1 and enabled", event)
    fired = 0
    for row in rows:
        if _match(list(row["conditions"]), payload):
            for action in row["actions"]:
                await _run_action(conn, action, payload, actor_id)
                fired += 1
    return fired
