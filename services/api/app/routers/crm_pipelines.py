"""Pipeline, stage and lost-reason editing (D-31, St02 §6.3, migration 0062).

Rules every edit keeps:
* a pipeline always has at least one open stage and one won stage;
* a stage (or pipeline) holding leads is deleted only with a `move_to`
  target in the same place;
* reordering takes the pipeline's full ordered list of stage ids, so it is
  never half-applied;
* turning `is_won` on or off re-evaluates the leads in that stage (open ↔ won;
  lost leads stay lost). That bulk change writes timeline events but fires no
  automations, like a CSV import.

Reading is crm:read; shaping the pipeline needs `crm.pipeline.manage`, the
lost-reason list `crm.settings.manage` (both crm:admin today).
"""
from __future__ import annotations

from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Response, status

from .. import db, pipelines, timeline
from ..deps import AuthContext
from ..models import (
    LostReasonCreate,
    LostReasonOut,
    LostReasonUpdate,
    PipelineCreate,
    PipelineOut,
    PipelineUpdate,
    StageCreate,
    StageOrder,
    StageOut,
    StageUpdate,
    TimelineKind,
)
from ..rbac import perm

router = APIRouter(prefix="/crm", tags=["crm"])


async def _lock_pipeline(conn: asyncpg.Connection, pipeline_id: str) -> asyncpg.Record:
    """Serialises edits to one pipeline's stages, so two admins can't each
    delete 'the other' open stage."""
    row = await conn.fetchrow("select id, name, is_default from crm_pipelines where id = $1 for update", pipeline_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pipeline not found")
    return row


async def _stages(conn: asyncpg.Connection, pipeline_id: str) -> list[asyncpg.Record]:
    return list(await conn.fetch(
        f"select {pipelines.STAGE_COLS} from crm_stages where pipeline_id = $1 order by position, created_at",
        pipeline_id))


async def _renumber(conn: asyncpg.Connection, ids: list[str]) -> None:
    await conn.execute(
        """update crm_stages s set position = o.pos - 1
             from unnest($1::uuid[]) with ordinality as o(id, pos)
            where s.id = o.id""", ids)


async def _pipeline_out(conn: asyncpg.Connection, pipeline_id: str) -> PipelineOut:
    out = await pipelines.one_out(conn, pipeline_id)
    if out is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pipeline not found")
    return out


# ── Pipelines ───────────────────────────────────────────────────────────────
@router.get("/pipelines", response_model=list[PipelineOut])
async def list_pipelines(auth: AuthContext = Depends(perm("crm.lead.read"))) -> list[PipelineOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await pipelines.ensure_default(conn, auth.tenant_id)
        return await pipelines.all_out(conn)


@router.post("/pipelines", response_model=PipelineOut, status_code=status.HTTP_201_CREATED)
async def create_pipeline(body: PipelineCreate, auth: AuthContext = Depends(perm("crm.pipeline.manage"))) -> PipelineOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await pipelines.ensure_default(conn, auth.tenant_id)
        ids = await pipelines.create(conn, auth.tenant_id, body.name.strip())
        return await _pipeline_out(conn, ids[0])


@router.patch("/pipelines/{pipeline_id}", response_model=PipelineOut)
async def update_pipeline(pipeline_id: str, body: PipelineUpdate,
                          auth: AuthContext = Depends(perm("crm.pipeline.manage"))) -> PipelineOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _lock_pipeline(conn, pipeline_id)
        if body.name is not None:
            await conn.execute("update crm_pipelines set name = $2 where id = $1", pipeline_id, body.name.strip())
        if body.is_default:
            await conn.execute("update crm_pipelines set is_default = (id = $1)", pipeline_id)
        return await _pipeline_out(conn, pipeline_id)


async def _first_stage(conn: asyncpg.Connection, pipeline_id: str, won: bool) -> str | None:
    sid = await conn.fetchval(
        "select id from crm_stages where pipeline_id = $1 and is_won = $2 order by position limit 1", pipeline_id, won)
    return str(sid) if sid else None


@router.delete("/pipelines/{pipeline_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pipeline(pipeline_id: str, response: Response, move_to: str | None = None,
                          auth: AuthContext = Depends(perm("crm.pipeline.manage"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        doomed = await _lock_pipeline(conn, pipeline_id)
        if await conn.fetchval("select count(*) from crm_pipelines") <= 1:
            raise HTTPException(status.HTTP_409_CONFLICT, "You need at least one pipeline")
        held = await conn.fetchval("select count(*) from crm_leads where pipeline_id = $1", pipeline_id)
        if held:
            if move_to is None:
                raise HTTPException(status.HTTP_409_CONFLICT,
                                    f"{held} lead(s) are in this pipeline. Choose a pipeline to move them to.")
            if move_to == pipeline_id:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Move them to a different pipeline")
            await _lock_pipeline(conn, move_to)
            open_stage = await _first_stage(conn, move_to, won=False)
            won_stage = await _first_stage(conn, move_to, won=True)
            # Won deals land in the target's won stage; open and lost ones at its start.
            await conn.execute(
                """update crm_leads set pipeline_id = $2,
                          stage_id = case when status = 'won' then $4::uuid else $3::uuid end,
                          stage_entered_at = now(), updated_at = now()
                    where pipeline_id = $1""", pipeline_id, move_to, open_stage, won_stage)
        await conn.execute("delete from crm_pipelines where id = $1", pipeline_id)
        if doomed["is_default"]:
            await conn.execute(
                "update crm_pipelines set is_default = true where id = (select id from crm_pipelines order by created_at limit 1)")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


# ── Stages ──────────────────────────────────────────────────────────────────
@router.post("/pipelines/{pipeline_id}/stages", response_model=StageOut, status_code=status.HTTP_201_CREATED)
async def create_stage(pipeline_id: str, body: StageCreate,
                       auth: AuthContext = Depends(perm("crm.pipeline.manage"))) -> StageOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _lock_pipeline(conn, pipeline_id)
        existing = await _stages(conn, pipeline_id)
        row = await conn.fetchrow(
            f"""insert into crm_stages (tenant_id, pipeline_id, name, position, kind, is_won, fold, rotting_days,
                                        default_probability, requirements)
                values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning {pipelines.STAGE_COLS}""",
            auth.tenant_id, pipeline_id, body.name.strip(), len(existing), "won" if body.is_won else "active",
            body.is_won, body.fold, body.rotting_days,
            100 if body.is_won and body.default_probability is None else body.default_probability,
            body.requirements)
        # New open stages go after the open ones, before the won column.
        opens = [str(s["id"]) for s in existing if not s["is_won"]]
        wons = [str(s["id"]) for s in existing if s["is_won"]]
        order = opens + wons + [str(row["id"])] if body.is_won else opens + [str(row["id"])] + wons
        await _renumber(conn, order)
        fresh = await conn.fetchrow(f"select {pipelines.STAGE_COLS} from crm_stages where id = $1", row["id"])
        return pipelines.stage_out(fresh)


async def _stage_in(conn: asyncpg.Connection, pipeline_id: str, stage_id: str) -> asyncpg.Record:
    row = await conn.fetchrow(
        f"select {pipelines.STAGE_COLS} from crm_stages where id = $1 and pipeline_id = $2", stage_id, pipeline_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stage not found")
    return row


def _keeps_shape(stages: list[asyncpg.Record], changed_id: str, new_is_won: bool | None) -> bool:
    """After removing (new_is_won None) or flipping one stage: ≥1 open, ≥1 won."""
    flags = [(new_is_won if str(s["id"]) == changed_id else s["is_won"]) for s in stages
             if not (new_is_won is None and str(s["id"]) == changed_id)]
    return any(flags) and not all(flags)


async def _reevaluate(conn: asyncpg.Connection, stage_id: str, is_won: bool, default_probability: int | None) -> None:
    """Open ↔ won for the leads sitting in a stage whose won flag flipped."""
    kind: TimelineKind
    if is_won:
        rows = await conn.fetch(
            """update crm_leads set status = 'won', won_at = now(), probability = 100,
                      probability_is_manual = false, updated_at = now()
                where stage_id = $1 and status = 'open' returning id""", stage_id)
        kind, change = "won", ["open", "won"]
    else:
        rows = await conn.fetch(
            """update crm_leads set status = 'open', won_at = null, updated_at = now(),
                      probability = case when probability_is_manual then probability else $2 end
                where stage_id = $1 and status = 'won' returning id""", stage_id, default_probability)
        kind, change = "field_change", ["won", "open"]
    for r in rows:
        await timeline.record(conn, entity_type="lead", entity_id=str(r["id"]), kind=kind,
                              changes=[{"field": "status", "label": "Status", "old": change[0], "new": change[1]}],
                              payload={"reason": "stage_flag"})


async def _move_leads(conn: asyncpg.Connection, from_id: str, to: asyncpg.Record) -> None:
    await conn.execute(
        """update crm_leads set stage_id = $2, stage_entered_at = now(), updated_at = now(),
                  status = case when status = 'lost' then 'lost' when $3 then 'won' else 'open' end,
                  won_at = case when status = 'lost' then won_at when $3 then coalesce(won_at, now()) else null end,
                  probability = case when status = 'lost' then 0 when $3 then 100
                                     when probability_is_manual then probability else $4 end
            where stage_id = $1""", from_id, to["id"], to["is_won"], to["default_probability"])


@router.patch("/pipelines/{pipeline_id}/stages/{stage_id}", response_model=StageOut)
async def update_stage(pipeline_id: str, stage_id: str, body: StageUpdate,
                       auth: AuthContext = Depends(perm("crm.pipeline.manage"))) -> StageOut:
    fields: dict[str, Any] = body.model_dump(exclude_unset=True)
    for k in ("name", "is_won", "fold", "requirements"):   # these can't be cleared
        if fields.get(k, "") is None:
            fields.pop(k)
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _lock_pipeline(conn, pipeline_id)
        cur = await _stage_in(conn, pipeline_id, stage_id)
        flip = "is_won" in fields and fields["is_won"] != cur["is_won"]
        if flip and not _keeps_shape(await _stages(conn, pipeline_id), stage_id, fields["is_won"]):
            raise HTTPException(status.HTTP_409_CONFLICT, "A pipeline needs at least one open stage and one won stage")
        if "name" in fields:
            fields["name"] = fields["name"].strip()
        if "is_won" in fields:
            fields["kind"] = "won" if fields["is_won"] else "active"
        if fields:
            cols = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
            await conn.execute(f"update crm_stages set {cols} where id = $1", stage_id, *fields.values())
        row = await _stage_in(conn, pipeline_id, stage_id)
        if flip:
            await _reevaluate(conn, stage_id, row["is_won"], row["default_probability"])
        elif "default_probability" in fields and not row["is_won"]:
            await conn.execute(
                """update crm_leads set probability = $2, updated_at = now()
                    where stage_id = $1 and status = 'open' and not probability_is_manual""",
                stage_id, row["default_probability"])
        return pipelines.stage_out(row)


@router.delete("/pipelines/{pipeline_id}/stages/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stage(pipeline_id: str, stage_id: str, response: Response, move_to: str | None = None,
                       auth: AuthContext = Depends(perm("crm.pipeline.manage"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _lock_pipeline(conn, pipeline_id)
        await _stage_in(conn, pipeline_id, stage_id)
        stages = await _stages(conn, pipeline_id)
        if not _keeps_shape(stages, stage_id, None):
            raise HTTPException(status.HTTP_409_CONFLICT, "A pipeline needs at least one open stage and one won stage")
        held = await conn.fetchval("select count(*) from crm_leads where stage_id = $1", stage_id)
        if held:
            if move_to is None:
                raise HTTPException(status.HTTP_409_CONFLICT,
                                    f"{held} lead(s) are in this stage. Choose a stage to move them to.")
            if move_to == stage_id:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Move them to a different stage")
            target = await conn.fetchrow(
                "select id, pipeline_id, is_won, default_probability from crm_stages where id = $1", move_to)
            if target is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Stage not found")
            if str(target["pipeline_id"]) != pipeline_id:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Move them to a stage in the same pipeline")
            await _move_leads(conn, stage_id, target)
        await conn.execute("delete from crm_stages where id = $1", stage_id)
        await _renumber(conn, [str(s["id"]) for s in stages if str(s["id"]) != stage_id])
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.put("/pipelines/{pipeline_id}/stages/order", response_model=PipelineOut)
async def reorder_stages(pipeline_id: str, body: StageOrder,
                         auth: AuthContext = Depends(perm("crm.pipeline.manage"))) -> PipelineOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _lock_pipeline(conn, pipeline_id)
        current = {str(s["id"]) for s in await _stages(conn, pipeline_id)}
        if len(body.stage_ids) != len(set(body.stage_ids)) or set(body.stage_ids) != current:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "Send every stage of this pipeline exactly once, in the new order")
        await _renumber(conn, body.stage_ids)
        return await _pipeline_out(conn, pipeline_id)


# ── Lost reasons ────────────────────────────────────────────────────────────
def _reason(r: asyncpg.Record) -> LostReasonOut:
    return LostReasonOut(id=str(r["id"]), name=r["name"], active=r["active"], position=r["position"])


@router.get("/lost-reasons", response_model=list[LostReasonOut])
async def list_lost_reasons(include_retired: bool = False,
                            auth: AuthContext = Depends(perm("crm.lead.read"))) -> list[LostReasonOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            "select * from crm_lost_reasons where active or $1 order by active desc, position, name", include_retired)
    return [_reason(r) for r in rows]


@router.post("/lost-reasons", response_model=LostReasonOut, status_code=status.HTTP_201_CREATED)
async def create_lost_reason(body: LostReasonCreate,
                             auth: AuthContext = Depends(perm("crm.settings.manage"))) -> LostReasonOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """insert into crm_lost_reasons (tenant_id, name, position)
                       values ($1, $2, (select coalesce(max(position), 0) + 1 from crm_lost_reasons))
                       returning *""", auth.tenant_id, body.name.strip())
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "That reason is already on the list")
    return _reason(row)


@router.patch("/lost-reasons/{reason_id}", response_model=LostReasonOut)
async def update_lost_reason(reason_id: str, body: LostReasonUpdate,
                             auth: AuthContext = Depends(perm("crm.settings.manage"))) -> LostReasonOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """update crm_lost_reasons set name = coalesce($2, name), position = coalesce($3, position)
                        where id = $1 returning *""",
                    reason_id, body.name.strip() if body.name else None, body.position)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "That reason is already on the list")
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lost reason not found")
    return _reason(row)


@router.delete("/lost-reasons/{reason_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lost_reason(reason_id: str, response: Response,
                             auth: AuthContext = Depends(perm("crm.settings.manage"))) -> Response:
    """Unused: deleted. In use: retired, so past losses keep their reason."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        if await conn.fetchval("select 1 from crm_lost_reasons where id = $1", reason_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lost reason not found")
        if await conn.fetchval("select 1 from crm_leads where lost_reason_id = $1 limit 1", reason_id):
            await conn.execute("update crm_lost_reasons set active = false where id = $1", reason_id)
        else:
            await conn.execute("delete from crm_lost_reasons where id = $1", reason_id)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
