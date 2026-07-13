"""Integration: prove Row-Level Security blocks cross-tenant reads for the
runtime app_user role. Requires the database to be reachable."""
import asyncpg
import pytest

from app.config import settings


@pytest.mark.asyncio
async def test_rls_blocks_cross_tenant():
    owner = await asyncpg.connect(settings.database_url)
    a = await owner.fetchval("insert into tenants(name, industry_type) values('T_A','retail') returning id")
    b = await owner.fetchval("insert into tenants(name, industry_type) values('T_B','retail') returning id")
    await owner.execute("insert into roles(tenant_id, name) values($1,'RoleA')", a)
    await owner.execute("insert into roles(tenant_id, name) values($1,'RoleB')", b)

    app = await asyncpg.connect(settings.app_database_url)
    try:
        # No tenant context -> RLS shows nothing.
        assert await app.fetchval("select count(*) from roles where name in ('RoleA','RoleB')") == 0

        # Context = A -> only A's rows are visible, even with a crafted filter for B.
        await app.execute("select set_config('app.tenant_id', $1, false)", str(a))
        names = {r["name"] for r in await app.fetch("select name from roles")}
        assert "RoleA" in names
        assert "RoleB" not in names
        assert await app.fetchval("select count(*) from roles where tenant_id=$1", b) == 0
    finally:
        await app.close()
        await owner.execute("delete from tenants where id = any($1::uuid[])", [a, b])
        await owner.close()
