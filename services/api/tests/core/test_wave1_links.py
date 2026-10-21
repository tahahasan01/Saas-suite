"""Phase 3 Wave 1 integration links (migration 0073): the tables the
parallel branches added join branch isolation, the region list and files."""
from __future__ import annotations

import asyncpg
import pytest

from app import branches
from app.config import settings


@pytest.fixture
async def owner():
    conn = await asyncpg.connect(settings.database_url)
    try:
        yield conn
    finally:
        await conn.close()


@pytest.mark.parametrize("table", ["activities", "hrms_attendance_corrections", "payroll_runs"])
async def test_new_transactional_tables_need_a_branch(owner, table):
    assert table in branches.TRANSACTIONAL_TABLES
    nullable = await owner.fetchval(
        "select is_nullable from information_schema.columns where table_name=$1 and column_name='branch_id'", table)
    assert nullable == "NO"
    assert await owner.fetchval(
        "select count(*) from pg_policies where tablename=$1 and policyname='branch_scope'", table) == 1


@pytest.mark.parametrize("table", ["hrms_locations", "hrms_departments", "hrms_kiosks"])
async def test_org_masters_are_shared_unless_pinned(owner, table):
    assert table in branches.MASTER_TABLES
    nullable = await owner.fetchval(
        "select is_nullable from information_schema.columns where table_name=$1 and column_name='branch_id'", table)
    assert nullable == "YES"


@pytest.mark.parametrize("table,constraint", [
    ("hrms_locations", "hrms_locations_province_fk"),
    ("hrms_holiday_calendars", "hrms_holiday_calendars_province_fk"),
    ("hrms_employee_documents", "hrms_employee_documents_file_fk"),
])
async def test_links_to_regions_and_files(owner, table, constraint):
    assert await owner.fetchval(
        "select count(*) from pg_constraint where conrelid = $1::regclass and conname = $2 and contype = 'f'",
        table, constraint) == 1
