"""Audit P0-1 / gate S2-S3: the runtime roles hold exactly the privileges the
reviewed matrix in grant_matrix.py lists — no more (a leak), no less (a 500).

RLS cannot protect tables that are not tenant-scoped (auth_tokens, sessions),
so for those the only safe answer is that `app_user` holds no privilege at all.
"""
from collections import defaultdict

import asyncpg
import pytest

from app.config import settings

from . import grant_matrix

SECRET_TABLES = ["auth_tokens", "sessions", "schema_migrations"]


async def _owner():
    return await asyncpg.connect(settings.database_url)


async def _grants(conn, role: str) -> dict[str, set[str]]:
    """Privileges granted to `role`. An owner's implicit rights on its own
    relations are left out (ownership is asserted separately)."""
    rows = await conn.fetch(
        """select g.table_name, g.privilege_type
             from information_schema.role_table_grants g
             join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace
            where g.grantee = $1 and g.table_schema = 'public'
              and pg_get_userbyid(c.relowner) <> $1""",
        role)
    out: dict[str, set[str]] = defaultdict(set)
    for r in rows:
        out[r["table_name"]].add(r["privilege_type"])
    return out


def _diff(actual: dict[str, set[str]], expected: dict[str, set[str]]) -> dict:
    names = set(actual) | {k for k, v in expected.items() if v}
    return {n: {"has": sorted(actual.get(n, set())), "matrix": sorted(expected.get(n, set()))}
            for n in sorted(names) if actual.get(n, set()) != expected.get(n, set())}


@pytest.mark.asyncio
async def test_every_relation_has_a_matrix_entry():
    """A new table or view must be reviewed into grant_matrix.py, even when the
    answer is 'no privileges' — otherwise nobody decided."""
    conn = await _owner()
    try:
        rels = {r["relname"] for r in await conn.fetch(
            """select c.relname from pg_class c
                where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m')
                  and not c.relispartition""")}  # partitions: test_partitions_carry_no_grants
    finally:
        await conn.close()
    assert rels - set(grant_matrix.APP_USER) == set(), "add these to tests/core/grant_matrix.py"
    assert set(grant_matrix.APP_USER) - rels == set(), "stale entries in tests/core/grant_matrix.py"


@pytest.mark.asyncio
async def test_partitions_carry_no_grants_and_have_rls():
    """A partition is reachable only through its parent, whose grants and
    policies apply; queried directly it must refuse every runtime role."""
    conn = await _owner()
    try:
        rows = await conn.fetch(
            """select c.relname, c.relrowsecurity,
                      exists (select 1 from information_schema.role_table_grants g
                               where g.table_name = c.relname and g.table_schema = 'public'
                                 and g.grantee in ('app_user','ai_reader','ai_view_owner','audit_writer'))
                        as granted
                 from pg_class c
                where c.relnamespace = 'public'::regnamespace and c.relispartition
                  and c.relkind in ('r','p')""")
    finally:
        await conn.close()
    assert rows, "audit_log is partitioned (0044)"
    assert [r["relname"] for r in rows if r["granted"] or not r["relrowsecurity"]] == []


@pytest.mark.asyncio
@pytest.mark.parametrize("role,matrix", [
    ("app_user", grant_matrix.APP_USER),
    ("ai_reader", grant_matrix.AI_READER),
    ("ai_view_owner", grant_matrix.AI_VIEW_OWNER),
    ("audit_writer", grant_matrix.AUDIT_WRITER),
])
async def test_role_privileges_equal_the_matrix(role, matrix):
    conn = await _owner()
    try:
        actual = await _grants(conn, role)
    finally:
        await conn.close()
    assert _diff(actual, matrix) == {}


@pytest.mark.asyncio
async def test_view_owner_reads_only_safe_user_columns():
    conn = await _owner()
    try:
        cols = {r["column_name"] for r in await conn.fetch(
            """select column_name from information_schema.column_privileges
                where grantee = 'ai_view_owner' and table_name = 'users'
                  and privilege_type = 'SELECT'""")}
    finally:
        await conn.close()
    assert cols == grant_matrix.AI_VIEW_OWNER_USER_COLUMNS


@pytest.mark.asyncio
async def test_no_default_privileges_for_runtime_roles():
    """0001 granted app_user DML on every future table by default, which is how
    auth_tokens became readable. New tables must start with nothing."""
    conn = await _owner()
    try:
        acls = await conn.fetch(
            """select d.defaclobjtype, a.grantee::regrole::text as grantee, a.privilege_type
                 from pg_default_acl d, aclexplode(d.defaclacl) a
                where a.grantee <> 0
                  and a.grantee::regrole::text in ('app_user','ai_reader','ai_view_owner','audit_writer')""")
    finally:
        await conn.close()
    assert [dict(r) for r in acls] == []


@pytest.mark.asyncio
async def test_ai_roles_cannot_log_in_or_bypass_rls():
    conn = await _owner()
    try:
        rows = {r["rolname"]: r for r in await conn.fetch(
            """select rolname, rolcanlogin, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb
                 from pg_roles where rolname in ('ai_reader','ai_view_owner')""")}
    finally:
        await conn.close()
    assert set(rows) == {"ai_reader", "ai_view_owner"}
    for r in rows.values():
        assert not any([r["rolcanlogin"], r["rolbypassrls"], r["rolsuper"],
                        r["rolcreaterole"], r["rolcreatedb"]]), r["rolname"]


@pytest.mark.asyncio
async def test_app_user_can_switch_to_ai_reader_without_inheriting_it():
    """SET ROLE is the only way in: app_user must not silently carry the view
    grants, and ai_reader must not be able to become anything else."""
    conn = await _owner()
    try:
        m = await conn.fetchrow(
            """select m.inherit_option, m.set_option from pg_auth_members m
                where m.roleid = 'ai_reader'::regrole and m.member = 'app_user'::regrole""")
        ai_reader_memberships = await conn.fetchval(
            "select count(*) from pg_auth_members where member = 'ai_reader'::regrole")
        views_owned = await conn.fetch(
            """select c.relname, pg_get_userbyid(c.relowner) as owner,
                      coalesce(c.reloptions, '{}') as opts
                 from pg_class c where c.relnamespace = 'public'::regnamespace
                  and c.relkind = 'v' and c.relname like 'ai\\_v\\_%'""")
        owned_by_runtime = await conn.fetch(
            """select relname from pg_class where relnamespace = 'public'::regnamespace
                and pg_get_userbyid(relowner) in ('app_user', 'ai_reader')""")
    finally:
        await conn.close()
    assert m is not None and m["set_option"] and not m["inherit_option"]
    assert owned_by_runtime == [], "runtime roles must not own relations (owners bypass RLS)"
    assert ai_reader_memberships == 0
    assert {v["relname"] for v in views_owned} == grant_matrix.AI_VIEWS
    for v in views_owned:
        assert v["owner"] == "ai_view_owner", v["relname"]
        # Invoker views would check base tables against ai_reader (it has none).
        assert "security_invoker=true" not in v["opts"], v["relname"]
        assert "security_barrier=true" in v["opts"], v["relname"]


@pytest.mark.asyncio
@pytest.mark.parametrize("fn", [
    "set_config(text,text,boolean)",          # switches app.tenant_id / role mid-query
    "pg_sleep(double precision)",              # cheap denial of service
    "pg_sleep_for(interval)",
    "pg_sleep_until(timestamp with time zone)",
])
async def test_dangerous_functions_are_not_public(fn):
    conn = await _owner()
    try:
        public_can = await conn.fetchval(
            f"""select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                where a.grantee = 0 and a.privilege_type = 'EXECUTE')
                  from pg_proc p where p.oid = 'pg_catalog.{fn}'::regprocedure""")
        reader_can = await conn.fetchval(
            f"select has_function_privilege('ai_reader', 'pg_catalog.{fn}', 'EXECUTE')")
    finally:
        await conn.close()
    assert not public_can and not reader_can


@pytest.mark.asyncio
async def test_plpgsql_is_not_usable_by_ai_reader():
    """A DO block could `reset role` back to app_user (the session user) — the
    database must refuse it even if the validator let one through."""
    conn = await _owner()
    try:
        assert not await conn.fetchval("select has_language_privilege('ai_reader', 'plpgsql', 'USAGE')")
    finally:
        await conn.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("table", SECRET_TABLES)
async def test_app_user_cannot_read_secret_tables(table):
    app = await asyncpg.connect(settings.app_database_url)
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await app.fetchval(f"select count(*) from {table}")
    finally:
        await app.close()


@pytest.mark.asyncio
async def test_the_khata_ledger_is_append_only_except_who_it_belongs_to():
    """customer_ledger is append-only (0079), but a contact merge moves the
    loser's entries to the winner (contact_merge 'repoint'): app_user may
    update contact_id and nothing else (0082)."""
    conn = await _owner()
    try:
        cols = {r["column_name"] for r in await conn.fetch(
            """select column_name from information_schema.column_privileges
                where grantee = 'app_user' and table_name = 'customer_ledger' and privilege_type = 'UPDATE'""")}
    finally:
        await conn.close()
    assert cols == {"contact_id"}
