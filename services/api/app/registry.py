"""Permission keys declared by each module (D-01, D-04; catalog in docs/12-trd.md §3.4).

The full registry (dependencies, field guards, nav, jobs) arrives in Phase 3.
Until then grants are still stored the legacy way, as (section, action) rows,
and `keys_for_grant` maps a row onto the keys it carries — the one-release
shim of TR-SEC-36. HR grants deliberately carry no payroll key: salary, CNIC
and pay belong to `payroll.*`, never to `hrms:read` (D-42).
"""
from __future__ import annotations

PERMISSIONS: dict[str, tuple[str, ...]] = {
    "payroll": (
        "payroll.run.read", "payroll.run.create", "payroll.run.calculate", "payroll.run.approve",
        "payroll.run.pay", "payroll.run.lock", "payroll.run.cancel", "payroll.run.reopen",
        "payroll.salary.read", "payroll.salary.update",
        "payroll.report.export", "payroll.settings.manage",
    ),
}

# What a legacy `write` grant adds on top of `read`. Approve, pay, lock and
# export stay with `admin`: they are the four-eyes and audit-sensitive steps.
_WRITE_VERBS = {"read", "create", "calculate", "update"}


def module_of(key: str) -> str:
    """'payroll.salary.read' -> 'payroll'. Raises on an undeclared key, so a
    typo in a guard fails loudly instead of quietly denying (or allowing)."""
    module = key.split(".", 1)[0]
    if key not in PERMISSIONS.get(module, ()):
        raise KeyError(f"Undeclared permission key: {key}")
    return module


def keys_for_grant(section: str, action: str) -> set[str]:
    """The dotted keys a legacy (section, action) grant carries."""
    keys = PERMISSIONS.get(section, ())
    if action == "admin":
        return set(keys)
    verbs = {"read"} if action == "read" else _WRITE_VERBS if action == "write" else set()
    return {k for k in keys if k.rsplit(".", 1)[1] in verbs}
