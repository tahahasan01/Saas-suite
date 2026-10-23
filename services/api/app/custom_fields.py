"""Custom fields on leads and contacts (wave D, C26, migration 0127).

An admin defines a field for leads or for contacts; its key is made from
the label once and never changes. Values live in the record's `custom`
object and every write is checked here against the active definitions:

* text      a string, at most 500 characters;
* number    a number (not true/false), finite;
* date      'YYYY-MM-DD';
* select    one of the field's choices;
* checkbox  true or false.

A write merges into what is there: keys sent with null are removed, keys
not sent are kept. A retired field keeps its old values but takes no new
ones, and a field's kind never changes under existing values.
"""
from __future__ import annotations

import math
import re
from datetime import date
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from .crm_selling_models import CustomFieldOut

TEXT_MAX = 500


def out(r: asyncpg.Record) -> CustomFieldOut:
    return CustomFieldOut(id=str(r["id"]), entity=r["entity"], key=r["key"], label=r["label"], kind=r["kind"],
                          options=list(r["options"]), position=r["position"], archived=r["archived_at"] is not None)


def slug(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    if not s or not s[0].isalpha():
        s = "field_" + s
    return s[:36].rstrip("_")


async def free_key(conn: asyncpg.Connection, entity: str, label: str) -> str:
    base = slug(label)
    taken = {r["key"] for r in await conn.fetch(
        "select key from custom_fields where entity = $1 and (key = $2 or key like $2 || '\\_%')", entity, base)}
    if base not in taken:
        return base
    n = 2
    while f"{base}_{n}" in taken:
        n += 1
    return f"{base}_{n}"


def _bad(label: str, what: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"{label}: {what}")


def _check(f: asyncpg.Record, value: Any) -> Any:
    kind, label = f["kind"], f["label"]
    if kind == "text":
        if not isinstance(value, str) or len(value) > TEXT_MAX:
            raise _bad(label, f"enter text of at most {TEXT_MAX} characters")
        return value.strip()
    if kind == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise _bad(label, "enter a number")
        return value
    if kind == "date":
        if isinstance(value, str) and len(value) == 10:
            try:
                return date.fromisoformat(value).isoformat()
            except ValueError:
                pass
        raise _bad(label, "enter a date as YYYY-MM-DD")
    if kind == "select":
        if value not in list(f["options"]):
            raise _bad(label, f"choose one of {', '.join(f['options'])}")
        return value
    if not isinstance(value, bool):
        raise _bad(label, "choose yes or no")
    return value


async def clean(conn: asyncpg.Connection, entity: str, values: dict[str, Any] | None,
                current: dict[str, Any] | None = None) -> dict[str, Any]:
    """`current` with `values` merged in, every new value checked."""
    merged = dict(current or {})
    if not values:
        return merged
    fields = {r["key"]: r for r in await conn.fetch(
        "select * from custom_fields where entity = $1 and archived_at is null", entity)}
    unknown = [k for k in values if k not in fields]
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown field: {', '.join(sorted(unknown))}")
    for key, value in values.items():
        if value is None or value == "":
            merged.pop(key, None)
        else:
            merged[key] = _check(fields[key], value)
    return merged
