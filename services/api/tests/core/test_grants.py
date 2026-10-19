"""Audit P0-1: the runtime role must not be able to read the platform's secret
tables at all. RLS cannot protect them (they are not tenant-scoped), so the
only safe answer is that `app_user` holds no privilege on them."""
import asyncpg
import pytest

from app.config import settings

SECRET_TABLES = ["auth_tokens", "sessions", "schema_migrations"]


@pytest.mark.asyncio
@pytest.mark.parametrize("table", SECRET_TABLES)
async def test_app_user_cannot_read_secret_tables(table):
    app = await asyncpg.connect(settings.app_database_url)
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await app.fetchval(f"select count(*) from {table}")
    finally:
        await app.close()
