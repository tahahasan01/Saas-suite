"""The audit trail (D-07, gate M9, St04 #15 and risk 5, TRD §3.10).

Money, people and billing tables write their own field diffs through a
trigger, so a new endpoint cannot forget to audit. The log is append-only and
monthly-partitioned; the runtime role can only add to it through one
`security definer` function, and guarded fields (CNIC, salary, IBAN, cost,
tokens) are recorded as "changed" without their values.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import asyncpg
import pytest

from app import audit, context, db
from app.config import settings

REQUEST_ID = "req-audit-test-0001"

# TRD-SEC-60, as far as the tables exist today: every one carries the trigger.
AUDITED_TABLES = {
    "pos_sales", "pos_returns", "pos_products", "hrms_employees", "hrms_leave_requests",
    "crm_invoice_requests", "subscriptions", "payment_requests", "fbr_settings",
}


async def _owner():
    conn = await asyncpg.connect(settings.database_url)
    await db._init_conn(conn)  # jsonb as Python objects, like the app's pools
    return conn


async def _rows(tenant_id: str, entity: str, entity_id: str | None = None) -> list[dict]:
    conn = await _owner()
    try:
        rows = await conn.fetch(
            """select * from audit_log where tenant_id = $1 and entity = $2
                 and ($3::text is null or entity_id = $3) order by occurred_at, id""",
            uuid.UUID(tenant_id), entity, entity_id)
    finally:
        await conn.close()
    return [dict(r) for r in rows]


async def _me(client) -> str:
    return (await client.get("/auth/me")).json()["user"]["id"]


# ── Structure ───────────────────────────────────────────────────────────────
async def test_audit_log_is_partitioned_by_month_with_months_ready_ahead():
    conn = await _owner()
    try:
        kind = await conn.fetchval("select relkind::text from pg_class where oid = 'audit_log'::regclass")
        parts = {r["relname"] for r in await conn.fetch(
            "select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid "
            "where i.inhparent = 'audit_log'::regclass")}
    finally:
        await conn.close()
    assert kind == "p"
    today = datetime.now(timezone.utc).date()  # partitions are UTC months
    for ahead in range(4):  # this month and the three after it (TRD-SEC-62)
        y, m = divmod(today.month - 1 + ahead, 12)
        assert f"audit_log_y{today.year + y}m{m + 1:02d}" in parts
    assert "audit_log_default" in parts, "a missed partition job must not fail a sale"


async def test_creating_partitions_is_idempotent_and_reaches_further():
    conn = await _owner()
    try:
        async with conn.transaction():
            created = await audit.create_partitions(conn, months_ahead=14)
            again = await audit.create_partitions(conn, months_ahead=14)
            n = await conn.fetchval(
                "select count(*) from pg_inherits where inhparent = 'audit_log'::regclass")
            raise _Rollback
    except _Rollback:
        pass
    finally:
        await conn.close()
    assert len(created) >= 10 and again == []
    assert n >= 16  # 15 months + default


class _Rollback(Exception):
    pass


async def test_a_partition_can_be_created_for_rows_that_landed_in_default():
    """If the job was down, rows wait in the default partition; creating their
    month later moves them instead of failing."""
    conn = await _owner()
    tx = conn.transaction()
    await tx.start()
    try:
        t = uuid.uuid4()
        await conn.execute(
            """insert into audit_log (tenant_id, occurred_at, entity, entity_id, action)
               values ($1, '2031-05-04T10:00:00Z', 'x', '1', 'insert')""", t)
        assert await conn.fetchval("select count(*) from audit_log_default where tenant_id=$1", t) == 1
        await conn.execute("select audit_log_create_partition('2031-05-01')")
        assert await conn.fetchval("select count(*) from audit_log_default where tenant_id=$1", t) == 0
        assert await conn.fetchval("select count(*) from audit_log_y2031m05 where tenant_id=$1", t) == 1
    finally:
        await tx.rollback()
        await conn.close()


async def test_retention_follows_the_plan_and_keeps_money_six_years():
    conn = await _owner()
    tx = conn.transaction()
    await tx.start()
    try:
        t = uuid.uuid4()
        await conn.execute("insert into tenants (id, name, industry_type) values ($1, 'ret', 'retail')", t)
        await conn.execute("insert into subscriptions (tenant_id, plan, status) values ($1, 'starter', 'active')", t)
        for entity, months in (("user", 2), ("user", 24), ("pos_sales", 24), ("pos_sales", 80)):
            await conn.execute(
                """insert into audit_log (tenant_id, occurred_at, entity, entity_id, action)
                   values ($1, now() - make_interval(months => $2::int), $3, $4, 'update')""",
                t, months, entity, f"{entity}-{months}")
        assert await audit.apply_retention(conn) >= 2
        kept = {r[0] for r in await conn.fetch(
            "select entity_id from audit_log where tenant_id=$1 and action='update'", t)}
    finally:
        await tx.rollback()
        await conn.close()
    # Starter keeps 13 months; a sale's trail stays 72 months on any plan.
    assert kept == {"user-2", "pos_sales-24"}


async def test_expired_months_are_detached_for_archiving_not_dropped():
    conn = await _owner()
    tx = conn.transaction()
    await tx.start()
    try:
        await conn.execute("select audit_log_create_partition('2015-01-01')")
        detached = await audit.detach_expired_partitions(conn, keep_months=84)
        still_attached = await conn.fetchval(
            """select exists (select 1 from pg_inherits where inhparent = 'audit_log'::regclass
                               and inhrelid = 'audit_log_y2015m01'::regclass)""")
        table_exists = await conn.fetchval("select to_regclass('audit_log_y2015m01') is not null")
        current = datetime.now(timezone.utc).strftime("audit_log_y%Ym%m")
    finally:
        await tx.rollback()
        await conn.close()
    assert "audit_log_y2015m01" in detached and current not in detached
    assert not still_attached and table_exists  # the worker archives, then drops


async def test_every_money_and_people_table_has_the_audit_trigger():
    conn = await _owner()
    try:
        rows = await conn.fetch(
            """select c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid
                where not t.tgisinternal and t.tgfoid = 'audit_row()'::regprocedure""")
    finally:
        await conn.close()
    assert AUDITED_TABLES <= {r["relname"] for r in rows}


async def test_the_writer_functions_are_definer_owned_by_audit_writer_with_a_pinned_path():
    conn = await _owner()
    try:
        fns = await conn.fetch(
            """select p.proname, p.prosecdef, pg_get_userbyid(p.proowner) as owner,
                      coalesce(p.proconfig, '{}') as config,
                      has_function_privilege('app_user', p.oid, 'EXECUTE') as app_can,
                      exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                               where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_can
                 from pg_proc p where p.pronamespace = 'public'::regnamespace
                  and p.proname in ('audit_row', 'audit_event')""")
        writer = await conn.fetchrow(
            """select rolcanlogin, rolbypassrls, rolsuper from pg_roles where rolname = 'audit_writer'""")
        writer_grants = {(r["table_name"], r["privilege_type"]) for r in await conn.fetch(
            """select table_name, privilege_type from information_schema.role_table_grants
                where grantee = 'audit_writer'""")}
    finally:
        await conn.close()
    assert {f["proname"] for f in fns} == {"audit_row", "audit_event"}
    for f in fns:
        assert f["prosecdef"] and f["owner"] == "audit_writer", f["proname"]
        assert "search_path=pg_catalog, pg_temp" in f["config"], f["proname"]
        assert not f["public_can"], f["proname"]
    assert {f["proname"]: f["app_can"] for f in fns} == {"audit_row": False, "audit_event": True}
    assert not any(writer.values()), "audit_writer: no login, no RLS bypass, no superuser"
    assert writer_grants == {("audit_log", "INSERT")}


# ── Append-only, insert only through the function ───────────────────────────
async def test_app_user_cannot_write_the_log_directly(client, pos_tenant):
    async with db.tenant_conn(pos_tenant.tenant_id) as conn:
        assert await conn.fetchval("select count(*) from audit_log") > 0  # reads still work
    for sql in (("insert into audit_log (tenant_id, entity, action) "
                 "values (current_setting('app.tenant_id')::uuid, 'x', 'forged')"),
                "update audit_log set action = 'edited'",
                "delete from audit_log",
                "truncate audit_log"):
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with db.tenant_conn(pos_tenant.tenant_id) as conn:
                await conn.execute(sql)


async def test_partitions_are_not_reachable_directly(client, pos_tenant):
    month = datetime.now(timezone.utc).strftime("audit_log_y%Ym%m")
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        async with db.tenant_conn(pos_tenant.tenant_id) as conn:
            await conn.fetchval(f"select count(*) from {month}")


async def test_not_even_the_owner_can_rewrite_a_row(client, pos_tenant):
    conn = await _owner()
    try:
        with pytest.raises(asyncpg.RaiseError, match="append-only"):
            await conn.execute("update audit_log set action = 'edited' where tenant_id = $1",
                               uuid.UUID(pos_tenant.tenant_id))
    finally:
        await conn.close()


async def test_the_function_stamps_the_callers_tenant_and_refuses_without_one(client, pos_tenant):
    async with db.tenant_conn(pos_tenant.tenant_id) as conn:
        await audit.event(conn, "export.products", "pos_products", data={"rows": 3})
    rows = await _rows(pos_tenant.tenant_id, "pos_products")
    assert rows[-1]["action"] == "export.products" and rows[-1]["data"] == {"rows": 3}

    # A blanked tenant cannot be used to write into someone else's trail.
    with pytest.raises(asyncpg.RaiseError, match="tenant"):
        async with db.tenant_conn(pos_tenant.tenant_id) as conn:
            await conn.execute("select set_config('app.tenant_id', '', true)")
            await audit.event(conn, "export.products", "pos_products")


# ── Triggers fire, with request context and masking ─────────────────────────
async def test_a_price_change_is_diffed_with_cost_masked_and_the_request_context(client, pos_tenant):
    me = await _me(client)
    p = (await client.get("/pos/products")).json()[0]
    r = await client.patch(f"/pos/products/{p['id']}",
                           json={"price_minor": p["price_minor"] + 500, "cost_minor": 4321},
                           headers={"X-Request-ID": REQUEST_ID})
    assert r.status_code == 200
    assert r.headers["x-request-id"] == REQUEST_ID
    row = (await _rows(pos_tenant.tenant_id, "pos_products", p["id"]))[-1]
    assert row["action"] == "update"
    assert row["changes"]["price_minor"] == [p["price_minor"], p["price_minor"] + 500]
    assert row["changes"]["cost_minor"] == ["***", "***"]
    assert "4321" not in str(row["changes"])
    assert row["guarded"] == ["cost_minor"]
    assert (str(row["actor_id"]), row["actor_kind"], row["request_id"]) == (me, "user", REQUEST_ID)


async def test_an_update_that_touches_no_tracked_field_writes_nothing(client, pos_tenant):
    p = (await client.get("/pos/products")).json()[0]
    before = len(await _rows(pos_tenant.tenant_id, "pos_products", p["id"]))
    assert (await client.patch(f"/pos/products/{p['id']}", json={"low_stock_at": 7})).status_code == 200
    assert len(await _rows(pos_tenant.tenant_id, "pos_products", p["id"])) == before


async def test_salary_and_cnic_changes_are_recorded_without_values(client, tenant):
    created = (await client.post("/hrms/employees", json={
        "name": "Ayesha", "cnic": "35202-1234567-3", "salary_minor": 9_000_000})).json()
    await client.patch(f"/hrms/employees/{created['id']}", json={"salary_minor": 9_500_000})
    rows = await _rows(tenant.tenant_id, "hrms_employees", created["id"])
    assert [r["action"] for r in rows] == ["insert", "update"]
    for r in rows:
        assert "salary_minor" in r["guarded"]
        assert r["changes"]["salary_minor"] == ["***", "***"]
        text = str(r["changes"])
        assert "9000000" not in text and "9500000" not in text and "1234567" not in text
    assert rows[0]["changes"]["cnic"] == ["***", "***"]


async def test_a_sale_and_its_return_are_audited(client, pos_tenant):
    p = (await client.get("/pos/products")).json()[0]
    await client.patch(f"/pos/products/{p['id']}", json={"price_minor": 10_000, "stock_qty": 50})
    sale = (await client.post("/pos/sales", json={
        "items": [{"product_id": p["id"], "qty": 2}], "paid_minor": 20_000,
        "discount_minor": 0, "payment_method": "cash"})).json()
    row = (await _rows(pos_tenant.tenant_id, "pos_sales", sale["id"]))[-1]
    assert row["action"] == "insert" and row["changes"]["total_minor"] == [None, 20_000]

    item = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    ret = (await client.post(f"/pos/sales/{sale['id']}/returns", json={
        "items": [{"sale_item_id": item["sale_item_id"], "qty": 1}], "reason": "Damaged"})).json()
    row = (await _rows(pos_tenant.tenant_id, "pos_returns", ret["id"]))[-1]
    assert row["changes"]["refund_minor"] == [None, 10_000]
    assert row["changes"]["sale_id"] == [None, sale["id"]]


async def test_a_leave_decision_is_audited_and_on_the_timeline(client, tenant):
    me = await _me(client)
    leave = (await client.post("/hrms/leave", json={
        "employee_id": tenant.employee_id, "request_type": "leave", "leave_type": "casual",
        "from_date": "2026-11-02", "to_date": "2026-11-02", "reason": "Family"})).json()
    assert (await client.post(f"/hrms/leave/{leave['id']}/approve")).status_code == 200
    row = (await _rows(tenant.tenant_id, "hrms_leave_requests", leave["id"]))[-1]
    assert row["changes"]["status"] == ["pending", "approved"]
    assert row["changes"]["decided_by"] == [None, me]
    events = await _timeline(tenant.tenant_id, "leave_request", leave["id"])
    assert [(e["kind"], str(e["actor_id"])) for e in events] == [("approved", me)]


async def test_an_invoice_approval_is_audited_and_on_the_timeline(client, crm_tenant):
    lead = (await client.get("/crm/leads")).json()[0]
    inv = (await client.post("/crm/invoices", json={"lead_id": lead["id"], "amount_minor": 100_000})).json()
    assert (await client.post(f"/crm/invoices/{inv['id']}/approve")).status_code == 200
    row = (await _rows(crm_tenant.tenant_id, "crm_invoice_requests", inv["id"]))[-1]
    assert row["changes"]["status"] == ["pending", "approved"]
    events = await _timeline(crm_tenant.tenant_id, "invoice_request", inv["id"])
    assert [e["kind"] for e in events] == ["approved"]


async def test_billing_tables_are_audited(client, crm_tenant):
    pr = (await client.post("/billing/upgrade", json={"plan": "growth"})).json()
    await client.post(f"/billing/payment-requests/{pr['payment_request_id']}/submit")
    rows = await _rows(crm_tenant.tenant_id, "payment_requests", pr["payment_request_id"])
    assert [r["action"] for r in rows] == ["insert", "update"]
    assert rows[-1]["changes"]["status"] == ["pending", "submitted"]
    # The subscription row created at signup (no request user on that path).
    sub = await _rows(crm_tenant.tenant_id, "subscriptions", crm_tenant.tenant_id)
    assert sub and sub[0]["action"] == "insert"


async def test_the_fbr_token_never_reaches_the_trail(client, pos_tenant):
    r = await client.put("/fbr/settings", json={"token": "tok-SECRET-123", "seller_business_name": "Shop"})
    assert r.status_code == 200, r.text
    rows = await _rows(pos_tenant.tenant_id, "fbr_settings")
    # Since 0046 the token lives encrypted in token_enc: its change is still
    # recorded, masked, and neither the plaintext nor the ciphertext is kept.
    assert rows[-1]["changes"]["token_enc"] == ["***", "***"]
    assert "token_enc" in rows[-1]["guarded"]
    assert rows[-1]["changes"]["seller_business_name"][1] == "Shop"
    assert all("SECRET" not in str(r["changes"]) for r in rows)
    conn = await _owner()
    try:
        enc = await conn.fetchval("select token_enc from fbr_settings where tenant_id=$1",
                                  uuid.UUID(pos_tenant.tenant_id))
    finally:
        await conn.close()
    assert enc and all(bytes(enc).hex()[:32] not in str(r["changes"]) for r in rows)


async def test_a_name_on_the_guard_list_is_masked_even_if_not_flagged():
    """Defence in depth: tracking a column called iban/cnic/salary/… masks it
    even when the trigger's argument forgot the '!' guard marker."""
    conn = await _owner()
    tx = conn.transaction()
    await tx.start()
    try:
        await conn.execute("create table audit_probe (id uuid primary key, tenant_id uuid, iban text, note text)")
        await conn.execute("create trigger audit after insert or update or delete on audit_probe "
                           "for each row execute function audit_row('iban', 'note')")
        t, i = uuid.uuid4(), uuid.uuid4()
        await conn.execute("insert into audit_probe values ($1, $2, 'PK36SCBL0000001123456702', 'hi')", i, t)
        row = await conn.fetchrow("select changes, guarded, actor_kind from audit_log where tenant_id=$1", t)
    finally:
        await tx.rollback()
        await conn.close()
    assert row["changes"] == {"iban": ["***", "***"], "note": [None, "hi"]}
    assert row["guarded"] == ["iban"]
    assert row["actor_kind"] == "system"  # no request, no job: an owner script


# ── Job context ─────────────────────────────────────────────────────────────
async def test_a_job_connection_stamps_job_context(client, pos_tenant):
    p = (await client.get("/pos/products")).json()[0]
    async with db.job_conn(pos_tenant.tenant_id, "test.reprice", run_id="42") as conn:
        await conn.execute("update pos_products set price_minor = price_minor + 1 where id = $1",
                           uuid.UUID(p["id"]))
    row = (await _rows(pos_tenant.tenant_id, "pos_products", p["id"]))[-1]
    assert (row["actor_id"], row["actor_kind"], row["request_id"]) == (None, "job", "job:test.reprice:42")


async def test_the_context_does_not_leak_between_requests(client, pos_tenant):
    await client.get("/auth/me", headers={"X-Request-ID": "first"})
    assert context.current() is None  # the test task never sees a request's context
    async with db.tenant_conn(pos_tenant.tenant_id) as conn:
        got = await conn.fetchrow(
            """select current_setting('app.actor_kind', true) as kind,
                      current_setting('app.request_id', true) as rid""")
    assert dict(got) == {"kind": "system", "rid": ""}


async def test_a_bad_request_id_header_is_replaced(client, pos_tenant):
    r = await client.get("/auth/me", headers={"X-Request-ID": "x" * 300})
    assert r.headers["x-request-id"] != "x" * 300 and 0 < len(r.headers["x-request-id"]) <= 64


# ── Semantic events and the timeline ────────────────────────────────────────
async def _timeline(tenant_id: str, entity_type: str, entity_id: str) -> list[dict]:
    conn = await _owner()
    try:
        rows = await conn.fetch(
            """select * from timeline_events where tenant_id=$1 and entity_type=$2 and entity_id=$3
                order by occurred_at, id""", uuid.UUID(tenant_id), entity_type, uuid.UUID(entity_id))
    finally:
        await conn.close()
    return [dict(r) for r in rows]


async def test_track_writes_the_timeline_and_optionally_a_semantic_event(client, crm_tenant):
    lead = (await client.get("/crm/leads")).json()[0]
    async with db.tenant_conn(crm_tenant.tenant_id) as conn:
        await audit.track(conn, entity_type="lead", entity_id=lead["id"], kind="note", body="Called back")
        await audit.track(conn, entity_type="lead", entity_id=lead["id"], kind="won",
                          event="crm.lead.won", data={"value_minor": 5})
    events = await _timeline(crm_tenant.tenant_id, "lead", lead["id"])
    assert [(e["kind"], e["body"]) for e in events] == [("note", "Called back"), ("won", None)]
    rows = await _rows(crm_tenant.tenant_id, "lead", lead["id"])
    assert [r["action"] for r in rows] == ["crm.lead.won"]  # the note is not an audit event


async def test_module_toggles_and_logins_are_semantic_events(client, crm_tenant):
    me = await _me(client)
    assert (await client.patch("/entitlements/crm", json={"enabled": True})).status_code == 200
    rows = await _rows(crm_tenant.tenant_id, "entitlement", "crm")
    assert rows[-1]["action"] == "module.enable" and str(rows[-1]["actor_id"]) == me
    email = (await client.get("/auth/me")).json()["user"]["email"]
    r = await client.post("/auth/login", json={"email": email, "password": "Sup3rSecret!23"},
                          headers={"X-Request-ID": REQUEST_ID})
    assert r.status_code == 200
    row = (await _rows(crm_tenant.tenant_id, "user", me))[-1]
    assert (row["action"], str(row["actor_id"]), row["request_id"]) == ("auth.login", me, REQUEST_ID)


async def test_exports_are_audited(client, crm_tenant):
    assert (await client.get("/crm/leads/export")).status_code == 200
    rows = await _rows(crm_tenant.tenant_id, "crm_leads")
    assert rows[-1]["action"] == "export.leads" and rows[-1]["data"]["rows"] > 0


async def test_the_dashboard_feed_still_reads_the_log(client, crm_tenant):
    await client.post("/team/roles", json={"name": "Auditor", "permissions": {"crm": ["read"]}})
    feed = (await client.get("/dashboard/overview")).json()["activity"]
    assert feed[0]["action"] == "role.create" and feed[0]["actor"] == "Test Owner"
    # Row-level trigger diffs are not activity-feed material.
    assert all("." in a["action"] for a in feed)
