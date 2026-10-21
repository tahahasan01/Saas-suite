"""Role-based access control.

Two layers, one source of truth:

- `require(section, action)` is today's guard: 403 unless the caller's role
  grants that action (or 'admin') on the section, and the section is enabled.
- Permission keys (D-04, `module.resource.action`) are declared below, one
  `register()` block per module. Each key names the legacy (section, action)
  grant that enforces it, so `perm(key)` guards exactly like `require` and
  `/auth/me` can tell the web which keys the caller holds. The web gates
  controls on keys, never on role names (P1-13).

Adding a module's keys is one more `register()` block. Phase 3 (RBAC v2) swaps
the legacy mapping for real grants with scopes; key names stay put.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, HTTPException, status

from . import db
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


def _grants(rows) -> set[tuple[str, str]]:
    return {(r["section"], r["action"]) for r in rows}


def _carries(p: Permission, grants: set[tuple[str, str]]) -> bool:
    """Whether legacy grants carry a key: its action or 'admin' on its section.
    Payroll also lets `write` read — its keys were designed that way (a clerk
    who can edit pay must see it); other sections keep `require`'s rule."""
    if (p.section, p.action) in grants or (p.section, "admin") in grants:
        return True
    return p.section == "payroll" and p.action == "read" and (p.section, "write") in grants


def _holds(p: Permission, grants: set[tuple[str, str]], enabled: set[str]) -> bool:
    # Same rule as `require`: the grant, and a business section must be
    # switched on for the tenant.
    if p.section in SECTIONS and p.section not in enabled:
        return False
    return _carries(p, grants)


def keys_for_grant(section: str, action: str) -> set[str]:
    """The keys one legacy (section, action) grant carries."""
    return {k for k, p in PERMISSIONS.items() if _carries(p, {(section, action)})}


async def effective_permissions(conn, tenant_id: str, role_id: str | None) -> dict[str, Scope]:
    """Every registered key the role holds -> its scope. Legacy grants are
    tenant-wide, so the scope is always 'all' until RBAC v2."""
    if not role_id:
        return {}
    grants = _grants(await conn.fetch(
        "select section, action from permissions where role_id=$1", role_id))
    enabled = {r["section_key"] for r in await conn.fetch(
        "select section_key from entitlements where tenant_id=$1 and enabled", tenant_id)}
    return {key: "all" for key, p in PERMISSIONS.items() if _holds(p, grants, enabled)}


def require(section: str, action: str, *, label: str | None = None):
    async def guard(auth: AuthContext = Depends(current_auth)) -> AuthContext:
        if not auth.role_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No role assigned")
        async with db.tenant_conn(auth.tenant_id) as conn:
            # Business sections must be turned on for the tenant (entitlement).
            if section in SECTIONS:
                enabled = await conn.fetchval(
                    "select enabled from entitlements where tenant_id=$1 and section_key=$2",
                    auth.tenant_id, section,
                )
                if not enabled:
                    raise HTTPException(status.HTTP_403_FORBIDDEN, f"Section '{section}' is not enabled")
            ok = await conn.fetchval(
                """select 1 from permissions
                   where role_id = $1 and section = $2 and action in ($3, 'admin') limit 1""",
                auth.role_id, section, action,
            )
        if not ok:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {label or f'{section}:{action}'}")
        return auth

    return guard


def perm(key: str):
    """Guard on a permission key. An undeclared key raises KeyError when the
    router module is imported, so a typo stops the app booting (TR-SEC-30)."""
    p = PERMISSIONS[key]
    return require(p.section, p.action, label=key)


async def holds(conn, role_id: str | None, key: str) -> bool:
    """Whether the role carries `key`. KeyError on an undeclared key."""
    p = PERMISSIONS[key]
    if not role_id:
        return False
    grants = _grants(await conn.fetch(
        "select section, action from permissions where role_id = $1 and section = $2", role_id, p.section))
    return _carries(p, grants)


def require_key(key: str, section: str):
    """Like `perm`, for keys whose grant isn't the business section that must
    be switched on: payroll needs the `hrms` entitlement but a `payroll` grant."""
    PERMISSIONS[key]  # fail at import time on an undeclared key

    async def guard(auth: AuthContext = Depends(current_auth)) -> AuthContext:
        async with db.tenant_conn(auth.tenant_id) as conn:
            enabled = await conn.fetchval(
                "select enabled from entitlements where tenant_id=$1 and section_key=$2",
                auth.tenant_id, section)
            if not enabled:
                raise HTTPException(status.HTTP_403_FORBIDDEN, f"Section '{section}' is not enabled")
            if not await holds(conn, auth.role_id, key):
                raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {key}")
        return auth

    return guard


# ── Org data (3A, p3-orgdata): company, branches, sequences, branding ────────
# Legacy mapping until RBAC v2: reading is settings:read, changing is
# settings:admin. `settings.branches.all` (work in every branch, D-03) is what
# bos_session_branches (0055) turns into '*'; it checks settings:admin today.
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
