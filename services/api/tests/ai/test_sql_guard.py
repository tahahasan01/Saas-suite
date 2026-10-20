"""The AI SQL guard is security-critical — these lock in that it only ever
lets a single read-only SELECT over the allowlisted views through."""
import pytest

from app.ai.sql_guard import UnsafeQuery, sanitize

SAFE = [
    "select count(*) from ai_v_leads",
    "select * from ai_v_leads where stage = 'New' limit 5",
    "select * from ai_v_leads l join ai_v_interactions i on i.lead_name = l.name",
    # Real reporting shapes the model writes — the parser-based guard must keep these working.
    "select date_trunc('day', created_at) d, sum(total) from ai_v_sales "
    "where created_at > now() - interval '7 days' group by 1 order by 1",
    "select case when total > 100 then 'big' else 'small' end bucket, count(*) from ai_v_sales group by 1",
    "with s as (select * from ai_v_sales) select count(*) from s",
    "select to_char(sale_date, 'YYYY-MM') m, round(avg(total), 2) from ai_v_sales group by 1",
    "select employee, count(*) filter (where status = 'late') from ai_v_attendance group by employee",
]

UNSAFE = [
    "select * from users",                                  # not an allowed view
    "select * from crm_leads",                              # raw table
    "delete from ai_v_leads",                               # not a SELECT
    "update ai_v_leads set score = 1",                      # mutation
    "select 1; drop table users",                           # multi-statement
    "select * from ai_v_leads -- sneaky",                   # comment
    "select * from ai_v_leads union select * from users",   # union to raw table
    "select pg_sleep(10)",                                  # forbidden fn / no table
    "with x as (select * from users) select * from x",      # CTE
    "",                                                      # empty
    # Audit P0-1: the regex only looked after FROM/JOIN, so these walked through.
    "select * from ai_v_leads, auth_tokens",                 # comma join to a raw table
    'select * from ai_v_leads join "auth_tokens" on true',   # quoted identifier
    "select * from ai_v_leads, public.users",                # schema-qualified comma join
    "select set_config('app.tenant_id', 'x', true) from ai_v_leads",  # switch RLS tenant
    "select current_setting('app.tenant_id') from ai_v_leads",        # read session context
    "select query_to_xml('select * from users', true, true, '') from ai_v_leads",  # SQL in a string
    "select * from ai_v_leads where name in (select email from users)",  # subquery to raw table
    # CTE scope: a CTE name must only excuse references that can actually see it.
    "with users as (select * from users) select * from users",           # body reads the real table
    "with users as (select * from users) select * from users, ai_v_leads",  # ...even next to a legal view
    "select * from ai_v_leads where name in (with s as (select 1) select * from s)",  # nested WITH
    "select * from (with auth_tokens as (select 1 as x) select * from ai_v_leads) a, auth_tokens",
    "with recursive x as (select * from ai_v_leads) select * from x",     # recursion not needed
    # Identifier folding: quoted "Users" is a different name from unquoted users.
    'with "Users" as (select * from ai_v_leads) select * from users, ai_v_leads',
    "select * from otherdb.public.ai_v_leads",                            # catalog-qualified
]


@pytest.mark.parametrize("sql", SAFE)
def test_allows_safe_selects(sql):
    assert sanitize(sql)


@pytest.mark.parametrize("sql", UNSAFE)
def test_blocks_unsafe(sql):
    with pytest.raises(UnsafeQuery):
        sanitize(sql)


def test_enforces_limit():
    assert "limit" in sanitize("select count(*) from ai_v_leads").lower()


# ── Section scoping ─────────────────────────────────────────────────────────
# The AI answers across every module a tenant enabled — which means the guard,
# not the endpoint, is what stops a POS-only tenant reading CRM data.
from app.ai.sql_guard import VIEWS_BY_SECTION, views_for  # noqa: E402


def test_views_are_scoped_to_enabled_sections():
    assert views_for({"pos"}) == VIEWS_BY_SECTION["pos"]
    assert views_for({"crm", "hrms"}) == VIEWS_BY_SECTION["crm"] | VIEWS_BY_SECTION["hrms"]
    assert views_for(set()) == set()


def test_pos_only_tenant_cannot_reach_crm_views():
    with pytest.raises(UnsafeQuery):
        sanitize("select * from ai_v_leads", allowed=views_for({"pos"}))


def test_crm_only_tenant_cannot_reach_staff_data():
    with pytest.raises(UnsafeQuery):
        sanitize("select * from ai_v_employees", allowed=views_for({"crm"}))


def test_a_join_is_refused_if_either_side_is_out_of_scope():
    """The dangerous shape: a legal view joined to one the tenant doesn't have."""
    with pytest.raises(UnsafeQuery):
        sanitize("select * from ai_v_sales s join ai_v_leads l on l.name = s.cashier",
                 allowed=views_for({"pos"}))


def test_cross_module_join_is_allowed_when_both_sections_are_on():
    """The differentiator: one question spanning sales and staff."""
    sql = sanitize(
        "select s.cashier, sum(s.total) from ai_v_sales s "
        "join ai_v_employees e on e.name = s.cashier group by s.cashier",
        allowed=views_for({"pos", "hrms"}))
    assert "limit" in sql.lower()


def test_every_section_view_is_actually_queryable():
    for section, views in VIEWS_BY_SECTION.items():
        for v in views:
            assert sanitize(f"select * from {v}", allowed=views_for({section}))


# ── Row cap and casts ───────────────────────────────────────────────────────
@pytest.mark.parametrize("sql", [
    "select * from ai_v_leads limit 100000",
    "select * from ai_v_leads limit all",
    "select * from ai_v_leads limit (select 100000)",
    "select * from ai_v_leads fetch first 100000 rows only",
    "select name from ai_v_leads union select name from ai_v_leads limit 100000",
])
def test_a_large_or_computed_limit_is_clamped(sql):
    assert sanitize(sql, max_limit=200).upper().endswith("LIMIT 200")


def test_a_small_limit_is_kept():
    assert sanitize("select * from ai_v_leads limit 5").upper().endswith("LIMIT 5")


@pytest.mark.parametrize("sql", [
    "select 'auth_tokens'::regclass::oid from ai_v_leads",   # catalog lookups by cast
    "select cast(name as pg_catalog.regproc) from ai_v_leads",
    "select name::regrole from ai_v_leads",
])
def test_casts_to_catalog_types_are_refused(sql):
    with pytest.raises(UnsafeQuery):
        sanitize(sql)


def test_ordinary_casts_still_work():
    assert sanitize("select value::int, created_at::date, name::text, value::numeric(10,2) from ai_v_leads")


# ── Bypass suite (checklist 1A, TR-SEC-13) ──────────────────────────────────
# Every payload here must be refused TWICE: by the validator, and by the
# database when it is forced past the validator and run the way the gateway
# runs it (as ai_reader, read-only, inside the row-capping wrapper). The
# database half is what still holds if the parser is ever wrong.
import uuid  # noqa: E402

import asyncpg  # noqa: E402
import pytest_asyncio  # noqa: E402

from app import db  # noqa: E402
from app.ai import gateway  # noqa: E402

OTHER = "00000000-0000-4000-8000-00000000000b"   # some other tenant's id

DENIED = asyncpg.InsufficientPrivilegeError
READ_ONLY = (asyncpg.InsufficientPrivilegeError, asyncpg.ReadOnlySQLTransactionError)

# (payload, what the database alone raises when it runs it unwrapped as
#  ai_reader; None = only the gateway's single-SELECT wrapper stops it there).
# The tests run against an empty tenant, so a payload must fail on privileges
# checked at plan/start time — one that only fails per row would pass vacuously.
BYPASSES = [
    pytest.param("select * from ai_v_leads, auth_tokens", DENIED, id="comma-join"),
    pytest.param('select * from ai_v_leads join "auth_tokens" on true', DENIED, id="quoted-identifier"),
    pytest.param("select * from ai_v_leads, public.auth_tokens", DENIED, id="schema-qualified"),
    pytest.param('select * from ai_v_leads, "public"."sessions"', DENIED, id="schema-quoted"),
    pytest.param("with t as (select * from auth_tokens) select * from t", DENIED, id="cte"),
    pytest.param("select (select count(*) from users) from ai_v_leads", DENIED, id="subquery-select-list"),
    pytest.param("select * from ai_v_leads where exists (select 1 from sessions)", DENIED, id="where-exists"),
    pytest.param("select * from ai_v_leads l, lateral (select * from crm_leads c where c.id = l.id) x",
                 DENIED, id="lateral"),
    pytest.param("select name from ai_v_leads union select email from users", DENIED, id="union"),
    pytest.param("select * from crm_leads", DENIED, id="base-table-behind-a-view"),
    # Tenant switching: set_config is not executable by ai_reader at all.
    pytest.param(f"select set_config('app.tenant_id', '{OTHER}', true) from ai_v_leads", DENIED,
                 id="set-config-select-list"),
    pytest.param(f"with t as (select set_config('app.tenant_id', '{OTHER}', true)) "
                 "select * from ai_v_leads, t", DENIED, id="set-config-cte"),
    pytest.param(f"select * from ai_v_leads where set_config('app.tenant_id', '{OTHER}', true) is not null",
                 DENIED, id="set-config-where"),
    pytest.param(f"select * from ai_v_leads, lateral (select set_config('app.tenant_id', '{OTHER}', true)) s",
                 DENIED, id="set-config-lateral"),
    pytest.param("select set_config('role', 'app_user', true) from ai_v_leads", DENIED, id="set-config-role"),
    # SET ROLE is checked against the SESSION user (app_user), so ai_reader
    # could step back up; only a single SELECT ever reaches the database.
    pytest.param("set role app_user", None, id="set-role"),
    pytest.param("reset role", None, id="reset-role"),
    # Writes and DDL. ai_v_products is a single-table view, so Postgres would
    # pass writes through to pos_products if privileges and read-only allowed.
    pytest.param("delete from ai_v_products", READ_ONLY, id="delete"),
    pytest.param("update ai_v_products set name = 'x'", READ_ONLY, id="update"),
    pytest.param("insert into ai_v_products (name) values ('x')", READ_ONLY, id="insert"),
    pytest.param("with d as (delete from ai_v_products returning *) select * from d", READ_ONLY, id="writable-cte"),
    pytest.param("select * into stolen from ai_v_leads", READ_ONLY, id="select-into"),
    pytest.param("select * from ai_v_leads for update", READ_ONLY, id="for-update"),
    pytest.param("drop table users", READ_ONLY, id="drop"),
    pytest.param("create table stolen (a int)", READ_ONLY, id="create"),
    pytest.param("alter table users add column x int", READ_ONLY, id="alter"),
    pytest.param("truncate users", READ_ONLY, id="truncate"),
    pytest.param("grant select on users to ai_reader", READ_ONLY, id="grant"),
    # Functions.
    pytest.param("select pg_sleep(10) from ai_v_leads", DENIED, id="pg-sleep"),
    pytest.param("select query_to_xml('select * from auth_tokens', true, true, '')",
                 DENIED, id="query-to-xml"),
    pytest.param("select query_to_xml($q$select * from sessions$q$, true, true, '')",
                 DENIED, id="dollar-quoted"),
    pytest.param("select pg_read_file('postgresql.conf') from ai_v_leads", DENIED, id="pg-read-file"),
    pytest.param("select lo_import('/etc/passwd') from ai_v_leads", DENIED, id="lo-import"),
    pytest.param("select dblink_connect('host=127.0.0.1') from ai_v_leads", asyncpg.UndefinedFunctionError,
                 id="dblink"),
    pytest.param("copy auth_tokens to '/tmp/stolen'", DENIED, id="copy"),
    pytest.param("copy (select 1) to program 'id'", DENIED, id="copy-program"),
    pytest.param("do $$ begin reset role; perform * from crm_leads; end $$", DENIED, id="do-block"),
    # Statement stacking, comments and encoding tricks.
    pytest.param("select * from ai_v_leads; select * from users", asyncpg.PostgresSyntaxError,
                 id="multiple-statements"),
    pytest.param("select * from ai_v_leads\n-- hidden\n, auth_tokens", DENIED, id="line-comment"),
    pytest.param("select * from ai_v_leads /**/, auth_tokens", DENIED, id="block-comment"),
    pytest.param('select * from ai_v_leads, U&"auth\\005ftokens"', DENIED, id="unicode-escape"),
    # System catalogs that hold secrets or other tenants' values.
    pytest.param("select rolname, rolpassword from pg_authid", DENIED, id="pg-authid"),
    pytest.param("select * from pg_catalog.pg_shadow", DENIED, id="pg-shadow"),
    pytest.param("select * from pg_catalog.pg_statistic", DENIED, id="pg-statistic"),
]


@pytest.mark.parametrize("sql,_db", BYPASSES)
def test_bypass_is_rejected_by_the_validator(sql, _db):
    with pytest.raises(UnsafeQuery):
        sanitize(sql)


@pytest_asyncio.fixture
async def pools():
    await db.connect()
    yield
    await db.disconnect()


@pytest.mark.asyncio
@pytest.mark.parametrize("sql,_db", BYPASSES)
async def test_bypass_fails_at_the_database_on_the_gateway_path(pools, sql, _db):
    """Forced past the validator, run exactly as the gateway runs model SQL."""
    with pytest.raises(asyncpg.PostgresError):
        await gateway.run_query(str(uuid.uuid4()), sql)


@pytest.mark.asyncio
@pytest.mark.parametrize("sql,expected", [p for p in BYPASSES if p.values[1] is not None])
async def test_bypass_fails_at_the_database_as_ai_reader(pools, sql, expected):
    """Unwrapped: ai_reader's privileges and the read-only transaction alone."""
    with pytest.raises(expected):
        async with db.ai_conn(str(uuid.uuid4())) as conn:
            await conn.fetch(sql)


# ── The AI connection itself ────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_ai_conn_is_read_only_ai_reader_with_a_timeout(pools):
    tenant = str(uuid.uuid4())
    async with db.ai_conn(tenant) as conn:
        row = await conn.fetchrow(
            """select current_user::text as role, current_setting('transaction_read_only') as ro,
                      current_setting('statement_timeout') as timeout,
                      current_setting('app.tenant_id') as tenant""")
    assert dict(row) == {"role": "ai_reader", "ro": "on", "timeout": "5s", "tenant": tenant}


@pytest.mark.asyncio
async def test_a_runaway_query_is_cancelled(pools):
    with pytest.raises(asyncpg.QueryCanceledError):
        await gateway.run_query(str(uuid.uuid4()),
                                "select count(*) from generate_series(1, 1000000000000)", timeout_ms=300)


@pytest.mark.asyncio
async def test_the_database_caps_rows_whatever_the_sql_says(pools):
    rows = await gateway.run_query(str(uuid.uuid4()), "select g from generate_series(1, 5000) g")
    assert len(rows) == gateway.ROW_CAP


async def _tenant_with_leads(owner, names: list[str]) -> uuid.UUID:
    t = await owner.fetchval(
        "insert into tenants (name, industry_type) values ('AI pin', 'retail') returning id")
    p = await owner.fetchval(
        "insert into crm_pipelines (tenant_id, name) values ($1, 'P') returning id", t)
    s = await owner.fetchval(
        "insert into crm_stages (tenant_id, pipeline_id, name) values ($1, $2, 'New') returning id", t, p)
    for n in names:
        await owner.execute(
            "insert into crm_leads (tenant_id, pipeline_id, stage_id, name) values ($1, $2, $3, $4)",
            t, p, s, n)
    return t


@pytest_asyncio.fixture
async def two_tenants(pools):
    from app.config import settings
    owner = await asyncpg.connect(settings.database_url)
    a = await _tenant_with_leads(owner, ["alpha-1", "alpha-2"])
    b = await _tenant_with_leads(owner, ["bravo-1"])
    yield str(a), str(b)
    await owner.execute("delete from tenants where id = any($1::uuid[])", [a, b])
    await owner.close()


@pytest.mark.asyncio
async def test_views_are_pinned_to_the_session_tenant(two_tenants):
    """The views are not security_invoker, so this is RLS evaluated as the
    view owner — it must still see only the request's tenant."""
    a, _ = two_tenants
    rows = await gateway.run_query(a, "select name from ai_v_leads order by name")
    assert [r["name"] for r in rows] == ["alpha-1", "alpha-2"]


@pytest.mark.asyncio
async def test_ai_reader_cannot_switch_tenant(two_tenants):
    a, b = two_tenants
    async with db.ai_conn(a) as conn:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with conn.transaction():
                await conn.fetch("select set_config('app.tenant_id', $1, true)", b)
        # And reading the setting only ever shows its own tenant.
        assert await conn.fetchval("select current_setting('app.tenant_id')") == a
        assert [r["name"] for r in await conn.fetch("select name from ai_v_leads")] != []
        assert not {r["name"] for r in await conn.fetch("select name from ai_v_leads")} & {"bravo-1"}
