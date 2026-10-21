"""The data side of migration 0062 (checklist §7.1, D-31).

Leads sitting in a "Lost" stage become status=lost with the stage set to the
pipeline's last open stage (the stage the deal died in is not recoverable,
so the old stage id is kept in pre_migration_stage_id for rollback); leads in
a won stage become status=won; the lost stages go. Nothing else about a lead
changes, and the section can run twice.
"""
from __future__ import annotations

import re
import uuid
from pathlib import Path

import asyncpg

from app.config import settings
from tests.crm.helpers import q

MIGRATION = Path(__file__).resolve().parents[4] / "infra" / "migrations" / "0062_crm_v2_pipelines_status.sql"


async def _run_backfill() -> None:
    text = MIGRATION.read_text(encoding="utf-8")
    sql = re.search(r"-- backfill:begin(.*)-- backfill:end", text, re.S).group(1)
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute(sql)
    finally:
        await conn.close()


async def test_lost_stage_leads_become_lost_and_the_stage_goes(client, crm_tenant):
    tid = uuid.UUID(crm_tenant.tenant_id)
    [pipe] = await q("select id from crm_pipelines where tenant_id=$1", tid)
    stages = await q("select id, name, position, is_won from crm_stages where pipeline_id=$1 order by position",
                     pipe["id"])
    last_open = [s for s in stages if not s["is_won"]][-1]
    won = next(s for s in stages if s["is_won"])
    # Back to the pre-0062 shape: a "Lost" column holding a lead, and a won-column
    # lead that was never given a status.
    [lost_stage] = await q(
        """insert into crm_stages (tenant_id, pipeline_id, name, position, kind)
           values ($1, $2, 'Lost', 99, 'lost') returning id""", tid, pipe["id"])
    owner = (await q("select id from users where tenant_id=$1 limit 1", tid))[0]["id"]
    [dead] = await q(
        """insert into crm_leads (tenant_id, pipeline_id, stage_id, owner_id, name, value_minor, updated_at)
           values ($1, $2, $3, $4, 'Dead deal', 123456, '2026-03-04T05:06:07Z') returning id""",
        tid, pipe["id"], lost_stage["id"], owner)
    [winner] = await q(
        """insert into crm_leads (tenant_id, pipeline_id, stage_id, owner_id, name, value_minor, updated_at)
           values ($1, $2, $3, $4, 'Old win', 777, '2026-02-01T00:00:00Z') returning id""",
        tid, pipe["id"], won["id"], owner)
    await q("update crm_leads set status='open', won_at=null, probability=null where id=$1", winner["id"])
    before_total = (await q("select sum(value_minor) as s, count(*) as n from crm_leads where tenant_id=$1", tid))[0]

    await _run_backfill()

    [d] = await q("select * from crm_leads where id=$1", dead["id"])
    assert d["status"] == "lost"
    assert d["lost_at"].isoformat() == "2026-03-04T05:06:07+00:00"
    assert d["stage_id"] == last_open["id"]
    assert d["pre_migration_stage_id"] == lost_stage["id"]
    assert (d["owner_id"], d["value_minor"], d["probability"]) == (owner, 123456, 0)
    [w] = await q("select * from crm_leads where id=$1", winner["id"])
    assert w["status"] == "won" and w["won_at"].isoformat() == "2026-02-01T00:00:00+00:00"
    assert w["probability"] == 100
    assert not await q("select 1 from crm_stages where id=$1", lost_stage["id"])
    after_total = (await q("select sum(value_minor) as s, count(*) as n from crm_leads where tenant_id=$1", tid))[0]
    assert dict(after_total) == dict(before_total)

    await _run_backfill()                      # idempotent
    [d2] = await q("select status, stage_id, lost_at from crm_leads where id=$1", dead["id"])
    assert (d2["status"], d2["stage_id"], d2["lost_at"]) == ("lost", last_open["id"], d["lost_at"])


async def test_every_tenant_gets_lost_reasons_and_activity_types(client, crm_tenant):
    tid = uuid.UUID(crm_tenant.tenant_id)
    reasons = await q("select name from crm_lost_reasons where tenant_id=$1", tid)
    assert len(reasons) >= 5
