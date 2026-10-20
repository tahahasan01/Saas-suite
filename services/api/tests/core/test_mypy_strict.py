"""New backend modules must be type-checked strictly (Phase 2, Q1).

mypy runs loosely over the whole package so the code that predates CI passes,
and strictly over the modules named in pyproject.toml's override. This test is
the ratchet: every module under app/ and scripts/ is either in the frozen
LEGACY list below or in the strict list. A new file that is in neither fails
here, so "strict on new modules" can't be forgotten. Moving a legacy module to
the strict list (and deleting it from LEGACY) is always welcome.
"""
from __future__ import annotations

import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Modules that existed before CI. Do not add to this list.
LEGACY = {
    "app", "app.ai", "app.ai.gateway", "app.ai.sql_guard", "app.audit", "app.billing",
    "app.bodylimit", "app.config", "app.csv_io", "app.db", "app.deps", "app.email", "app.fbr",
    "app.fbr_submit", "app.fulfillment", "app.invoices_pdf", "app.jobs", "app.main",
    "app.models", "app.notifications", "app.payroll", "app.ratelimit", "app.rbac", "app.refs",
    "app.routers", "app.routers.ai", "app.routers.auth", "app.routers.billing",
    "app.routers.crm", "app.routers.dashboard", "app.routers.entitlements", "app.routers.fbr",
    "app.routers.hrms", "app.routers.invoices", "app.routers.notifications", "app.routers.pos",
    "app.routers.team", "app.routers.terminology", "app.routers.workflows", "app.sampledata",
    "app.scoring", "app.security", "app.tokens", "app.workflow", "app.workflow.engine",
    "scripts", "scripts.activate_payment", "scripts.migrate", "scripts.seed",
}


def _modules() -> set[str]:
    found = set()
    for top in ("app", "scripts"):
        for path in (ROOT / top).rglob("*.py"):
            parts = path.relative_to(ROOT).with_suffix("").parts
            found.add(".".join(parts[:-1] if parts[-1] == "__init__" else parts))
    return found


def _strict() -> set[str]:
    cfg = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    strict: set[str] = set()
    for override in cfg["tool"]["mypy"].get("overrides", []):
        if override.get("disallow_untyped_defs"):
            mods = override["module"]
            strict.update([mods] if isinstance(mods, str) else mods)
    return strict


def test_every_new_module_is_type_checked_strictly():
    missing = sorted(_modules() - LEGACY - _strict())
    assert not missing, (
        "Add these modules to the strict [[tool.mypy.overrides]] list in "
        f"services/api/pyproject.toml (and make them pass `mypy`): {missing}"
    )


def test_the_strict_list_names_real_modules():
    assert not sorted(_strict() - _modules()), "a strict-list entry no longer exists"
