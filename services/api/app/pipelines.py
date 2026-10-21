"""Pipelines and their stages (D-31): the default set, and the rules every
edit keeps — at least one open stage and one won stage per pipeline, and a
stage holding leads only goes away with somewhere to move them."""
from __future__ import annotations

import asyncpg

from .models import PipelineOut, StageOut

# name, is_won, default probability. Lost is a status, not a stage (0062).
DEFAULT_STAGES: list[tuple[str, bool, int]] = [
    ("New", False, 20), ("Contacted", False, 40), ("Qualified", False, 60),
    ("Proposal", False, 80), ("Won", True, 100),
]

STAGE_COLS = "id, pipeline_id, name, position, kind, is_won, fold, rotting_days, default_probability, requirements"


def stage_out(s: asyncpg.Record) -> StageOut:
    return StageOut(id=str(s["id"]), name=s["name"], position=s["position"], kind=s["kind"],
                    is_won=s["is_won"], fold=s["fold"], rotting_days=s["rotting_days"],
                    default_probability=s["default_probability"], requirements=s["requirements"])


async def create(conn: asyncpg.Connection, tenant_id: str, name: str, *, is_default: bool = False) -> list[str]:
    """A pipeline with the default stages. Returns its id then the stage ids in order."""
    pid = await conn.fetchval(
        "insert into crm_pipelines (tenant_id, name, is_default) values ($1, $2, $3) returning id",
        tenant_id, name, is_default)
    ids = [str(pid)]
    for pos, (stage_name, is_won, prob) in enumerate(DEFAULT_STAGES):
        sid = await conn.fetchval(
            """insert into crm_stages (tenant_id, pipeline_id, name, position, kind, is_won, default_probability)
               values ($1, $2, $3, $4, $5, $6, $7) returning id""",
            tenant_id, pid, stage_name, pos, "won" if is_won else "active", is_won, prob)
        ids.append(str(sid))
    return ids


async def ensure_default(conn: asyncpg.Connection, tenant_id: str) -> str:
    pid = await conn.fetchval("select id from crm_pipelines order by is_default desc, created_at limit 1")
    if pid:
        return str(pid)
    ids = await create(conn, tenant_id, "Sales Pipeline", is_default=True)
    # A default automation so a won deal notifies its owner out of the box.
    await conn.execute(
        """insert into workflows (tenant_id, name, trigger, conditions, actions, is_system)
           values ($1, 'Notify owner when a deal is won', 'lead.stage_changed', $2, $3, true)""",
        tenant_id,
        [{"field": "stage_kind", "op": "eq", "value": "won"}],
        [{"type": "notify", "recipient": "owner", "kind": "success",
          "message": "Deal won: {name}", "body": "{company}", "link": "/crm"}])
    return ids[0]


async def all_out(conn: asyncpg.Connection) -> list[PipelineOut]:
    pipelines = await conn.fetch("select id, name, is_default from crm_pipelines order by created_at")
    stages = await conn.fetch(f"select {STAGE_COLS} from crm_stages order by position, created_at")
    by_pipe: dict[str, list[StageOut]] = {}
    for s in stages:
        by_pipe.setdefault(str(s["pipeline_id"]), []).append(stage_out(s))
    return [PipelineOut(id=str(p["id"]), name=p["name"], is_default=p["is_default"],
                        stages=by_pipe.get(str(p["id"]), [])) for p in pipelines]


async def one_out(conn: asyncpg.Connection, pipeline_id: str) -> PipelineOut | None:
    return next((p for p in await all_out(conn) if p.id == str(pipeline_id)), None)
