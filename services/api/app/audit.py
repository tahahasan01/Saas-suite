"""Audit trail and record timeline (D-07, migration 0044).

Three writers, each for one job:

* Field diffs on money, people and billing tables are written by the
  `audit_row()` trigger — nothing to call. Who did it comes from the request
  or job context that `db.tenant_conn()` stamps on the transaction.
* `event()` records a semantic event that no row change expresses: approve,
  login, export, module.enable (TRD TR-SEC-61). It goes through the
  `audit_event()` security-definer function; app_user cannot insert into
  audit_log itself.
* `track()` writes the user-facing timeline of one record (`timeline_events`)
  and, given `event=`, the matching semantic audit event too.

All three run inside a tenant_conn transaction, so they commit or roll back
with the change they describe. Partition and retention helpers for the worker
are at the bottom (owner connection only; see infra/audit/README.md).
"""
from __future__ import annotations

from typing import Any

import asyncpg

from .models import TimelineKind


def diff(before: dict[str, Any] | None, after: dict[str, Any] | None) -> dict[str, list[Any]]:
    """{"field": [before, after]} over both key sets — the shape of `changes`."""
    before, after = before or {}, after or {}
    return {k: [before.get(k), after.get(k)] for k in sorted(set(before) | set(after))
            if k not in before or k not in after or before[k] != after[k]}


async def event(conn: asyncpg.Connection, action: str, entity: str, entity_id: str | None = None, *,
                changes: dict[str, Any] | None = None, data: dict[str, Any] | None = None) -> None:
    """A semantic audit event, `action` as module.verb (e.g. 'module.enable').
    Fields on the guard list (cnic, salary_minor, iban, token, …) in `changes`
    are masked by the database."""
    await conn.execute("select audit_event($1, $2, $3, $4, $5)",
                       action, entity, entity_id, changes, data)


_event = event  # track()'s `event` parameter shadows the function inside it


async def track(conn: asyncpg.Connection, *, entity_type: str, entity_id: str, kind: TimelineKind,
                body: str | None = None, changes: dict[str, Any] | None = None,
                payload: dict[str, Any] | None = None, contact_id: str | None = None,
                source_ref: str | None = None, event: str | None = None,
                data: dict[str, Any] | None = None) -> None:
    """Add to a record's timeline. With `event`, also audit it as that
    semantic event (entity = entity_type). A repeated `source_ref` is a no-op,
    so a retried job does not double-post."""
    await conn.execute(
        """insert into timeline_events (tenant_id, entity_type, entity_id, contact_id, kind, actor_id,
                                        body, changes, payload, source_ref)
           values (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4,
                   nullif(current_setting('app.actor_id', true), '')::uuid, $5, $6, $7, $8)
           on conflict (tenant_id, source_ref) where source_ref is not null do nothing""",
        entity_type, entity_id, contact_id, kind, body, changes, payload, source_ref)
    if event is not None:
        await _event(conn, event, entity_type, entity_id, changes=changes, data=data)


async def record(
    conn: asyncpg.Connection,
    *,
    actor_id: str | None = None,
    action: str,
    entity: str,
    entity_id: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    """Pre-0044 signature, kept so older call sites keep working: the actor
    now comes from the request context, and before/after become a diff.
    New code calls `event()`."""
    await event(conn, action, entity, entity_id, changes=diff(before, after) or None)


# ── Worker maintenance (owner connection; schedule, don't call per request) ──
async def create_partitions(conn: asyncpg.Connection, months_ahead: int = 3) -> list[str]:
    """Ensure audit_log has this month and `months_ahead` more (TRD TR-SEC-62).
    Idempotent; returns the partitions it created. Run daily."""
    return [r[0] for r in await conn.fetch("select audit_log_create_partitions($1)", months_ahead)]


async def apply_retention(conn: asyncpg.Connection) -> int:
    """Delete rows older than each tenant's plan keeps (Starter 13 months,
    Growth 36, Enterprise 84; money/tax/payroll entities ≥ 72). Run monthly."""
    return await conn.fetchval("select audit_log_apply_retention()")


async def detach_expired_partitions(conn: asyncpg.Connection, keep_months: int = 84) -> list[str]:
    """Detach months older than every plan's window and return their table
    names. The caller archives each one to object storage, then drops it."""
    return [r[0] for r in await conn.fetch("select audit_log_detach_expired($1)", keep_months)]
