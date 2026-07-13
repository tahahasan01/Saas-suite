"""Workflow / ECA engine.

`emit()` is called inside a tenant_conn transaction after a domain event. It
loads the tenant's enabled workflows for that trigger, evaluates their
conditions against the event payload (safe, declarative — no eval), and runs
the matching actions. v1 action catalog: `notify` (in-app; external channels
plug in here later).
"""
from __future__ import annotations

from typing import Any

import asyncpg

from .. import notifications

# Declarative triggers other modules emit.
TRIGGERS = ["lead.created", "lead.stage_changed", "interaction.logged"]

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
            if not op(payload.get(c.get("field")), c.get("value")):
                return False
        except (TypeError, ValueError):
            return False
    return True


def _render(template: str, payload: dict[str, Any]) -> str:
    out = template
    for k, v in payload.items():
        out = out.replace("{" + k + "}", str(v))
    return out


async def _run_action(conn: asyncpg.Connection, action: dict, payload: dict, actor_id: str) -> None:
    if action.get("type") == "notify":
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
