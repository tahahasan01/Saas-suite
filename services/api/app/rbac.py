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

from . import db, modules, scopes
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
    # Invoices v2 (3E): money in and documents cancelled are accounts work too.
    "invoicing.payment.record": ("accounts", "admin"),
    "invoicing.invoice.void": ("accounts", "admin"),
})
register("pos", {
    "pos.sale.read": ("pos", "read"),
    "pos.sale.create": ("pos", "write"),
    "pos.sale.refund": ("pos", "write"),
    "pos.session.read": ("pos", "read"),
    "pos.session.open": ("pos", "write"),
    "pos.session.close": ("pos", "write"),
    # Registers and sessions (0076): a big variance needs a manager; paying
    # cash in or out of the drawer is the cashier's, with a reason.
    "pos.session.approve": ("pos", "admin"),
    "pos.register.manage": ("pos", "admin"),
    "pos.cash.move": ("pos", "write"),
    # Sales operations (0078): undoing a sale, discounting a line or changing
    # a price are a manager's call (or their PIN at the till).
    "pos.sale.void": ("pos", "admin"),
    "pos.sale.discount": ("pos", "admin"),
    "pos.price.override": ("pos", "admin"),
    "pos.report.sales": ("pos", "read"),
})
register("khata", {
    # Customer credit (0079): reading accounts and taking payments at the
    # counter are a cashier's; setting how much a customer may owe isn't.
    "khata.ledger.read": ("pos", "read"),
    "khata.payment.record": ("pos", "write"),
    "khata.limit.manage": ("pos", "admin"),
})
register("products", {
    "products.product.read": ("pos", "read"),
    "products.product.create": ("pos", "write"),
    "products.product.update": ("pos", "write"),
    "products.product.import": ("pos", "write"),
    "products.product.export": ("pos", "read"),
    # Cost price is a field guard (TR-SEC-32): who may see margins.
    "products.cost.read": ("pos", "admin"),
    "products.cost.update": ("pos", "admin"),     # change what was paid, not just see it (0075)
    "products.stock.adjust": ("pos", "admin"),    # shrinkage and counts are a manager's call
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
# CRM v2 (Phase 3, 3B): shaping the pipeline and its lists is admin work; a
# rep with `crm:write` works leads and activities but doesn't redesign stages.
register("crm", {
    "crm.pipeline.manage": ("crm", "admin"),
    "crm.settings.manage": ("crm", "admin"),
    "crm.report.read": ("crm", "read"),
})
# Contacts (D-30) is a supporting module of CRM, POS and invoicing. Until the
# module registry lands its keys ride on the `crm` grant; the till reaches
# lookup and quick-add through `pos.sale.create` (routers/contacts.py).
# Merging re-points records across modules, so it is admin.
register("contacts", {
    "contacts.contact.read": ("crm", "read"),
    "contacts.contact.create": ("crm", "write"),
    "contacts.contact.update": ("crm", "write"),
    "contacts.contact.archive": ("crm", "write"),
    "contacts.contact.merge": ("crm", "admin"),
    "contacts.tag.manage": ("crm", "write"),
})
# HR org, kiosks, corrections and the leave ledger (3F, 0065–0068). Shaping
# the org and kiosks, deciding corrections and adjusting balances are admin;
# documents follow employee read/write.
register("hrms", {
    "hrms.org.manage": ("hrms", "admin"),
    "hrms.document.read": ("hrms", "read"),
    "hrms.document.manage": ("hrms", "write"),
    "hrms.kiosk.manage": ("hrms", "admin"),
    "hrms.attendance.approve": ("hrms", "admin"),
    "hrms.leave.adjust": ("hrms", "admin"),
    # Notice board (wave A, 0085): reading the board and who acknowledged is
    # HR's view; employees read their own notices through /me.
    "hrms.notice.read": ("hrms", "read"),
    "hrms.notice.manage": ("hrms", "write"),
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
        return self.decide(key, legacy, self.v2_scope(key))

    def v2_scope(self, key: str) -> Scope | None:
        """The widest v2 grant on `key`. A narrower-than-'all' grant counts
        only where every route applies the scope predicate (scopes.WIRED);
        anywhere else it would quietly mean 'all', so it means nothing."""
        s = scope_in(self.v2, key)
        if s is not None and s != "all" and not scopes.narrowable(key):
            return None
        return s

    def allows_section(self, section: str, action: str) -> bool:
        """The old `require(section, action)` question, answered by whichever
        model decides. v2 must hold EVERY key mapped to exactly that grant, at
        'all' (the old routes apply no record scope) — never just one of them,
        or one narrow key would open a whole section."""
        legacy: Scope | None = (
            "all" if (section, action) in self.legacy or (section, "admin") in self.legacy else None)
        mapped = [k for k, p in PERMISSIONS.items() if p.section == section and p.action == action]
        v2: Scope | None = "all" if mapped and all(scope_in(self.v2, k) == "all" for k in mapped) else None
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

    guard.perm_key = key  # type: ignore[attr-defined]  # read by the scope-wiring test
    return guard


async def holds(conn, role_id: str | None, key: str) -> bool:
    """Whether the role carries `key`. KeyError on an undeclared key."""
    p = PERMISSIONS[key]
    if not role_id:
        return False
    principal = await load_principal(conn, user_id=None, role_id=role_id)
    legacy: Scope | None = "all" if _carries(p, principal.legacy) else None
    return principal.decide(key, legacy, principal.v2_scope(key)) is not None


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


# ── Org data (3A, p3-orgdata): company, branches, sequences, branding ────────
# Legacy mapping until RBAC v2: reading is settings:read, changing is
# settings:admin. `settings.branches.all` (work in every branch, D-03) is what
# bos_session_branches turns into '*', decided by the RBAC mode exactly as
# Principal.decide does (0083; db.tenant_conn passes the mode).
register("settings", {
    "settings.company.read": ("settings", "read"),
    "settings.company.manage": ("settings", "admin"),
    "settings.branches.read": ("settings", "read"),
    "settings.branches.manage": ("settings", "admin"),
    "settings.branches.all": ("settings", "admin"),
    "settings.sequences.read": ("settings", "read"),
    "settings.sequences.manage": ("settings", "admin"),
    "settings.branding.manage": ("settings", "admin"),
})


# ── Owner-template holders ('*') ─────────────────────────────────────────────
# Only a '*' holder may change a '*' holder's roles or hand out '*', and no
# change may leave a tenant without an active '*' holder (security review).
_STAR_HOLDERS = """
    with recursive reach(user_id, role_id) as (
        select ur.user_id, ur.role_id from user_roles ur join users u on u.id = ur.user_id
         where u.status = 'active'
        union
        select reach.user_id, ri.inherits_id from role_inherits ri join reach on ri.role_id = reach.role_id)
    select distinct reach.user_id from reach
      join role_grants g on g.role_id = reach.role_id and g.permission_key = '*'"""

_ROLE_HAS_STAR = """
    with recursive up(id) as (
        select unnest($1::uuid[]) union
        select ri.inherits_id from role_inherits ri join up on ri.role_id = up.id)
    select exists(select 1 from role_grants g join up on g.role_id = up.id where g.permission_key = '*')"""


async def star_holders(conn) -> set[str]:
    """Active users of the tenant in context who hold '*' (through any role)."""
    return {str(r["user_id"]) for r in await conn.fetch(_STAR_HOLDERS)}


async def holds_star(conn, user_id: str) -> bool:
    return user_id in await star_holders(conn)


async def roles_grant_star(conn, role_ids: list[str]) -> bool:
    """Whether any of `role_ids` grants '*', directly or by inheritance."""
    return bool(role_ids) and bool(await conn.fetchval(_ROLE_HAS_STAR, role_ids))


_USER_HAS_STAR = """
    with recursive reach(role_id) as (
        select role_id from user_roles where user_id = $1
        union
        select ri.inherits_id from role_inherits ri join reach on ri.role_id = reach.role_id)
    select exists(select 1 from role_grants g join reach using (role_id) where g.permission_key = '*')"""


async def target_holds_star(conn, user_id: str) -> bool:
    """Whether `user_id` holds '*', whatever their status: a disabled owner is
    still an owner (only an owner may reactivate or change them)."""
    return bool(await conn.fetchval(_USER_HAS_STAR, user_id))


async def guard_star_change(conn, caller_id: str, *, target_id: str | None = None,
                            role_ids: list[str] | None = None) -> None:
    """403 unless the caller holds '*' when the change touches a '*' holder
    (`target_id`, active or not) or hands out a role that grants '*' (`role_ids`)."""
    touches = (target_id is not None and await target_holds_star(conn, target_id)) or \
        await roles_grant_star(conn, role_ids or [])
    if touches and not await holds_star(conn, caller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an owner can change owners or give owner access")


def _raw_scope(p: Principal, key: str) -> Scope | None:
    """What `p` holds on `key` regardless of whether its module is on."""
    if p.legacy_decides:
        return "all" if _carries(PERMISSIONS[key], p.legacy) else None
    return p.v2_scope(key)


async def role_grant_rows(conn, role_ids: list[str]) -> list[tuple[str, str]]:
    """Every (pattern, scope) the roles grant — inheritance and old section
    grants included — i.e. what holding them would give someone."""
    if not role_ids:
        return []
    rows = [(r["permission_key"], r["scope"]) for r in await conn.fetch(_V2_GRANTS, role_ids)]
    for r in await conn.fetch("select section, action from permissions where role_id = any($1::uuid[])", role_ids):
        rows += [(k, "all") for k in keys_for_grant(r["section"], r["action"])]
    return rows


async def ensure_within_callers_grants(conn, auth: AuthContext, rows: Iterable[tuple[str, str]]) -> None:
    """403 unless the caller already holds every key in `rows` at an equal or
    wider scope: nobody hands out (or builds a role with) more than they have.
    '*' holders hold everything."""
    rows = list(rows)
    if not rows or await holds_star(conn, auth.user_id):
        return
    caller = await principal_for(conn, auth)
    for pattern, scope in rows:
        if pattern == "*":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an owner can give owner access")
        for key in PERMISSIONS:
            if pattern_matches(pattern, key):
                have = _raw_scope(caller, key)
                if have is None or _WIDTH[have] < _WIDTH[scope]:
                    raise HTTPException(status.HTTP_403_FORBIDDEN,
                                        f"You can't give {key} at '{scope}': you don't hold it")


async def guard_role_assignment(conn, auth: AuthContext, role_ids: list[str]) -> None:
    """Every route that sets someone's role(s): the roles key, owner access
    only from an owner, and never more than the caller holds."""
    if (await principal_for(conn, auth)).scope("settings.roles.manage") is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires settings.roles.manage to set roles")
    await guard_star_change(conn, auth.user_id, role_ids=role_ids)
    await ensure_within_callers_grants(conn, auth, await role_grant_rows(conn, role_ids))


async def ensure_an_owner_remains(conn) -> None:
    """409, rolling the caller's transaction back, if no active '*' holder is left."""
    if not await star_holders(conn):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "This would leave the workspace without an owner; give someone else owner access first")
