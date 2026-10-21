"""Role-based access control.

Two layers, one source of truth:

- `require(section, action)` is the old guard: 403 unless the caller may take
  that action (or 'admin') on the section, and the section is enabled.
- Permission keys (D-04, `module.resource.action`) are declared below, one
  `register()` block per module. Each key names the legacy (section, action)
  grant that enforced it before RBAC v2, so `perm(key)` guards like `require`
  did and `/auth/me` can tell the web which keys the caller holds. The web
  gates controls on keys, never on role names (P1-13).

Adding a module's keys is one more `register()` block. RBAC v2 (below the
catalog) adds several roles per user, role inheritance and a scope per grant;
key names and the `register()` / `perm()` / `require()` signatures stay put.
"""
from __future__ import annotations

import logging
import re
from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Literal

from fastapi import Depends, HTTPException, status

from . import db, modules
from .config import settings
from .deps import AuthContext, current_auth
from .models import SECTIONS

Scope = Literal["own", "team", "branch", "all"]

_KEY = re.compile(r"^[a-z_]+\.[a-z_]+\.[a-z_]+$")


@dataclass(frozen=True)
class Permission:
    key: str
    module: str
    section: str  # legacy grant that enforces it until RBAC v2
    action: str


PERMISSIONS: dict[str, Permission] = {}
MODULE_KEYS: dict[str, list[str]] = {}


def register(module: str, keys: dict[str, tuple[str, str]]) -> None:
    """Declare a module's permission keys as {key: (legacy section, action)}.
    All-or-nothing: a bad key registers none of the block."""
    for key in keys:
        if not _KEY.match(key) or key.split(".")[0] != module:
            raise ValueError(f"Permission key {key!r} must be '{module}.<resource>.<action>'")
        if key in PERMISSIONS:
            raise ValueError(f"Permission key {key!r} is already registered")
    for key, (section, action) in keys.items():
        PERMISSIONS[key] = Permission(key, module, section, action)
        MODULE_KEYS.setdefault(module, []).append(key)


# ── Catalog (12-trd §3.4 names; legacy mapping mirrors each route's guard) ───
register("settings", {
    "settings.team.read": ("settings", "read"),
    "settings.team.manage": ("settings", "admin"),
    "settings.roles.manage": ("settings", "admin"),
    "settings.modules.manage": ("settings", "admin"),
    "settings.billing.manage": ("settings", "admin"),
    "settings.workflows.read": ("settings", "read"),
    "settings.workflows.manage": ("settings", "admin"),
})
register("crm", {
    "crm.lead.read": ("crm", "read"),
    "crm.lead.create": ("crm", "write"),
    "crm.lead.update": ("crm", "write"),
    "crm.lead.import": ("crm", "write"),
    "crm.lead.export": ("crm", "read"),
    "crm.activity.manage": ("crm", "write"),
})
register("invoicing", {
    "invoicing.invoice.read": ("crm", "read"),
    "invoicing.invoice.create": ("crm", "write"),
    # Separation of duties: approval is its own grant, not "is the Owner".
    "invoicing.invoice.approve": ("accounts", "admin"),
})
register("pos", {
    "pos.sale.read": ("pos", "read"),
    "pos.sale.create": ("pos", "write"),
    "pos.sale.refund": ("pos", "write"),
    "pos.session.read": ("pos", "read"),
    "pos.session.open": ("pos", "write"),
    "pos.session.close": ("pos", "write"),
    "pos.report.sales": ("pos", "read"),
})
register("products", {
    "products.product.read": ("pos", "read"),
    "products.product.create": ("pos", "write"),
    "products.product.update": ("pos", "write"),
    "products.product.import": ("pos", "write"),
    "products.product.export": ("pos", "read"),
    # Cost price is a field guard (TR-SEC-32): who may see margins.
    "products.cost.read": ("pos", "admin"),
})
register("purchasing", {
    "purchasing.po.read": ("pos", "read"),
    "purchasing.po.create": ("pos", "write"),
    "purchasing.po.receive": ("pos", "write"),
    "purchasing.po.cancel": ("pos", "write"),
    "purchasing.supplier.read": ("pos", "read"),
    "purchasing.supplier.manage": ("pos", "write"),
})
register("fbr", {
    "fbr.settings.read": ("pos", "read"),
    "fbr.settings.manage": ("pos", "admin"),
    "fbr.document.read": ("pos", "read"),
})
register("hrms", {
    "hrms.employee.read": ("hrms", "read"),
    "hrms.employee.create": ("hrms", "write"),
    "hrms.employee.update": ("hrms", "write"),
    "hrms.employee.invite": ("hrms", "admin"),
    "hrms.attendance.read": ("hrms", "read"),
    "hrms.attendance.write": ("hrms", "write"),
    "hrms.leave.read": ("hrms", "read"),
    "hrms.leave.request": ("hrms", "write"),
    "hrms.leave.approve": ("hrms", "admin"),
    "hrms.holiday.manage": ("hrms", "write"),
    # Shift rules decide late / half day / absent, so they move pay: admin.
    # Putting people on shifts is rostering: write.
    "hrms.shift.read": ("hrms", "read"),
    "hrms.shift.manage": ("hrms", "admin"),
    "hrms.shift.assign": ("hrms", "write"),
    "hrms.settings.manage": ("hrms", "admin"),
})
# Payroll is its own grant, never carried by `hrms` (D-42, TR-SEC-36): salary,
# CNIC and pay need these keys. Approve, pay, lock and export stay with
# `admin` — the four-eyes and audit-sensitive steps.
register("payroll", {
    "payroll.run.read": ("payroll", "read"),
    "payroll.run.create": ("payroll", "write"),
    "payroll.run.calculate": ("payroll", "write"),
    "payroll.run.approve": ("payroll", "admin"),
    "payroll.run.pay": ("payroll", "admin"),
    "payroll.run.lock": ("payroll", "admin"),
    "payroll.run.cancel": ("payroll", "admin"),
    "payroll.run.reopen": ("payroll", "admin"),
    "payroll.salary.read": ("payroll", "read"),
    "payroll.salary.update": ("payroll", "write"),
    "payroll.report.export": ("payroll", "admin"),
    "payroll.settings.manage": ("payroll", "admin"),
})


def _grants(rows) -> set[tuple[str, str]]:
    return {(r["section"], r["action"]) for r in rows}


def _carries(p: Permission, grants: set[tuple[str, str]]) -> bool:
    """Whether legacy grants carry a key: its action or 'admin' on its section.
    Payroll also lets `write` read — its keys were designed that way (a clerk
    who can edit pay must see it); other sections keep `require`'s rule."""
    if (p.section, p.action) in grants or (p.section, "admin") in grants:
        return True
    return p.section == "payroll" and p.action == "read" and (p.section, "write") in grants


def keys_for_grant(section: str, action: str) -> set[str]:
    """The keys one legacy (section, action) grant carries."""
    return {k for k, p in PERMISSIONS.items() if _carries(p, {(section, action)})}


# ── RBAC v2 (D-04, migration 0053) ───────────────────────────────────────────
# A user holds roles (user_roles), roles inherit roles (role_inherits), a role
# grants key patterns at a scope (role_grants: an exact key, '<module>.*', or
# the Owner's '*'). A key's scope is the widest across every role reached. A
# key also needs its module switched on (app/modules): the manifest that owns
# it, or — for a key no manifest owns — the legacy section gate.
#
# The shim (TR-SEC-36, St04 risk 7): with RBAC_MODE=shadow the old
# (section, action) grants still decide for a user whose only role is their
# primary role and was never edited in v2; both answers are computed and a
# disagreement is logged. Roles created or edited through /roles, and users
# holding several roles, are decided by v2. RBAC_MODE=v2 enforces v2 for
# everyone; RBAC_MODE=legacy is the rollback to the old check (§7.7).

log = logging.getLogger("rbac")

_WIDTH: dict[str, int] = {"own": 0, "team": 1, "branch": 2, "all": 3}
SCOPES: tuple[Scope, ...] = ("own", "team", "branch", "all")

# The latest shadow-mode disagreements, newest last (each is also logged).
SHADOW_LOG: deque[dict] = deque(maxlen=500)


def legacy_grants(section: str, action: str) -> set[str]:
    """The catalog keys one legacy (section, action) grant maps to (§7.7's
    reviewed mapping, derived from each key's declared legacy grant)."""
    return keys_for_grant(section, action)


def pattern_matches(pattern: str, key: str) -> bool:
    if pattern == "*":
        return True
    if pattern.endswith(".*"):
        return key.startswith(pattern[:-1])
    return pattern == key


def widest(scopes: Iterable[str]) -> Scope | None:
    best: str | None = None
    for s in scopes:
        if best is None or _WIDTH[s] > _WIDTH[best]:
            best = s
    return best  # type: ignore[return-value]


def scope_in(rows: Iterable[tuple[str, str]], key: str) -> Scope | None:
    """The widest scope that `rows` [(pattern, scope)] grant on `key`."""
    return widest(s for p, s in rows if pattern_matches(p, key))


def _mode() -> str:
    return settings.rbac_mode if settings.rbac_mode in ("legacy", "shadow", "v2") else "shadow"


@dataclass
class Principal:
    """Everything a guard needs to know about the caller, loaded at once."""
    user_id: str | None
    role_id: str | None
    legacy: set[tuple[str, str]] = field(default_factory=set)
    v2: list[tuple[str, str]] = field(default_factory=list)
    modules_on: set[str] = field(default_factory=set)     # tenant_modules state = 'enabled'
    sections_on: set[str] = field(default_factory=set)    # legacy entitlements
    legacy_decides: bool = True

    # Module gate ------------------------------------------------------------
    def module_open(self, key: str) -> bool:
        if _mode() != "legacy":
            owner = modules.owner_of(key)
            if owner is not None:
                return modules.is_effective(owner, self.modules_on)
        p = PERMISSIONS.get(key)
        return p is None or p.section not in SECTIONS or p.section in self.sections_on

    def section_open(self, section: str) -> bool:
        if section not in SECTIONS:
            return True
        if _mode() == "legacy":
            return section in self.sections_on
        return modules.is_effective(section, self.modules_on)

    # Permission -------------------------------------------------------------
    def decide(self, what: str, legacy: Scope | None, v2: Scope | None) -> Scope | None:
        if self.legacy_decides:
            if _mode() == "shadow" and (legacy is None) != (v2 is None):
                SHADOW_LOG.append({"user_id": self.user_id, "role_id": self.role_id, "check": what,
                                   "legacy": legacy, "v2": v2})
                log.warning("rbac shadow mismatch on %s: legacy=%s v2=%s (user %s, role %s)",
                            what, legacy, v2, self.user_id, self.role_id)
            return legacy
        return v2

    def scope(self, key: str) -> Scope | None:
        """The caller's scope on `key`; None if not held or its module is off."""
        p = PERMISSIONS[key]
        if not self.module_open(key):
            return None
        legacy: Scope | None = "all" if _carries(p, self.legacy) else None
        return self.decide(key, legacy, scope_in(self.v2, key))

    def allows_section(self, section: str, action: str) -> bool:
        """The old `require(section, action)` question, answered by whichever
        model decides. v2 says yes if any key mapped to that grant is held."""
        legacy: Scope | None = (
            "all" if (section, action) in self.legacy or (section, "admin") in self.legacy else None)
        v2 = widest(s for k, p in PERMISSIONS.items() if p.section == section and p.action == action
                    for s in [scope_in(self.v2, k)] if s is not None)
        return self.decide(f"{section}:{action}", legacy, v2) is not None

    def permissions(self) -> dict[str, Scope]:
        out: dict[str, Scope] = {}
        for key in PERMISSIONS:
            s = self.scope(key)
            if s is not None:
                out[key] = s
        return out


_ROLES_OF_USER = """
    select ur.role_id, r.rbac_v2 from user_roles ur join roles r on r.id = ur.role_id
     where ur.user_id = $1"""

# One recursive walk over inheritance; `union` (not `union all`) stops a cycle.
_V2_GRANTS = """
    with recursive reach(role_id) as (
        select unnest($1::uuid[])
        union
        select ri.inherits_id from role_inherits ri join reach on ri.role_id = reach.role_id)
    select g.permission_key, g.scope from role_grants g join reach using (role_id)"""


async def load_principal(conn, *, user_id: str | None, role_id: str | None) -> Principal:
    """The caller's Principal, read under the tenant connection `conn`."""
    p = Principal(user_id=user_id, role_id=role_id)
    p.modules_on = {r["module_key"] for r in await conn.fetch(
        "select module_key from tenant_modules where state = 'enabled'")}
    p.sections_on = {r["section_key"] for r in await conn.fetch(
        "select section_key from entitlements where enabled")}
    if role_id:
        p.legacy = _grants(await conn.fetch(
            "select section, action from permissions where role_id = $1", role_id))
    if user_id:
        held = await conn.fetch(_ROLES_OF_USER, user_id)
        role_ids = [r["role_id"] for r in held]
        v2_native = any(r["rbac_v2"] for r in held)
        only_primary = {str(r) for r in role_ids} <= ({role_id} if role_id else set())
    else:  # a role on its own (holds())
        role_ids = [role_id] if role_id else []
        v2_native = bool(role_id and await conn.fetchval("select rbac_v2 from roles where id = $1", role_id))
        only_primary = True
    if role_ids:
        p.v2 = [(r["permission_key"], r["scope"]) for r in await conn.fetch(_V2_GRANTS, role_ids)]
    mode = _mode()
    p.legacy_decides = mode == "legacy" or (mode == "shadow" and only_primary and not v2_native)
    return p


async def principal_for(conn, auth: AuthContext) -> Principal:
    return await load_principal(conn, user_id=auth.user_id, role_id=auth.role_id)


async def effective_permissions(conn, tenant_id: str, role_id: str | None,
                                user_id: str | None = None) -> dict[str, Scope]:
    """Every registered key the caller holds -> its widest scope. Given only a
    role (the pre-v2 signature) it answers for that role alone."""
    if not role_id and not user_id:
        return {}
    return (await load_principal(conn, user_id=user_id, role_id=role_id)).permissions()


async def scope_of(conn, auth: AuthContext, key: str) -> Scope | None:
    """The caller's scope on `key` (None = not held). Hand it to app/scopes.py
    to narrow a query to the records the caller may see or change."""
    return (await principal_for(conn, auth)).scope(key)


def require(section: str, action: str, *, label: str | None = None):
    async def guard(auth: AuthContext = Depends(current_auth)) -> AuthContext:
        if not auth.role_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No role assigned")
        async with db.tenant_conn(auth.tenant_id) as conn:
            p = await principal_for(conn, auth)
        # Business sections must be turned on for the tenant (D-02: off = 403).
        if not p.section_open(section):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Section '{section}' is not enabled")
        if not p.allows_section(section, action):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {label or f'{section}:{action}'}")
        return auth

    return guard


def perm(key: str):
    """Guard on a permission key. An undeclared key raises KeyError when the
    router module is imported, so a typo stops the app booting (TR-SEC-30)."""
    PERMISSIONS[key]

    async def guard(auth: AuthContext = Depends(current_auth)) -> AuthContext:
        async with db.tenant_conn(auth.tenant_id) as conn:
            p = await principal_for(conn, auth)
        if not p.module_open(key):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"The module for {key} is not enabled")
        if p.scope(key) is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {key}")
        return auth

    return guard


async def holds(conn, role_id: str | None, key: str) -> bool:
    """Whether the role carries `key`. KeyError on an undeclared key."""
    p = PERMISSIONS[key]
    if not role_id:
        return False
    principal = await load_principal(conn, user_id=None, role_id=role_id)
    legacy: Scope | None = "all" if _carries(p, principal.legacy) else None
    return principal.decide(key, legacy, scope_in(principal.v2, key)) is not None


async def holds_key(conn, auth: AuthContext, key: str) -> bool:
    """Whether the caller, across all their roles, holds `key` (module gate included)."""
    return (await principal_for(conn, auth)).scope(key) is not None


def require_key(key: str, section: str):
    """Like `perm`, for keys whose grant isn't the business section that must
    be switched on: payroll needs the `hrms` entitlement but a `payroll` grant."""
    PERMISSIONS[key]  # fail at import time on an undeclared key

    async def guard(auth: AuthContext = Depends(current_auth)) -> AuthContext:
        async with db.tenant_conn(auth.tenant_id) as conn:
            p = await principal_for(conn, auth)
        if not p.section_open(section):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Section '{section}' is not enabled")
        if p.scope(key) is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {key}")
        return auth

    return guard
