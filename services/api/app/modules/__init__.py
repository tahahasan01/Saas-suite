"""The module registry (D-01): what each module is, in code.

One `ModuleSpec` per module declares its dependencies, the permission keys it
owns, field guards, record scopes, sequences, jobs and nav. Manifests live in
`manifests.py`, versioned with the code that implements them; a tenant's
on/off state lives in `tenant_modules` (migration 0052, `service.py`).

Three kinds of module:
- *applications* (`crm`, `pos`, `hrms`, `invoicing`) are what a plan counts;
- *supporting* modules (`contacts`, `products`, `purchasing`, `payroll`,
  `fbr`) are free and come on with the apps that need them;
- *link* modules (`pos_hrms`) come on by themselves once both sides are on.

`core` is always on. A key belongs to the module whose manifest claims it
(e.g. CRM claims the legacy `invoicing.invoice.*` keys until invoices v2), else
to the module named by its prefix, else to nobody: an unowned key keeps the
legacy section gate (app/rbac.py), so a `register()` block added by another
team works before anyone writes its manifest.
"""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .spec import EnablePlan, FieldGuard, ModuleSpec, NavChild, NavItem

__all__ = [
    "MODULES", "ModuleSpec", "NavItem", "NavChild", "FieldGuard", "EnablePlan",
    "validate", "owner_of", "plan_enable", "closure", "dependents", "is_effective",
    "APPLICATIONS",
]

from .manifests import MODULES  # noqa: E402  (spec types first)

APPLICATIONS = frozenset(k for k, m in MODULES.items() if m.application)


def _matches(pattern: str, key: str) -> bool:
    if pattern.endswith(".*"):
        return key.startswith(pattern[:-1])
    return pattern == key


def owner_of(key: str, registry: dict[str, ModuleSpec] | None = None) -> str | None:
    """The module whose on/off state gates `key`, or None (legacy gate)."""
    reg = registry or MODULES
    for m in reg.values():
        if any(_matches(p, key) for p in m.claims):
            return m.key
    prefix = key.split(".", 1)[0]
    if prefix == "settings":
        return "core"
    return prefix if prefix in reg else None


def validate(registry: dict[str, ModuleSpec] | None = None) -> None:
    """Fail the boot on a broken graph: unknown dependencies or a cycle."""
    reg = registry or MODULES
    for m in reg.values():
        for dep in (*m.depends, *m.auto_enable):
            if dep not in reg:
                raise ValueError(f"Module {m.key!r} names unknown module {dep!r}")
    state: dict[str, int] = {}

    def visit(k: str, path: tuple[str, ...]) -> None:
        if state.get(k) == 2:
            return
        if state.get(k) == 1:
            raise ValueError(f"Module dependency cycle: {' -> '.join((*path, k))}")
        state[k] = 1
        for dep in reg[k].depends:
            visit(dep, (*path, k))
        state[k] = 2

    for k in reg:
        visit(k, ())


def closure(key: str, registry: dict[str, ModuleSpec] | None = None) -> list[str]:
    """`key` and everything it depends on, dependencies first."""
    reg = registry or MODULES
    out: list[str] = []

    def visit(k: str) -> None:
        for dep in reg[k].depends:
            visit(dep)
        if k not in out:
            out.append(k)

    visit(key)
    return out


def _always(reg: dict[str, ModuleSpec]) -> set[str]:
    return {k for k, m in reg.items() if m.always_on}


def plan_enable(key: str, *, enabled: set[str], max_apps: int | None = None,
                registry: dict[str, ModuleSpec] | None = None) -> EnablePlan:
    """What enabling `key` turns on: its closure, then link and auto modules
    to a fix-point. Violations name what the plan refuses (nothing changes)."""
    reg = registry or MODULES
    on = set(enabled) | _always(reg)
    to_enable = [k for k in closure(key, reg) if k not in on]
    while True:
        now = on | set(to_enable)
        glue = [k for k, m in reg.items()
                if m.auto_enable and k not in now and set(m.auto_enable) <= now]
        if not glue:
            break
        for g in sorted(glue):
            to_enable += [d for d in closure(g, reg) if d not in on and d not in to_enable]
    violations: list[str] = []
    apps_after = {k for k in on | set(to_enable) if reg[k].application}
    new_apps = {k for k in to_enable if reg[k].application}
    if max_apps is not None and new_apps and len(apps_after) > max_apps:
        violations.append(
            f"Your plan includes {max_apps} application module(s); this would make {len(apps_after)}. "
            "Upgrade to enable more.")
    return EnablePlan(to_enable=to_enable, violations=violations)


def dependents(key: str, *, enabled: set[str], registry: dict[str, ModuleSpec] | None = None) -> list[str]:
    """Enabled modules that need `key`: depend on it (transitively) or are
    auto modules whose condition names it."""
    reg = registry or MODULES
    out: list[str] = []
    changed = True
    gone = {key}
    while changed:
        changed = False
        for k in sorted(enabled):
            if k in gone:
                continue
            m = reg[k]
            if set(m.depends) & gone or set(m.auto_enable) & gone:
                gone.add(k)
                out.append(k)
                changed = True
    return out


def is_effective(key: str, enabled: set[str], registry: dict[str, ModuleSpec] | None = None) -> bool:
    """On, and so is everything it depends on: a module whose dependency was
    switched off by a legacy path is off too."""
    reg = registry or MODULES
    if key not in reg:
        return False
    m = reg[key]
    if not m.always_on and key not in enabled:
        return False
    return all(is_effective(d, enabled, reg) for d in m.depends)


def nav_for(enabled: set[str], held: Mapping[str, str],
            registry: dict[str, ModuleSpec] | None = None) -> list[dict[str, Any]]:
    """The sidebar a caller sees: manifests ∩ enabled modules ∩ held keys.
    An entry whose children are all hidden is hidden too."""
    reg = registry or MODULES
    out: list[dict[str, Any]] = []
    for m in reg.values():
        if not is_effective(m.key, enabled, reg):
            continue
        for item in m.nav:
            if item.perm and item.perm not in held:
                continue
            children = [c for c in item.children if c.perm is None or c.perm in held]
            if item.children and not children:
                continue
            out.append({"key": item.key, "module": m.key, "href": item.href, "label_key": item.label_key,
                        "icon": item.icon, "group": item.group,
                        "children": [{"href": c.href, "label_key": c.label_key} for c in children]})
    return out


validate()
