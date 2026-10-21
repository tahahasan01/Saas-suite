"""Record scopes (D-04, St04 #10): own < team < branch < all.

A scope narrows which rows of a scoped resource a caller may read or write.
It is an application predicate ANDed into the query, on top of RLS (which
stays the hard tenant boundary, and with org-data's branch policy, the branch
boundary):

    scope = await rbac.scope_of(conn, auth, "crm.lead.read")
    rows = await conn.fetch(f"select … from crm_leads l where {scopes.where('crm.lead', scope, 'l')}")

    # writes: an out-of-scope row is simply not found -> 404, never 403, so
    # the caller learns nothing about records they can't see.
    row = await conn.fetchrow(f"update crm_leads l set … where l.id=$1 and {scopes.where(...)} returning l.id")
    scopes.found_or_404(row, "Lead")

What each scope means:
- own    — the record's owner column is the caller (`app.actor_id`, set by
           tenant_conn for every request);
- team   — own, or the owner shares a team with the caller (team_members),
           or the caller leads the owner's team (teams.lead_user_id);
- branch — every record the branch policy lets through (RLS narrows it);
- all    — every record in the tenant.

Each scoped resource names its ownership column in its module manifest
(`ModuleSpec.scoped`), e.g. crm.lead -> owner_id, pos.sale -> cashier_id.
"""
from __future__ import annotations

import re
from typing import Any, Literal

from fastapi import HTTPException, status

from .modules import MODULES

Scope = Literal["own", "team", "branch", "all"]

OWNERSHIP: dict[str, str] = {res: col for m in MODULES.values() for res, col in m.scoped.items()}

# Keys whose EVERY route applies `where()` -> those routes ("METHOD /path").
# Only these keys may be granted, or count, at a scope narrower than 'all'
# (app/rbac.py treats a narrow grant on any other key as not held), and
# tests/core/test_scope_wiring.py checks that every route guarded by one of
# them is listed here. Wiring a new route = apply where() and add it here.
WIRED: dict[str, tuple[str, ...]] = {
    "crm.lead.read": ("GET /crm/leads", "GET /crm/leads/{lead_id}", "GET /crm/leads/{lead_id}/timeline",
                      "GET /crm/leads/{lead_id}/contact", "GET /activities"),
    "crm.lead.update": ("PATCH /crm/leads/{lead_id}", "POST /crm/leads/{lead_id}/won",
                        "POST /crm/leads/{lead_id}/lost", "POST /crm/leads/{lead_id}/restore",
                        "POST /crm/leads/{lead_id}/notes", "POST /contacts/review/{item_id}/dismiss"),
    "pos.sale.read": ("GET /pos/sales/{sale_id}",),
    "pos.sale.refund": ("POST /pos/sales/{sale_id}/returns",),
}

# Routes guarded by a narrowable key that return none of its resource's
# records (reference lists, or only the caller's own assignments), so there
# is nothing to narrow. Each entry is a reviewed exception; the scope-wiring
# test fails on any guarded route that is in neither list.
EXEMPT: dict[str, tuple[str, ...]] = {
    "crm.lead.read": ("GET /crm/pipelines", "GET /crm/lost-reasons", "GET /activity-types",
                      "GET /activities/summary"),
}

_ACTOR = "nullif(current_setting('app.actor_id', true), '')::uuid"
_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")


def resource_of(key: str) -> str:
    """'crm.lead.read' -> 'crm.lead'."""
    return key.rsplit(".", 1)[0]


def is_scoped(key_or_resource: str) -> bool:
    """The resource has an ownership column (it *can* be scoped)."""
    r = key_or_resource if key_or_resource in OWNERSHIP else resource_of(key_or_resource)
    return r in OWNERSHIP


def narrowable(key: str) -> bool:
    """A scope narrower than 'all' means something for `key` today: every
    route it guards applies the predicate."""
    return key in WIRED and is_scoped(key)


def where(resource: str, scope: Scope | None, alias: str) -> str:
    """The SQL predicate limiting `alias` (a row of `resource`) to `scope`.
    None (not held) matches nothing. Only identifiers from code reach the
    SQL: the alias is checked and the column comes from a manifest."""
    if resource not in OWNERSHIP:
        raise ValueError(f"{resource!r} is not a scoped resource (declare it in its module manifest)")
    if not _IDENT.match(alias):
        raise ValueError(f"bad table alias {alias!r}")
    if scope is None:
        return "false"
    if scope in ("branch", "all"):
        return "true"
    col = f"{alias}.{OWNERSHIP[resource]}"
    if scope == "own":
        return f"({col} = {_ACTOR})"
    if scope == "team":
        return (f"({col} = {_ACTOR} or {col} in ("
                f"select tm2.user_id from team_members tm1 join team_members tm2 on tm2.team_id = tm1.team_id"
                f" where tm1.user_id = {_ACTOR}"
                f" union select tm.user_id from team_members tm join teams t on t.id = tm.team_id"
                f" where t.lead_user_id = {_ACTOR}))")
    raise ValueError(f"unknown scope {scope!r}")


def found_or_404(row: Any, what: str = "Record") -> Any:
    """A write outside scope touched nothing: answer as if it didn't exist."""
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")
    return row
