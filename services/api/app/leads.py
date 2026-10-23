"""Lead lifecycle: stage moves, won / lost / restore, probability (D-31, St02 §6.3).

Every change to a lead goes through `save()`, which writes the row, the
timeline event (tracked fields, masked where sensitive), the audit diff and
the domain events, all in the caller's transaction:

* moving into an `is_won` stage wins the lead (`lead.won`); moving a won lead
  out reopens it;
* lost is a status: the stage is kept (the funnel counts from it), the
  probability drops to 0 and open activities are cancelled (`lead.lost`);
* restore reopens a lost lead (`lead.restored`);
* probability follows the stage (`default_probability`, 100 when won) unless
  someone set it by hand; `probability_auto` hands it back.
"""
from __future__ import annotations

import datetime as dt
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import rbac, scopes, timeline
from .deps import AuthContext
from .models import LeadOut, LeadStatus, TagOut, TimelineKind
from .workflow import engine as wf


async def ensure_in_scope(conn: asyncpg.Connection, auth: AuthContext, key: str, lead_id: str) -> None:
    """404 unless the lead is inside the caller's record scope for `key`
    (D-04: out of scope reads as "not found", never "forbidden")."""
    scope = await rbac.scope_of(conn, auth, key)
    if not await conn.fetchval(
            f"select 1 from crm_leads l where l.id = $1 and {scopes.where('crm.lead', scope, 'l')}", lead_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")

LEAD_SELECT = """
select l.*, s.is_won as stage_is_won, r.name as lost_reason,
       act.next_date as next_activity_date, tg.tags,
       case when act.next_date is null then null
            when act.next_date < current_date then 'overdue'
            when act.next_date = current_date then 'today'
            else 'planned' end as activity_state
  from crm_leads l
  join crm_stages s on s.id = l.stage_id
  left join crm_lost_reasons r on r.id = l.lost_reason_id
  left join lateral (
       select min(a.due_date) as next_date from activities a
        where a.entity_type = 'lead' and a.entity_id = l.id
          and a.done_at is null and a.cancelled_at is null) act on true
  left join lateral (
       select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)
                                 order by lower(t.name)), '[]'::jsonb) as tags
         from record_tags rt join tags t on t.id = rt.tag_id
        where rt.entity_type = 'lead' and rt.entity_id = l.id) tg on true"""


def weighted(value_minor: int, probability: int | None) -> int:
    """value × probability / 100 in paisa, half-up (the pricing spec's rule)."""
    if not probability:
        return 0
    n = value_minor * probability
    q, r = divmod(abs(n), 100)
    q += 1 if r >= 50 else 0
    return q if n >= 0 else -q


def _str(v: Any) -> str | None:
    return str(v) if v is not None else None


def lead_out(row: asyncpg.Record) -> LeadOut:
    d = dict(row)
    st: LeadStatus = d.get("status") or "open"
    return LeadOut(
        id=str(d["id"]), pipeline_id=str(d["pipeline_id"]), stage_id=str(d["stage_id"]),
        owner_id=_str(d["owner_id"]), name=d["name"], company=d["company"], phone=d["phone"],
        email=d["email"], source=d["source"], value_minor=d["value_minor"], currency=d["currency"],
        score=d["score"], created_at=d["created_at"],
        stage_kind={"open": "active"}.get(st, st),
        status=st, lost_reason_id=_str(d.get("lost_reason_id")), lost_reason=d.get("lost_reason"),
        lost_note=d.get("lost_note"), won_at=d.get("won_at"), lost_at=d.get("lost_at"),
        probability=d.get("probability"), probability_is_manual=bool(d.get("probability_is_manual")),
        weighted_value_minor=weighted(d["value_minor"], d.get("probability")),
        expected_close_date=d.get("expected_close_date"), priority=d.get("priority") or 0,
        stage_entered_at=d.get("stage_entered_at"), activity_state=d.get("activity_state"),
        next_activity_date=d.get("next_activity_date"),
        tags=[TagOut(id=str(t["id"]), name=t["name"], color=t["color"]) for t in d.get("tags") or []],
        line_count=d.get("line_count") or 0,
    )


async def fetch(conn: asyncpg.Connection, lead_id: str) -> asyncpg.Record | None:
    return await conn.fetchrow(LEAD_SELECT + " where l.id = $1", lead_id)


async def fetch_out(conn: asyncpg.Connection, lead_id: str) -> LeadOut:
    row = await fetch(conn, lead_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    return lead_out(row)


def event_payload(row: asyncpg.Record | dict[str, Any], stage_kind: str | None = None) -> dict[str, Any]:
    return {
        "lead_id": str(row["id"]), "name": row["name"], "company": row["company"],
        "value_minor": row["value_minor"], "source": row["source"], "stage_kind": stage_kind,
        "status": row["status"], "owner_id": _str(row["owner_id"]),
    }


async def stage(conn: asyncpg.Connection, stage_id: str) -> asyncpg.Record:
    row = await conn.fetchrow(
        "select id, pipeline_id, name, is_won, default_probability from crm_stages where id = $1", stage_id)
    if row is None:  # missing, or another tenant's (hidden by RLS)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stage not found")
    return row


def auto_probability(lead_status: str, stg: asyncpg.Record) -> int | None:
    if lead_status == "won":
        return 100
    if lead_status == "lost":
        return 0
    return 100 if stg["is_won"] else stg["default_probability"]


async def lock(conn: asyncpg.Connection, lead_id: str) -> asyncpg.Record:
    row = await conn.fetchrow("select * from crm_leads where id = $1 for update", lead_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    return row


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


async def plan_patch(conn: asyncpg.Connection, before: asyncpg.Record, fields: dict[str, Any]) -> dict[str, Any]:
    """Turn a PATCH body into the columns to write, applying the stage and
    probability rules."""
    patch = {k: v for k, v in fields.items() if k != "probability_auto"}
    status_now = before["status"]
    stg = None
    if "stage_id" in patch and str(patch["stage_id"]) != str(before["stage_id"]):
        stg = await stage(conn, patch["stage_id"])
        patch["pipeline_id"] = str(stg["pipeline_id"])
        patch["stage_entered_at"] = _now()
        if stg["is_won"] and status_now != "won":
            status_now = "won"
            patch.update(status="won", won_at=_now(), lost_at=None, lost_reason_id=None, lost_note=None)
        elif not stg["is_won"] and status_now == "won":
            status_now = "open"
            patch.update(status="open", won_at=None)
    else:
        patch.pop("stage_id", None)
    status_changed = status_now != before["status"]
    if "probability" in patch:
        patch["probability_is_manual"] = True
    elif status_changed and status_now == "won":
        # A win is 100%, whatever anyone guessed before.
        patch.update(probability=100, probability_is_manual=False)
    else:
        if fields.get("probability_auto"):
            patch["probability_is_manual"] = False
        manual = patch.get("probability_is_manual", before["probability_is_manual"])
        recompute = stg is not None or "probability_is_manual" in patch or status_changed
        if not manual and recompute:
            stg = stg or await stage(conn, before["stage_id"])
            patch["probability"] = auto_probability(status_now, stg)
    return patch


async def save(conn: asyncpg.Connection, actor_id: str, before: asyncpg.Record, patch: dict[str, Any], *,
               kind: TimelineKind | None = None, body: str | None = None) -> LeadOut:
    """Write `patch` to the lead, then its timeline event, audit diff and events."""
    if patch:
        cols = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(patch))
        row = await conn.fetchrow(
            f"update crm_leads set {cols}, updated_at = now() where id = $1 returning *",
            before["id"], *patch.values())
    else:
        row = before
    changes = await timeline.changes(conn, "lead", before, patch)
    became = row["status"] if row["status"] != before["status"] else None
    stage_moved = str(row["stage_id"]) != str(before["stage_id"])
    if kind is None:
        kind = ("won" if became == "won" else "stage_change" if stage_moved else "field_change")
    if changes or body or kind in ("won", "lost", "restored"):
        await timeline.record(conn, entity_type="lead", entity_id=str(row["id"]), kind=kind,
                              changes=changes, body=body, audit_action="lead.update",
                              audit_changes=timeline.raw_diff(before, patch))
    if stage_moved:
        stg = await stage(conn, row["stage_id"])
        await wf.emit(conn, actor_id, "lead.stage_changed",
                      event_payload(row, "won" if stg["is_won"] else "active"))
    if became == "won":
        await wf.emit(conn, actor_id, "lead.won", event_payload(row, "won"))
    elif became == "lost":
        await wf.emit(conn, actor_id, "lead.lost", {
            **event_payload(row), "lost_reason_id": _str(row["lost_reason_id"]), "lost_note": row["lost_note"]})
    elif became == "open" and before["status"] == "lost":
        await wf.emit(conn, actor_id, "lead.restored", event_payload(row))
    return await fetch_out(conn, str(row["id"]))


async def mark_won(conn: asyncpg.Connection, actor_id: str, lead_id: str) -> LeadOut:
    before = await lock(conn, lead_id)
    if before["status"] == "won":
        raise HTTPException(status.HTTP_409_CONFLICT, "This lead is already won")
    cur = await stage(conn, before["stage_id"])
    patch: dict[str, Any] = {"status": "won", "won_at": _now(), "lost_at": None, "lost_reason_id": None,
                             "lost_note": None, "probability": 100, "probability_is_manual": False}
    if not cur["is_won"]:
        won_id = await conn.fetchval(
            "select id from crm_stages where pipeline_id = $1 and is_won order by position limit 1",
            before["pipeline_id"])
        if won_id is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This pipeline has no won stage")
        patch.update(stage_id=won_id, stage_entered_at=_now())
    return await save(conn, actor_id, before, patch, kind="won")


async def mark_lost(conn: asyncpg.Connection, actor_id: str, lead_id: str,
                    reason_id: str | None, note: str | None) -> LeadOut:
    before = await lock(conn, lead_id)
    if before["status"] == "lost":
        raise HTTPException(status.HTTP_409_CONFLICT, "This lead is already lost")
    if reason_id is not None:
        active = await conn.fetchval("select active from crm_lost_reasons where id = $1", reason_id)
        if active is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lost reason not found")
        if not active:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That reason has been retired")
    note = (note or "").strip() or None
    patch = {"status": "lost", "lost_at": _now(), "lost_reason_id": reason_id, "lost_note": note,
             "won_at": None, "probability": 0}
    # Planned follow-ups on a dead deal are noise in My Day.
    await conn.execute(
        """update activities set cancelled_at = now(), updated_at = now()
            where entity_type = 'lead' and entity_id = $1 and done_at is null and cancelled_at is null""",
        lead_id)
    return await save(conn, actor_id, before, patch, kind="lost", body=note)


async def restore(conn: asyncpg.Connection, actor_id: str, lead_id: str) -> LeadOut:
    before = await lock(conn, lead_id)
    if before["status"] != "lost":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a lost lead can be restored")
    cur = await stage(conn, before["stage_id"])
    new_status = "won" if cur["is_won"] else "open"
    patch: dict[str, Any] = {"status": new_status, "lost_at": None, "lost_reason_id": None, "lost_note": None,
                             "probability_is_manual": False, "probability": auto_probability(new_status, cur)}
    if new_status == "won":
        patch["won_at"] = _now()
    return await save(conn, actor_id, before, patch, kind="restored")
