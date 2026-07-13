"""CRM — pipelines, leads (with fuzzy duplicate detection), interaction logging.
Guarded by require('crm', ...) which checks the crm entitlement + RBAC."""
from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from .. import db, notifications
from ..deps import AuthContext
from ..models import (
    DuplicateMatch,
    InteractionCreate,
    InteractionOut,
    LeadCreate,
    LeadDetail,
    LeadOut,
    LeadUpdate,
    PipelineOut,
    StageOut,
)
from ..rbac import require

router = APIRouter(prefix="/crm", tags=["crm"])

DEFAULT_STAGES = [
    ("New", "active"), ("Contacted", "active"), ("Qualified", "active"),
    ("Proposal", "active"), ("Won", "won"), ("Lost", "lost"),
]
DUP_SIMILARITY = 0.6


def _lead(row: asyncpg.Record) -> LeadOut:
    return LeadOut(
        id=str(row["id"]), pipeline_id=str(row["pipeline_id"]), stage_id=str(row["stage_id"]),
        owner_id=str(row["owner_id"]) if row["owner_id"] else None, name=row["name"],
        company=row["company"], phone=row["phone"], email=row["email"], source=row["source"],
        value_minor=row["value_minor"], currency=row["currency"], score=row["score"],
        created_at=row["created_at"],
    )


async def _ensure_default_pipeline(conn: asyncpg.Connection, tenant_id: str) -> str:
    pid = await conn.fetchval("select id from crm_pipelines order by is_default desc, created_at limit 1")
    if pid:
        return str(pid)
    pid = await conn.fetchval(
        "insert into crm_pipelines (tenant_id, name, is_default) values ($1,'Sales Pipeline',true) returning id",
        tenant_id)
    for pos, (name, kind) in enumerate(DEFAULT_STAGES):
        await conn.execute(
            "insert into crm_stages (tenant_id, pipeline_id, name, position, kind) values ($1,$2,$3,$4,$5)",
            tenant_id, pid, name, pos, kind)
    return str(pid)


@router.get("/pipelines", response_model=list[PipelineOut])
async def list_pipelines(auth: AuthContext = Depends(require("crm", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _ensure_default_pipeline(conn, auth.tenant_id)
        pipelines = await conn.fetch("select id, name, is_default from crm_pipelines order by created_at")
        stages = await conn.fetch("select id, pipeline_id, name, position, kind from crm_stages order by position")
    by_pipe: dict[str, list[StageOut]] = {}
    for s in stages:
        by_pipe.setdefault(str(s["pipeline_id"]), []).append(
            StageOut(id=str(s["id"]), name=s["name"], position=s["position"], kind=s["kind"]))
    return [PipelineOut(id=str(p["id"]), name=p["name"], is_default=p["is_default"],
                        stages=by_pipe.get(str(p["id"]), [])) for p in pipelines]


@router.get("/leads", response_model=list[LeadOut])
async def list_leads(pipeline_id: str | None = None, auth: AuthContext = Depends(require("crm", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        pid = pipeline_id or await _ensure_default_pipeline(conn, auth.tenant_id)
        rows = await conn.fetch(
            "select * from crm_leads where pipeline_id=$1 order by created_at desc", pid)
    return [_lead(r) for r in rows]


async def _find_duplicates(conn, name: str, company: str, phone: str, email: str) -> list[DuplicateMatch]:
    rows = await conn.fetch(
        """select id, name, company,
                  case when $1 <> '' and phone = $1 then 'phone'
                       when $2 <> '' and email = $2 then 'email'
                       else 'company' end as reason
           from crm_leads
           where ($1 <> '' and phone = $1)
              or ($2 <> '' and email = $2)
              or ($3 <> '' and similarity(company, $3) > $4)
           limit 5""",
        phone, email, company, DUP_SIMILARITY)
    return [DuplicateMatch(id=str(r["id"]), name=r["name"], company=r["company"], reason=r["reason"]) for r in rows]


@router.post("/leads", response_model=LeadOut, status_code=status.HTTP_201_CREATED)
async def create_lead(body: LeadCreate, auth: AuthContext = Depends(require("crm", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        pid = body.pipeline_id or await _ensure_default_pipeline(conn, auth.tenant_id)
        if not body.force:
            dups = await _find_duplicates(conn, body.name, body.company, body.phone, body.email)
            if dups:
                raise HTTPException(status.HTTP_409_CONFLICT,
                                    detail={"message": "Possible duplicate", "duplicates": [d.model_dump() for d in dups]})
        stage_id = body.stage_id or await conn.fetchval(
            "select id from crm_stages where pipeline_id=$1 order by position limit 1", pid)
        if not stage_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pipeline has no stages")
        row = await conn.fetchrow(
            """insert into crm_leads (tenant_id, pipeline_id, stage_id, owner_id, name, company, phone, email, source, value_minor)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *""",
            auth.tenant_id, pid, stage_id, auth.user_id, body.name, body.company, body.phone,
            body.email, body.source, body.value_minor)
    return _lead(row)


@router.get("/leads/{lead_id}", response_model=LeadDetail)
async def get_lead(lead_id: str, auth: AuthContext = Depends(require("crm", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow("select * from crm_leads where id=$1", lead_id)
        if not row:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
        inter = await conn.fetch(
            "select * from crm_interactions where lead_id=$1 order by created_at desc", lead_id)
    return LeadDetail(
        lead=_lead(row),
        interactions=[InteractionOut(
            id=str(i["id"]), user_id=str(i["user_id"]) if i["user_id"] else None, channel=i["channel"],
            outcome=i["outcome"], note=i["note"], next_follow_up_at=i["next_follow_up_at"],
            created_at=i["created_at"]) for i in inter],
    )


@router.patch("/leads/{lead_id}", response_model=LeadOut)
async def update_lead(lead_id: str, body: LeadUpdate, auth: AuthContext = Depends(require("crm", "write"))):
    fields = body.model_dump(exclude_none=True)
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("select 1 from crm_leads where id=$1", lead_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
        # Moving to a stage in another pipeline keeps pipeline_id consistent.
        won = False
        if "stage_id" in fields:
            stage = await conn.fetchrow("select pipeline_id, kind from crm_stages where id=$1", fields["stage_id"])
            if not stage:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown stage")
            fields["pipeline_id"] = str(stage["pipeline_id"])
            won = stage["kind"] == "won"
        cols = ", ".join(f"{k}=${i+2}" for i, k in enumerate(fields))
        row = await conn.fetchrow(
            f"update crm_leads set {cols}, updated_at=now() where id=$1 returning *", lead_id, *fields.values())
        # First taste of automation: a won deal notifies the lead owner.
        if won:
            await notifications.create(
                conn, user_id=str(row["owner_id"] or auth.user_id),
                title=f"Deal won: {row['name']}",
                body=f"{row['company']} — PKR {row['value_minor'] // 100:,}".rstrip(" —"),
                kind="success", link="/crm")
    return _lead(row)


@router.post("/leads/{lead_id}/interactions", response_model=InteractionOut, status_code=status.HTTP_201_CREATED)
async def log_interaction(lead_id: str, body: InteractionCreate, auth: AuthContext = Depends(require("crm", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("select 1 from crm_leads where id=$1", lead_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
        row = await conn.fetchrow(
            """insert into crm_interactions (tenant_id, lead_id, user_id, channel, outcome, note, next_follow_up_at)
               values ($1,$2,$3,$4,$5,$6,$7) returning *""",
            auth.tenant_id, lead_id, auth.user_id, body.channel, body.outcome, body.note, body.next_follow_up_at)
        await conn.execute("update crm_leads set updated_at=now() where id=$1", lead_id)
    return InteractionOut(
        id=str(row["id"]), user_id=str(row["user_id"]) if row["user_id"] else None, channel=row["channel"],
        outcome=row["outcome"], note=row["note"], next_follow_up_at=row["next_follow_up_at"], created_at=row["created_at"])
