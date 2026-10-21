"""The module registry (D-01, D-02, checklist 3A, migration 0052).

Manifests live in code (app/modules); a tenant's on/off state lives in
`tenant_modules`. Enabling computes the dependency closure plus link modules,
can be previewed with dry_run, and only *application* modules count toward
the plan. Disabling hides the module and refuses its routes but keeps every
row; purge is a separate, delayed, typed-confirmation job.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import asyncpg
import pytest

from app import jobs, modules, rbac
from app.config import settings
from app.modules import service


async def _owner(sql: str, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _states(tenant_id: str) -> dict[str, str]:
    rows = await _owner("select module_key, state from tenant_modules where tenant_id=$1",
                        uuid.UUID(tenant_id))
    return {r["module_key"]: r["state"] for r in rows}


def _enabled(states: dict[str, str]) -> set[str]:
    return {k for k, s in states.items() if s == "enabled"}


# ── The code registry ───────────────────────────────────────────────────────
def test_applications_are_exactly_the_four_paid_modules():
    assert {k for k, m in modules.MODULES.items() if m.application} == {"crm", "pos", "hrms", "invoicing"}


def test_the_dependency_graph_is_acyclic_and_closed():
    modules.validate()  # raises on a cycle, an unknown dependency or a bad key
    for m in modules.MODULES.values():
        for dep in (*m.depends, *m.auto_enable):
            assert dep in modules.MODULES, (m.key, dep)


def test_a_cycle_or_unknown_dependency_fails_validation():
    bad = {**modules.MODULES,
           "a": modules.ModuleSpec("a", "A", depends=("b",)),
           "b": modules.ModuleSpec("b", "B", depends=("a",))}
    with pytest.raises(ValueError, match="cycle"):
        modules.validate(bad)
    with pytest.raises(ValueError, match="unknown"):
        modules.validate({**modules.MODULES, "z": modules.ModuleSpec("z", "Z", depends=("nope",))})


def test_every_registered_key_has_an_owning_module_or_a_legacy_gate():
    for key in rbac.PERMISSIONS:
        owner = modules.owner_of(key)
        assert owner is None or owner in modules.MODULES, key
    # CRM's invoice requests live in CRM until invoices v2 (3E) moves them.
    assert modules.owner_of("invoicing.invoice.approve") == "crm"
    assert modules.owner_of("products.product.read") == "products"
    assert modules.owner_of("payroll.run.read") == "payroll"
    assert modules.owner_of("settings.team.manage") == "core"


def test_manifest_jobs_exist_and_nav_and_guards_name_real_keys():
    for m in modules.MODULES.values():
        for code in m.jobs:
            assert code in jobs.HANDLERS, (m.key, code)
        for item in m.nav:
            for perm in [item.perm, *(c.perm for c in item.children)]:
                assert perm is None or perm in rbac.PERMISSIONS, (m.key, perm)
        for g in m.field_guards:
            assert g.read in rbac.PERMISSIONS and g.write in rbac.PERMISSIONS, g


def test_closure_brings_dependencies_first_and_link_modules_when_both_sides_are_on():
    plan = modules.plan_enable("pos", enabled={"core"})
    assert plan.to_enable.index("products") < plan.to_enable.index("pos")
    assert {"pos", "products", "contacts", "purchasing", "fbr"} <= set(plan.to_enable)
    assert "pos_hrms" not in plan.to_enable
    plan = modules.plan_enable("pos", enabled={"core", "hrms", "payroll"})
    assert "pos_hrms" in plan.to_enable          # cashier = employee PIN
    assert modules.plan_enable("pos", enabled={"core", "pos", "products", "contacts",
                                               "purchasing", "fbr"}).to_enable == []


def test_only_application_modules_count_toward_the_plan():
    # Starter allows one application: CRM plus its free supporting modules fits.
    assert modules.plan_enable("crm", enabled={"core"}, max_apps=1).violations == []
    plan = modules.plan_enable("pos", enabled={"core", "crm", "contacts"}, max_apps=1)
    assert plan.violations and "plan" in plan.violations[0]


# ── Migration 0052: state per tenant ────────────────────────────────────────
async def test_signup_records_the_chosen_apps_and_their_supporting_modules(client, pos_tenant):
    states = await _states(pos_tenant.tenant_id)
    assert _enabled(states) >= {"pos", "products", "contacts", "purchasing", "fbr"}
    assert "crm" not in _enabled(states) and "hrms" not in _enabled(states)
    rows = await _owner("select module_key, reason from tenant_modules where tenant_id=$1",
                        uuid.UUID(pos_tenant.tenant_id))
    reasons = {r["module_key"]: r["reason"] for r in rows}
    assert reasons["pos"] == "user" and reasons["products"] == "dependency"


async def test_backfill_from_entitlements_matches_the_registry_closure(client, crm_tenant):
    """§7.7: entitlements rows become tenant_modules; supporting modules come
    from the dependency closure. The SQL backfill is re-runnable."""
    tid = uuid.UUID(crm_tenant.tenant_id)
    await _owner("update entitlements set enabled = section_key in ('crm','hrms') where tenant_id=$1", tid)
    await _owner("delete from tenant_modules where tenant_id=$1", tid)
    await _owner("select modules_backfill_from_entitlements()")
    expected = {"core"}
    for app in ("crm", "hrms"):
        expected |= set(modules.plan_enable(app, enabled=expected).to_enable)
    assert _enabled(await _states(crm_tenant.tenant_id)) == expected - {"core"}


async def test_legacy_entitlement_writes_stay_in_sync_both_ways(client, crm_tenant):
    tid = uuid.UUID(crm_tenant.tenant_id)
    await _owner("update entitlements set enabled=false where tenant_id=$1 and section_key='crm'", tid)
    assert (await _states(crm_tenant.tenant_id))["crm"] == "disabled"
    await _owner("update tenant_modules set state='enabled' where tenant_id=$1 and module_key='crm'", tid)
    rows = await _owner("select enabled from entitlements where tenant_id=$1 and section_key='crm'", tid)
    assert rows[0]["enabled"] is True


# ── API ─────────────────────────────────────────────────────────────────────
async def test_list_modules(client, crm_tenant):
    r = await client.get("/platform/modules")
    assert r.status_code == 200
    by_key = {m["key"]: m for m in r.json()}
    assert by_key["crm"]["state"] == "enabled" and by_key["crm"]["application"] is True
    assert by_key["contacts"]["state"] == "enabled" and by_key["contacts"]["application"] is False
    assert by_key["pos"]["state"] == "disabled"
    assert "products" in by_key["pos"]["depends"]
    assert by_key["core"]["always_on"] is True


async def test_dry_run_previews_without_changing_anything(client, crm_tenant):
    before = await _states(crm_tenant.tenant_id)
    r = await client.post("/platform/modules/pos/enable?dry_run=true")
    assert r.status_code == 200, r.text
    plan = r.json()
    assert {"pos", "products", "purchasing", "fbr"} <= set(plan["to_enable"])
    assert "contacts" not in plan["to_enable"]      # already on for CRM
    assert plan["violations"] == []
    assert await _states(crm_tenant.tenant_id) == before


async def test_enable_turns_on_the_closure_and_the_link_module(client, crm_tenant):
    assert (await client.post("/platform/modules/hrms/enable")).status_code == 200
    r = await client.post("/platform/modules/pos/enable")
    assert r.status_code == 200, r.text
    states = await _states(crm_tenant.tenant_id)
    assert _enabled(states) >= {"crm", "hrms", "payroll", "pos", "products", "purchasing", "fbr", "pos_hrms"}
    # The old readers still see it.
    ent = (await client.get("/entitlements")).json()
    assert {e["section_key"] for e in ent if e["enabled"]} == {"crm", "hrms", "pos"}
    assert (await client.get("/pos/products")).status_code == 200
    me = (await client.get("/auth/me")).json()
    assert "pos.sale.create" in me["permissions"]


async def test_the_plan_limit_counts_applications_only(client, crm_tenant):
    tid = uuid.UUID(crm_tenant.tenant_id)
    await _owner("update subscriptions set status='active', plan='starter' where tenant_id=$1", tid)
    r = await client.post("/platform/modules/pos/enable?dry_run=true")
    assert r.status_code == 200 and r.json()["violations"]
    r = await client.post("/platform/modules/pos/enable")
    assert r.status_code == 402
    assert "pos" not in _enabled(await _states(crm_tenant.tenant_id))


async def test_disable_refuses_while_enabled_dependents_exist_unless_cascade(client, pos_tenant):
    tid = uuid.UUID(pos_tenant.tenant_id)
    count = (await _owner("select count(*) as n from pos_products where tenant_id=$1", tid))[0]["n"]
    assert count > 0
    r = await client.post("/platform/modules/products/disable")
    assert r.status_code == 409
    assert "pos" in r.json()["detail"]
    r = await client.post("/platform/modules/products/disable?cascade=true&dry_run=true")
    assert r.status_code == 200 and set(r.json()["to_disable"]) >= {"products", "pos"}
    assert "pos" in _enabled(await _states(pos_tenant.tenant_id))
    r = await client.post("/platform/modules/products/disable?cascade=true")
    assert r.status_code == 200, r.text
    assert not _enabled(await _states(pos_tenant.tenant_id)) & {"pos", "products", "purchasing", "fbr"}
    # Hidden and refused, reads and writes alike ...
    assert (await client.get("/pos/products")).status_code == 403
    assert (await client.post("/pos/products", json={"name": "X", "price_minor": 100})).status_code == 403
    me = (await client.get("/auth/me")).json()
    assert not any(n["key"] == "pos" for n in me["nav"])
    # ... but nothing is deleted, and re-enabling restores it (D-02).
    assert (await _owner("select count(*) as n from pos_products where tenant_id=$1", tid))[0]["n"] == count
    assert (await client.post("/platform/modules/pos/enable")).status_code == 200
    assert len((await client.get("/pos/products")).json()) > 0


async def test_disabling_an_application_takes_its_auto_modules_with_it(client, tenant):
    r = await client.post("/platform/modules/hrms/disable")
    assert r.status_code == 200, r.text
    states = await _states(tenant.tenant_id)
    assert states["hrms"] == "disabled" and states["payroll"] == "disabled"
    assert (await client.get("/hrms/employees")).status_code == 403
    assert (await client.get("/hrms/payroll?month=2026-01")).status_code == 403


async def test_always_on_and_unknown_modules(client, crm_tenant):
    assert (await client.post("/platform/modules/core/disable")).status_code == 409
    assert (await client.post("/platform/modules/teleport/enable")).status_code == 404


async def test_module_changes_need_the_modules_permission(client, crm_tenant):
    from .test_me_permissions import _member
    mate, _ = await _member(client, {"crm": ["read", "write"], "settings": ["read"]})
    try:
        assert (await mate.get("/platform/modules")).status_code == 200
        assert (await mate.post("/platform/modules/pos/enable?dry_run=true")).status_code == 403
        assert (await mate.post("/platform/modules/crm/disable")).status_code == 403
    finally:
        await mate.aclose()


# ── Purge: separate, delayed, typed confirmation (D-02, St04 risk 6) ────────
async def test_purge_needs_the_module_disabled_and_typed_confirmation(client, crm_tenant):
    r = await client.post("/platform/modules/crm/purge", json={"confirm": "crm"})
    assert r.status_code == 409                       # still enabled
    assert (await client.post("/platform/modules/crm/disable")).status_code == 200
    r = await client.post("/platform/modules/crm/purge", json={"confirm": "yes"})
    assert r.status_code == 422
    r = await client.post("/platform/modules/crm/purge", json={"confirm": "DELETE crm"})
    assert r.status_code == 202, r.text
    run_after = datetime.fromisoformat(r.json()["run_after"])
    assert run_after > datetime.now(timezone.utc) + timedelta(days=6)


async def test_the_purge_job_waits_for_the_delay_and_reenabling_cancels_it(client, crm_tenant):
    tid = uuid.UUID(crm_tenant.tenant_id)
    leads = (await _owner("select count(*) as n from crm_leads where tenant_id=$1", tid))[0]["n"]
    assert leads > 0
    assert (await client.post("/platform/modules/crm/disable")).status_code == 200
    assert (await client.post("/platform/modules/crm/purge", json={"confirm": "DELETE crm"})).status_code == 202

    await service.run_due_purges()                    # not due yet: nothing happens
    assert (await _owner("select count(*) as n from crm_leads where tenant_id=$1", tid))[0]["n"] == leads

    # Re-enabling cancels the pending purge.
    assert (await client.post("/platform/modules/crm/enable")).status_code == 200
    await _owner("update module_purges set run_after = now() - interval '1 minute' where tenant_id=$1", tid)
    await service.run_due_purges()
    assert (await _owner("select count(*) as n from crm_leads where tenant_id=$1", tid))[0]["n"] == leads
    rows = await _owner("select status from module_purges where tenant_id=$1", tid)
    assert [r["status"] for r in rows] == ["cancelled"]

    # Disabled again and due: the data goes.
    assert (await client.post("/platform/modules/crm/disable")).status_code == 200
    assert (await client.post("/platform/modules/crm/purge", json={"confirm": "DELETE crm"})).status_code == 202
    await _owner("update module_purges set run_after = now() - interval '1 minute' "
                 "where tenant_id=$1 and status='pending'", tid)
    assert await service.run_due_purges() == 1
    assert (await _owner("select count(*) as n from crm_leads where tenant_id=$1", tid))[0]["n"] == 0
    assert "modules.purge" in jobs.HANDLERS
