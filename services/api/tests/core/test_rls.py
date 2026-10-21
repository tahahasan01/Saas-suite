"""Gate S4: Row-Level Security on EVERY tenant table, proven per table.

Tables are discovered from pg_class (every public table with a `tenant_id`
column, plus `tenants`, keyed on `id`), so a table added tomorrow is covered
without anyone remembering to list it — and fails here if it forgot RLS.

Each check runs in one owner transaction that is rolled back at the end, so it
leaves nothing behind: as the owner it plants a synthetic row for two fresh
tenants (FK triggers off via session_replication_role, so no parent rows are
needed), then `set local role app_user` and probes as tenant A. That needs a
superuser owner, which the dev and CI databases have.
"""
from __future__ import annotations

import asyncio
import re
import uuid

import asyncpg
import pytest

from app.config import settings

from . import grant_matrix

# Not tenant-scoped by design. Anything else without tenant_id fails below.
GLOBAL_TABLES = {"terminology", "occasion_calendar", "schema_migrations",
                 # the worker's job tables (0043): platform-owned, owner connection only
                 "scheduled_jobs", "job_triggers", "job_runs",
                 # org data reference tables (0055, 0058): global, select-only
                 "pk_regions", "tax_rates", "tax_categories",
                 # statutory reference data (0071): platform-owned, read-only for the app
                 "statutory_schemes", "statutory_rates", "minimum_wages"}

_TENANT_TABLES_SQL = """
    select c.relname,
           case when c.relname = 'tenants' then 'id' else 'tenant_id' end as key
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       -- a partition is probed through its parent (audit_log, 0044)
       and not c.relispartition
       and (c.relname = 'tenants' or exists (
             select 1 from pg_attribute a
              where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped))
     order by 1"""


def _discover() -> list[tuple[str, str]]:
    async def run():
        conn = await asyncpg.connect(settings.database_url)
        try:
            return [(r["relname"], r["key"]) for r in await conn.fetch(_TENANT_TABLES_SQL)]
        finally:
            await conn.close()
    return asyncio.run(run())


def pytest_generate_tests(metafunc):
    if "tenant_table" in metafunc.fixturenames:
        tables = _discover()
        metafunc.parametrize("tenant_table", tables, ids=[t for t, _ in tables])


async def _owner():
    return await asyncpg.connect(settings.database_url)


# ── Structure ───────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_every_table_is_tenant_scoped_or_declared_global():
    """A table holding tenant data without a tenant_id column cannot have a
    tenant policy at all — catch it before it ships."""
    conn = await _owner()
    try:
        rows = await conn.fetch(
            """select c.relname from pg_class c
                where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
                  and c.relname <> 'tenants' and not c.relispartition
                  and not exists (select 1 from pg_attribute a where a.attrelid = c.oid
                                  and a.attname = 'tenant_id' and not a.attisdropped)""")
    finally:
        await conn.close()
    assert {r["relname"] for r in rows} == GLOBAL_TABLES


@pytest.mark.asyncio
async def test_table_has_rls_and_a_tenant_policy(tenant_table):
    table, key = tenant_table
    conn = await _owner()
    try:
        rls = await conn.fetchval(
            "select relrowsecurity from pg_class where oid = $1::regclass", table)
        policies = await conn.fetch(
            """select polcmd::text as polcmd, polpermissive, pg_get_expr(polqual, polrelid) as qual,
                      pg_get_expr(polwithcheck, polrelid) as wcheck
                 from pg_policy where polrelid = $1::regclass""", table)
    finally:
        await conn.close()
    assert rls, f"{table} has no row-level security"
    pinned = [p for p in policies
              if p["polcmd"] == "*" and p["polpermissive"]
              and "app.tenant_id" in (p["qual"] or "") and key in p["qual"]
              and "app.tenant_id" in (p["wcheck"] or "")]
    assert pinned, f"{table} has no tenant policy covering every command with a WITH CHECK"


# ── Behaviour, as app_user ──────────────────────────────────────────────────
async def _required_columns(conn, table: str) -> list[tuple[str, str]]:
    return [(r["attname"], r["typ"]) for r in await conn.fetch(
        """select a.attname, format_type(a.atttypid, a.atttypmod) as typ
             from pg_attribute a
            where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped
              and a.attnotnull and not a.atthasdef and a.attgenerated = ''
              and a.attidentity = ''""", table)]


def _value(typ: str) -> str:
    """A text literal Postgres can cast to `typ`; unique where it matters."""
    if typ == "uuid":
        return str(uuid.uuid4())
    if typ.startswith(("bigint", "integer", "smallint", "numeric", "double", "real")):
        return "1"
    if typ == "date":
        return "2026-01-01"
    if typ.startswith("timestamp"):
        return "2026-01-01T00:00:00Z"
    if typ == "boolean":
        return "false"
    if typ in ("jsonb", "json"):
        return "{}"
    if typ.startswith(("text", "character")):
        return f"rls-{uuid.uuid4().hex[:12]}"
    raise AssertionError(f"teach _value() about type {typ!r}")


# Columns whose CHECK is a format rather than a list.
_SHAPED = {
    "auth_tokens": {"token_hash": lambda: uuid.uuid4().hex * 2},
    "outbox": {"kind": lambda: "rls.test_" + uuid.uuid4().hex[:8].translate(str.maketrans("0123456789", "ghijklmnop"))},
    # org data (3A, p3-orgdata)
    "branches": {"code": lambda: "R" + uuid.uuid4().hex[:6].upper()},
    "sequences": {"code": lambda: "rls.test", "pattern": lambda: "{N}"},
    "sequence_counters": {"period_key": lambda: "-"},
    "files": {"sha256": lambda: uuid.uuid4().hex * 2},
    "hrms_leave_types": {"code": lambda: "rls_" + uuid.uuid4().hex[:12]},   # a lower-case code (0068)
    "pay_components": {"code": lambda: "RLS_" + uuid.uuid4().hex[:8].upper()},
    # invoices v2, catalog v2, registers (0074-0076)
    "invoices": {"legacy_ref": lambda: "RLS"},
    "pos_barcode_rules": {"prefix": lambda: "2" + str(uuid.uuid4().int % 10), "kind": lambda: "weight"},
    "pos_registers": {"code": lambda: "Q" + uuid.uuid4().hex[:4].upper()},
    "pos_devices": {"device_code": lambda: "D" + uuid.uuid4().hex[:4].upper()},
}


async def _allowed_values(conn, table: str) -> dict[str, str]:
    """For text columns held to a fixed list by a CHECK (0042's enum checks),
    the first allowed value — a random string would trip the check instead of
    exercising RLS."""
    out: dict[str, str] = {}
    for r in await conn.fetch(
            """select pg_get_constraintdef(oid) as def from pg_constraint
                where conrelid = $1::regclass and contype = 'c'""", table):
        m = re.search(r"\(\(?(\w+)\)?(?:::text)? = ANY \(\(?ARRAY\['([^']*)'", r["def"])
        if m:
            out.setdefault(m.group(1), m.group(2))
    return out


async def _plant(conn, table: str, key: str, owner_id: uuid.UUID) -> None:
    allowed = await _allowed_values(conn, table)
    allowed.update({col: make() for col, make in _SHAPED.get(table, {}).items()})
    cols = {name: (typ, allowed.get(name, _value(typ))) for name, typ in await _required_columns(conn, table)}
    # A shaped optional column (e.g. the legacy_ref an invoice needs without a contact) is set too.
    for col in _SHAPED.get(table, {}):
        cols.setdefault(col, ("text", allowed[col]))
    cols[key] = ("uuid", str(owner_id))
    names = list(cols)
    params = ", ".join(f"${i}::text::{cols[n][0]}" for i, n in enumerate(names, 1))
    await conn.execute(
        f"insert into {table} ({', '.join(names)}) values ({params})", *[cols[n][1] for n in names])


@pytest.mark.asyncio
async def test_app_user_is_confined_to_its_tenant(tenant_table):
    table, key = tenant_table
    verbs = grant_matrix.APP_USER[table]
    a, b = uuid.uuid4(), uuid.uuid4()
    conn = await _owner()
    tx = conn.transaction()
    await tx.start()
    try:
        # FK triggers off: a synthetic row needs no parents. Owner bypasses RLS.
        await conn.execute("set local session_replication_role = replica")
        for t in (a, b):
            await conn.execute(
                "insert into tenants (id, name, industry_type) values ($1, 'rls', 'retail')", t)
        if table != "tenants":
            await _plant(conn, table, key, a)
            await _plant(conn, table, key, b)

        await conn.execute("set local role app_user")
        await conn.execute("select set_config('app.tenant_id', $1, true)", str(a))
        # Every branch (D-03): this test is about the tenant policy; the
        # restrictive branch policy has its own tests (test_branches.py).
        await conn.execute("select set_config('app.branch_ids', '*', true)")

        async def denied(sql: str, *args) -> str:
            with pytest.raises(asyncpg.InsufficientPrivilegeError) as e:
                async with conn.transaction():
                    await conn.execute(sql, *args)
            return str(e.value)

        # SELECT: exactly A's one row, never B's (other tenants' real data too).
        if "SELECT" in verbs:
            assert await conn.fetchval(f"select count(*) from {table} where {key} = $1", b) == 0
            assert await conn.fetchval(f"select count(*) from {table}") == 1
        else:
            await denied(f"select 1 from {table}")

        # INSERT with a foreign tenant_id: rejected by the policy's WITH CHECK.
        if "INSERT" in verbs:
            with pytest.raises(asyncpg.InsufficientPrivilegeError, match="row-level security"):
                async with conn.transaction():
                    await _plant(conn, table, key, b)
        else:
            msg = await denied(f"insert into {table} ({key}) values ($1)", b)
            assert "permission denied" in msg

        # UPDATE: B's row is invisible, and A's row cannot be moved to B.
        if "UPDATE" in verbs:
            async with conn.transaction():
                assert await conn.execute(
                    f"update {table} set {key} = {key} where {key} = $1", b) == "UPDATE 0"
            with pytest.raises(asyncpg.InsufficientPrivilegeError, match="row-level security"):
                async with conn.transaction():
                    await conn.execute(f"update {table} set {key} = $1 where {key} = $2", b, a)
        else:
            await denied(f"update {table} set {key} = {key} where {key} = $1", b)

        # DELETE: B's row is untouchable.
        if "DELETE" in verbs:
            async with conn.transaction():
                assert await conn.execute(f"delete from {table} where {key} = $1", b) == "DELETE 0"
        else:
            await denied(f"delete from {table} where {key} = $1", b)

        # No tenant context (a pooled connection after its transaction ends
        # holds ''): fails closed — no rows, or the policy's uuid cast errors.
        if "SELECT" in verbs:
            await conn.execute("select set_config('app.tenant_id', '', true)")
            try:
                async with conn.transaction():
                    assert await conn.fetchval(f"select count(*) from {table}") == 0
            except asyncpg.InvalidTextRepresentationError:
                pass

        await conn.execute("reset role")
        assert await conn.fetchval(f"select count(*) from {table} where {key} = $1", b) == 1, \
            "B's row must survive everything A tried"
    finally:
        await tx.rollback()
        await conn.close()
