"""The user-facing record timeline (St02 §6.5, D-07; table from migration 0044).

One stream per record of what happened to it: tracked field changes, stage
moves, won / lost / restored, notes, logged contacts and finished activities.

* Each entity type registers the fields worth showing (`register`). A field
  marked `sensitive` is written as "changed" with no values: the timeline is
  read by everyone who can see the record, while the audit log (admins only)
  keeps the full before/after from the same diff.
* Labels for ids (stage, owner, lost reason) are resolved when the event is
  written and stored with it, so renaming a stage later doesn't rewrite
  history.
* Reads page by keyset on (occurred_at desc, id desc).

The contacts module registers its own entity ("contact") the same way.
"""
from __future__ import annotations

import base64
import binascii
import datetime as dt
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import asyncpg

from . import audit
from .models import TimelineChange, TimelineEventOut, TimelineKind, TimelinePage


@dataclass(frozen=True)
class Tracked:
    label: str
    ref: str | None = None      # table whose `name` labels the id
    sensitive: bool = False


TRACKED: dict[str, dict[str, Tracked]] = {}

# Tables an id field may be labelled from; never interpolate anything else.
_REF_TABLES = {"crm_stages", "crm_lost_reasons", "users", "crm_pipelines"}


def register(entity_type: str, fields: dict[str, Tracked]) -> None:
    for spec in fields.values():
        if spec.ref is not None and spec.ref not in _REF_TABLES:
            raise ValueError(f"timeline can't label from {spec.ref!r}")
    TRACKED.setdefault(entity_type, {}).update(fields)


register("lead", {
    "stage_id": Tracked("Stage", ref="crm_stages"),
    "pipeline_id": Tracked("Pipeline", ref="crm_pipelines"),
    "owner_id": Tracked("Owner", ref="users"),
    "status": Tracked("Status"),
    "lost_reason_id": Tracked("Lost reason", ref="crm_lost_reasons"),
    "name": Tracked("Name"),
    "company": Tracked("Company"),
    # Personal contact details: "changed", never the numbers, on the timeline.
    "phone": Tracked("Phone", sensitive=True),
    "email": Tracked("Email", sensitive=True),
    "value_minor": Tracked("Value"),
    "probability": Tracked("Probability"),
    "expected_close_date": Tracked("Expected close"),
    "priority": Tracked("Priority"),
})


def _plain(v: Any) -> Any:
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    if isinstance(v, uuid.UUID):
        return str(v)
    return v


async def _labels(conn: asyncpg.Connection, table: str, ids: set[str]) -> dict[str, str]:
    if not ids:
        return {}
    rows = await conn.fetch(f"select id::text as id, name from {table} where id = any($1::uuid[])", list(ids))
    return {r["id"]: r["name"] for r in rows}


async def changes(conn: asyncpg.Connection, entity_type: str,
                  before: Mapping[str, Any], after: Mapping[str, Any]) -> list[dict[str, Any]]:
    """The tracked fields that differ, rendered for the timeline (masked where
    sensitive). Fields absent from `after` are not compared."""
    fields = TRACKED[entity_type]
    diff = [(f, _plain(before.get(f)), _plain(after.get(f))) for f in fields
            if f in after and _plain(before.get(f)) != _plain(after.get(f))]
    labels: dict[str, dict[str, str]] = {}
    for f, old, new in diff:
        ref = fields[f].ref
        if ref and not fields[f].sensitive:
            labels.setdefault(ref, {})
            labels[ref].update({str(x): "" for x in (old, new) if x is not None})
    for ref, known in labels.items():
        labels[ref] = await _labels(conn, ref, set(known))
    out: list[dict[str, Any]] = []
    for f, old, new in diff:
        spec = fields[f]
        if spec.sensitive:
            out.append({"field": f, "label": spec.label, "old": None, "new": None, "masked": True})
            continue
        entry: dict[str, Any] = {"field": f, "label": spec.label, "old": old, "new": new, "masked": False}
        if spec.ref:
            names = labels.get(spec.ref, {})
            entry["old_label"] = names.get(str(old)) if old is not None else None
            entry["new_label"] = names.get(str(new)) if new is not None else None
        out.append(entry)
    return out


async def record(conn: asyncpg.Connection, *, entity_type: str, entity_id: str, kind: TimelineKind,
                 changes: list[dict[str, Any]] | None = None, body: str | None = None,
                 payload: dict[str, Any] | None = None, contact_id: str | None = None,
                 source_ref: str | None = None, audit_action: str | None = None,
                 audit_changes: dict[str, list[Any]] | None = None) -> str | None:
    """Add an event to a record's timeline and return its id. With
    `audit_action`, also write the full-value diff to the audit log (where the
    database masks its own guard list). A repeated `source_ref` is a no-op
    (returns None)."""
    event_id = await conn.fetchval(
        """insert into timeline_events (tenant_id, entity_type, entity_id, contact_id, kind, actor_id,
                                        body, changes, payload, source_ref)
           values (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4,
                   nullif(current_setting('app.actor_id', true), '')::uuid, $5, $6, $7, $8)
           on conflict (tenant_id, source_ref) where source_ref is not null do nothing
           returning id""",
        entity_type, entity_id, contact_id, kind, body, changes or None, payload, source_ref)
    if audit_action is not None:
        await audit.event(conn, audit_action, entity_type, entity_id, changes=audit_changes or None)
    return str(event_id) if event_id is not None else None


def raw_diff(before: Mapping[str, Any], after: Mapping[str, Any]) -> dict[str, list[Any]]:
    """{"field": [old, new]} over the keys of `after` that changed: the audit shape."""
    return {k: [_plain(before.get(k)), _plain(v)] for k, v in after.items() if _plain(before.get(k)) != _plain(v)}


# ── Reading ─────────────────────────────────────────────────────────────────
def _encode(occurred_at: dt.datetime, event_id: str) -> str:
    return base64.urlsafe_b64encode(f"{occurred_at.isoformat()}|{event_id}".encode()).decode()


def _decode(cursor: str) -> tuple[dt.datetime, uuid.UUID]:
    """ValueError on anything that isn't a cursor we issued."""
    try:
        when, event_id = base64.urlsafe_b64decode(cursor.encode()).decode().split("|", 1)
        return dt.datetime.fromisoformat(when), uuid.UUID(event_id)
    except (binascii.Error, UnicodeDecodeError, ValueError) as e:
        raise ValueError("Not a timeline cursor") from e


def _change_list(raw: Any) -> list[TimelineChange]:
    """Events written by track() (Phase 2) store {"field": [old, new]};
    ours store a list of rendered changes. Both read the same way."""
    if isinstance(raw, dict):
        return [TimelineChange(field=k, label=k.replace("_", " ").capitalize(),
                               old=v[0] if isinstance(v, list) and v else None,
                               new=v[1] if isinstance(v, list) and len(v) > 1 else None)
                for k, v in raw.items()]
    if isinstance(raw, list):
        return [TimelineChange(**c) for c in raw if isinstance(c, dict)]
    return []


def event_out(r: asyncpg.Record) -> TimelineEventOut:
    return TimelineEventOut(
        id=str(r["id"]), kind=r["kind"], actor_id=str(r["actor_id"]) if r["actor_id"] else None,
        actor_name=r["actor_name"], body=r["body"], changes=_change_list(r["changes"]),
        payload=r["payload"], occurred_at=r["occurred_at"])


async def page(conn: asyncpg.Connection, entity_type: str, entity_id: str, *,
               cursor: str | None = None, limit: int = 50) -> TimelinePage:
    after = _decode(cursor) if cursor else None
    rows = await conn.fetch(
        """select e.id, e.kind, e.actor_id, u.name as actor_name, e.body, e.changes, e.payload, e.occurred_at
             from timeline_events e left join users u on u.id = e.actor_id
            where e.entity_type = $1 and e.entity_id = $2
              and ($3::timestamptz is null or (e.occurred_at, e.id) < ($3, $4::uuid))
            order by e.occurred_at desc, e.id desc
            limit $5""",
        entity_type, entity_id, after[0] if after else None, after[1] if after else None, limit + 1)
    items = [event_out(r) for r in rows[:limit]]
    nxt = _encode(rows[limit - 1]["occurred_at"], str(rows[limit - 1]["id"])) if len(rows) > limit else None
    return TimelinePage(items=items, next_cursor=nxt)
