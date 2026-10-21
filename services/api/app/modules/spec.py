"""The shapes a module manifest is made of (D-01)."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class NavChild:
    href: str
    label_key: str
    perm: str | None = None          # held key needed to see it; None = always


@dataclass(frozen=True)
class NavItem:
    """One sidebar entry. `key` matches the web shell's module key
    (apps/web/lib/modules.ts), which owns labels, icons and colours."""
    key: str
    href: str
    label_key: str
    icon: str
    group: str                        # overview | sell | people | admin
    perm: str | None = None
    children: tuple[NavChild, ...] = ()


@dataclass(frozen=True)
class FieldGuard:
    """`field` on `resource` is omitted from responses unless the caller holds
    `read`, and may only be written with `write` (TR-SEC-32)."""
    resource: str
    field: str
    read: str
    write: str


@dataclass(frozen=True)
class ModuleSpec:
    key: str
    label: str
    description: str = ""
    application: bool = False          # counts toward the plan
    always_on: bool = False
    depends: tuple[str, ...] = ()
    auto_enable: tuple[str, ...] = ()  # on by itself once all of these are on
    claims: tuple[str, ...] = ()       # key patterns owned beyond the module's own prefix
    scoped: dict[str, str] = field(default_factory=dict)   # resource -> ownership column
    field_guards: tuple[FieldGuard, ...] = ()
    sequences: tuple[str, ...] = ()
    jobs: tuple[str, ...] = ()
    nav: tuple[NavItem, ...] = ()
    purge_tables: tuple[str, ...] = () # what a purge deletes (children cascade)
    plan_floor: str | None = None


@dataclass
class EnablePlan:
    to_enable: list[str]
    violations: list[str]
