"""Field guards and the response redactor (D-04, TR-SEC-32, St04 #11).

A guarded field (salary, CNIC, cost price …) is declared once, in its module
manifest (`ModuleSpec.field_guards`): the key needed to see it and the key
needed to change it. Then, in one place:

- `redact()` removes the field from a response row unless the caller holds the
  read key — *absent*, not null, so the client can tell "hidden" from "empty".
  A person always sees their own record (`self_owned=True`).
- `check_write()` refuses (403) a write that touches a guarded field without
  the write key.

`held` is the caller's permission map, `rbac.Principal.permissions()` — the
same map /auth/me returns. The audit trail masks the same fields in the
database (migration 0044's always-guarded list; a test keeps them in step).
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from fastapi import HTTPException, status

from .modules import MODULES, FieldGuard

GUARDS: dict[str, dict[str, FieldGuard]] = {}
for _m in MODULES.values():
    for _g in _m.field_guards:
        GUARDS.setdefault(_g.resource, {})[_g.field] = _g


def guarded(resource: str) -> dict[str, FieldGuard]:
    return GUARDS.get(resource, {})


def redact(resource: str, row: Mapping[str, Any], held: Mapping[str, str] | set[str], *,
           self_owned: bool = False) -> dict[str, Any]:
    """A copy of `row` without the guarded fields the caller may not see."""
    out = dict(row)
    if self_owned:
        return out
    for name, g in guarded(resource).items():
        if name in out and g.read not in held:
            del out[name]
    return out


def redact_many(resource: str, rows: Iterable[Mapping[str, Any]], held: Mapping[str, str] | set[str],
                *, self_id: str | None = None, owner_field: str = "user_id") -> list[dict[str, Any]]:
    """`redact` over a list; a row whose `owner_field` is `self_id` is the caller's own."""
    return [redact(resource, r, held, self_owned=self_id is not None and str(r.get(owner_field)) == self_id)
            for r in rows]


def check_write(resource: str, fields: Iterable[str], held: Mapping[str, str] | set[str]) -> None:
    """403 if `fields` (the ones a request sets) include a guarded field the
    caller may not change."""
    for name in fields:
        g = guarded(resource).get(name)
        if g is not None and g.write not in held:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {g.write} to change {name}")
