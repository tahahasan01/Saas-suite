"""Soft merge of contacts (D-33, St02 §6.6).

The losers are archived and point at the winner (merged_into_id); every row
that referenced a loser moves to the winner, all in the caller's single
transaction. Old ids stay resolvable (old receipts, links, webhooks), and the
losers' rows are snapshotted on the winner's timeline, so an admin "unmerge"
remains possible later.

REGISTRY is the list of every column that references contacts. A merge that
skipped one would leave records on an archived contact, so
tests/crm/test_contact_merge.py scans the schema and fails when a column is
missing here (St02 risk 8). Strategies:

* "repoint": UPDATE the column from the losers to the winner.
* "follow":  the table is append-only (timeline_events); rows are never
  rewritten and readers follow merged_into_id instead (merge chains are
  kept one hop deep by repointing contacts.merged_into_id).

Polymorphic references (no contact_id column) are handled in merge() too:
record_tags rows with entity_type 'contact', and timeline events with
entity_type 'contact' (followed, like the column).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

import asyncpg
from fastapi import HTTPException, status

from . import audit

Strategy = Literal["repoint", "follow"]

REGISTRY: dict[tuple[str, str], Strategy] = {
    ("contacts", "company_id"): "repoint",            # people of a merged company
    ("contacts", "merged_into_id"): "repoint",        # flatten earlier merges into the losers
    ("contact_addresses", "contact_id"): "repoint",   # duplicates dropped first
    ("contact_review_items", "resolved_contact_id"): "repoint",
    ("crm_leads", "contact_id"): "repoint",
    ("crm_invoice_requests", "contact_id"): "repoint",
    ("pos_sales", "contact_id"): "repoint",
    ("timeline_events", "contact_id"): "follow",      # append-only
}

MAX_RECORDS = 5  # winner plus at most four losers (D-33)

# Fields the user may take from any of the merged records.
FIELDS = ("name", "company_id", "company_name", "job_title", "phone", "email", "ntn", "strn", "city",
          "source", "notes", "owner_id")
# A choice of "phone" or "email" carries its matching key along.
_COLUMNS: dict[str, tuple[str, ...]] = {"phone": ("phone_raw", "phone_e164"), "email": ("email", "email_normalized")}


def register(table: str, column: str, strategy: Strategy) -> None:
    """For a module adding a column that references contacts."""
    REGISTRY[(table, column)] = strategy


def _jsonable(value: Any) -> Any:
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def snapshot(row: asyncpg.Record) -> dict[str, Any]:
    return {k: _jsonable(v) for k, v in dict(row).items()}


def _filled(row: asyncpg.Record, field: str) -> bool:
    value = row[_COLUMNS.get(field, (field,))[0]]
    return value is not None and value != ""


def _values(field: str, row: asyncpg.Record) -> dict[str, Any]:
    return {col: row[col] for col in _COLUMNS.get(field, (field,))}


def _differs(rows: list[asyncpg.Record], field: str) -> bool:
    col = _COLUMNS.get(field, (field,))[0]
    seen = {row[col] for row in rows if row[col] not in (None, "")}
    return len(seen) > 1


def differing_fields(rows: list[asyncpg.Record]) -> list[str]:
    return [f for f in FIELDS if _differs(rows, f)]


async def lock(conn: asyncpg.Connection, ids: list[UUID]) -> list[asyncpg.Record]:
    """The rows, locked, in the order asked. 404 when any isn't this tenant's."""
    rows = await conn.fetch("select * from contacts where id = any($1::uuid[]) order by id for update", ids)
    by_id = {r["id"]: r for r in rows}
    if len(by_id) != len(ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    return [by_id[i] for i in ids]


async def merge(conn: asyncpg.Connection, tenant_id: str, winner_id: UUID, loser_ids: list[UUID],
                choices: dict[str, UUID]) -> dict[str, int]:
    """Merge `loser_ids` into `winner_id`; returns rows moved per
    "table.column". Raises HTTPException on any rule broken, before writing."""
    ids = [winner_id, *loser_ids]
    if not loser_ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose at least one contact to merge in")
    if len(set(ids)) != len(ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A contact appears twice in the merge")
    if len(ids) > MAX_RECORDS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Merge at most {MAX_RECORDS} contacts at a time")
    unknown = set(choices) - set(FIELDS)
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Can't choose {', '.join(sorted(unknown))}")
    if any(src not in ids for src in choices.values()):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A chosen value must come from a merged contact")

    rows = await lock(conn, ids)
    winner, losers = rows[0], rows[1:]
    if any(r["merged_into_id"] is not None for r in rows):
        raise HTTPException(status.HTTP_409_CONFLICT, "One of these contacts was already merged")
    if winner["archived_at"] is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Restore the contact you keep before merging into it")
    if len({r["kind"] for r in rows}) > 1:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "People and companies can't be merged together")
    if len({r["ntn"] for r in rows if r["ntn"]}) > 1 and "ntn" not in choices:
        raise HTTPException(status.HTTP_409_CONFLICT, "These contacts have different NTNs; choose which one to keep")

    # Field values: the user's choice, else the winner's, else the most
    # recently updated loser's.
    by_id = {r["id"]: r for r in rows}
    recent = sorted(losers, key=lambda r: r["updated_at"], reverse=True)
    cols: dict[str, Any] = {}
    for field in FIELDS:
        if field in choices:
            cols.update(_values(field, by_id[choices[field]]))
        elif not _filled(winner, field):
            donor = next((r for r in recent if _filled(r, field)), None)
            if donor is not None:
                cols.update(_values(field, donor))
    if cols.get("company_id") in ids:
        cols["company_id"] = None  # can't belong to a contact merged away (or to itself)
    roles = sorted({role for r in rows for role in r["roles"]})

    losers_ids = list(loser_ids)
    moved: dict[str, int] = {}
    # Addresses the winner already has (same first line and city) are dropped.
    await conn.execute(
        """delete from contact_addresses a where a.contact_id = any($2::uuid[])
             and exists (select 1 from contact_addresses w where w.contact_id = $1
                          and lower(trim(w.line1)) = lower(trim(a.line1)) and lower(trim(w.city)) = lower(trim(a.city)))""",
        winner_id, losers_ids)
    for (table, column), strategy in REGISTRY.items():
        if strategy != "repoint":
            continue
        done = await conn.execute(
            f"update {table} set {column} = $1 where {column} = any($2::uuid[])", winner_id, losers_ids)
        moved[f"{table}.{column}"] = int(done.split()[-1])
    await conn.execute(
        """insert into record_tags (tenant_id, tag_id, entity_type, entity_id)
           select distinct $1::uuid, tag_id, 'contact', $2::uuid from record_tags
            where entity_type = 'contact' and entity_id = any($3::uuid[])
           on conflict do nothing""", tenant_id, winner_id, losers_ids)
    await conn.execute(
        "delete from record_tags where entity_type = 'contact' and entity_id = any($1::uuid[])", losers_ids)

    cols["roles"] = roles
    sets = ", ".join(f"{k} = ${i}" for i, k in enumerate(cols, start=2))
    await conn.execute(f"update contacts set {sets}, updated_at = now() where id = $1", winner_id, *cols.values())
    await conn.execute(
        """update contacts set merged_into_id = $1, merged_at = now(), archived_at = coalesce(archived_at, now()),
                               updated_at = now()
            where id = any($2::uuid[])""", winner_id, losers_ids)

    names = ", ".join(r["name"] for r in losers)
    await audit.track(
        conn, entity_type="contact", entity_id=str(winner_id), contact_id=str(winner_id), kind="merge",
        body=f"Merged in: {names}",
        payload={"losers": [snapshot(r) for r in losers], "moved": moved,
                 "choices": {k: str(v) for k, v in choices.items()}},
        event="contacts.contact.merge",
        data={"winner_id": str(winner_id), "loser_ids": [str(i) for i in losers_ids], "moved": moved})
    for r in losers:
        await audit.track(conn, entity_type="contact", entity_id=str(r["id"]), contact_id=str(r["id"]),
                          kind="merge", body=f"Merged into {winner['name']}",
                          payload={"winner_id": str(winner_id)})
    return moved

