"""CRM — leads (with fuzzy duplicate detection), their lifecycle, timeline
and the legacy interaction log. Pipelines, stages and lost reasons live in
crm_pipelines.py, reports in crm_reports.py, activities in activities.py.
Guarded by require('crm', ...) / permission keys, which check the crm
entitlement + RBAC."""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from .. import activities, audit, csv_io, db, fulfillment, leads, pipelines, refs, scoring, timeline
from ..deps import AuthContext
from ..workflow import engine as wf
from ..models import (
    LEAD_STATUSES,
    CrmSummary,
    DuplicateMatch,
    FulfillmentData,
    FulfillmentSchema,
    ImportResult,
    ImportRowError,
    InteractionCreate,
    InteractionOut,
    LeadCreate,
    LeadDetail,
    LeadLost,
    LeadOut,
    LeadUpdate,
    NoteCreate,
    TimelineEventOut,
    TimelinePage,
)
from ..rbac import perm, require

router = APIRouter(prefix="/crm", tags=["crm"])

DUP_SIMILARITY = 0.6


# ── CSV import / export ─────────────────────────────────────────────────────
@router.post("/leads/import", response_model=ImportResult)
async def import_leads(request: Request, skip_duplicates: bool = True,
                       auth: AuthContext = Depends(require("crm", "write"))) -> ImportResult:
    """Bulk-load leads from a CSV posted as the raw request body.

    Row-level tolerance on purpose: a 2,000-row file with three bad rows imports
    1,997 and names the three — failing the whole file sends the user back to
    Excel to hunt for a needle. Duplicate checks run inside the same transaction,
    so a phone number appearing twice *within the file* is caught too.
    """
    rows = csv_io.read_rows(await request.body(), csv_io.LEAD_HEADERS)

    created = skipped = 0
    errors: list[ImportRowError] = []
    async with db.tenant_conn(auth.tenant_id) as conn:
        pid = await pipelines.ensure_default(conn, auth.tenant_id)
        first = await conn.fetchrow(
            "select id, default_probability from crm_stages where pipeline_id=$1 order by position limit 1", pid)
        for i, row in enumerate(rows, start=2):  # 1-based, after the header line
            name = row.get("name", "")
            if not name:
                errors.append(ImportRowError(row=i, error="Missing name"))
                continue
            company, phone, email = row.get("company", ""), row.get("phone", ""), row.get("email", "")
            if skip_duplicates and await _find_duplicates(conn, name, company, phone, email):
                skipped += 1
                continue
            value_minor = csv_io.parse_money_minor(row.get("value", ""))
            await conn.execute(
                """insert into crm_leads (tenant_id, pipeline_id, stage_id, owner_id, name,
                                          company, phone, email, source, value_minor, score,
                                          probability, stage_entered_at)
                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())""",
                auth.tenant_id, pid, first["id"], auth.user_id, name, company, phone, email,
                row.get("source", "") or "import", value_minor,
                scoring.score_lead(source="import", company=company, phone=phone,
                                   email=email, value_minor=value_minor),
                first["default_probability"])
            created += 1
            # Deliberately no wf.emit here: a 2,000-row import must not fire
            # 2,000 automations/notifications at the owner.
    return ImportResult(created=created, skipped_duplicates=skipped, errors=errors[:50])


@router.get("/leads/export")
async def export_leads(auth: AuthContext = Depends(require("crm", "read"))) -> Response:
    """Their data is theirs — export is also what makes import trustworthy."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select l.name, l.company, l.phone, l.email, l.source,
                      (l.value_minor / 100.0) as value, s.name as stage, l.created_at
                 from crm_leads l join crm_stages s on s.id = l.stage_id
                order by l.created_at""")
        await audit.event(conn, "export.leads", "crm_leads", data={"rows": len(rows)})
    body = csv_io.to_csv(
        ["name", "company", "phone", "email", "source", "value", "stage", "created_at"],
        [dict(r) for r in rows])
    return Response(body, media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="leads.csv"'})


@router.get("/summary", response_model=CrmSummary)
async def summary(auth: AuthContext = Depends(require("crm", "read"))) -> CrmSummary:
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """select count(*) as total,
                      count(*) filter (where status = 'open') as open,
                      coalesce(sum(value_minor) filter (where status = 'won'), 0) as won_value,
                      count(*) filter (where created_at > now() - interval '7 days') as this_week
               from crm_leads""")
    return CrmSummary(total_leads=row["total"], open_leads=row["open"],
                      won_value_minor=row["won_value"], added_this_week=row["this_week"])


@router.get("/fulfillment/schema", response_model=FulfillmentSchema)
async def fulfillment_schema(auth: AuthContext = Depends(require("crm", "read"))) -> FulfillmentSchema:
    async with db.tenant_conn(auth.tenant_id) as conn:
        label = await conn.fetchval(
            "select label from terminology where industry_type=$1 and key='fulfillment' and locale='en'",
            auth.industry_type)
    return FulfillmentSchema(label=label or "Fulfillment", fields=fulfillment.schema_for(auth.industry_type))


@router.get("/leads/{lead_id}/fulfillment", response_model=FulfillmentData)
async def get_fulfillment(lead_id: str, auth: AuthContext = Depends(require("crm", "read"))) -> FulfillmentData:
    async with db.tenant_conn(auth.tenant_id) as conn:
        data = await conn.fetchval("select data from crm_fulfillment where lead_id=$1", lead_id)
    return FulfillmentData(data=data or {})


@router.put("/leads/{lead_id}/fulfillment", response_model=FulfillmentData)
async def save_fulfillment(lead_id: str, body: FulfillmentData,
                           auth: AuthContext = Depends(require("crm", "write"))) -> FulfillmentData:
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("select 1 from crm_leads where id=$1", lead_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
        data = await conn.fetchval(
            """insert into crm_fulfillment (tenant_id, lead_id, data) values ($1,$2,$3)
               on conflict (lead_id) do update set data = excluded.data, updated_at = now()
               returning data""",
            auth.tenant_id, lead_id, body.data)
    return FulfillmentData(data=data)


def _statuses(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    wanted = [s.strip() for s in raw.split(",") if s.strip()]
    bad = [s for s in wanted if s not in LEAD_STATUSES]
    if bad:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown status: {', '.join(bad)}")
    return wanted


@router.get("/leads", response_model=list[LeadOut])
async def list_leads(pipeline_id: str | None = None,
                     status_filter: str | None = Query(None, alias="status",
                                                       description="Comma list of open, won, lost"),
                     auth: AuthContext = Depends(require("crm", "read"))):
    wanted = _statuses(status_filter)
    async with db.tenant_conn(auth.tenant_id) as conn:
        pid = pipeline_id or await pipelines.ensure_default(conn, auth.tenant_id)
        rows = await conn.fetch(
            leads.LEAD_SELECT + """ where l.pipeline_id = $1 and ($2::text[] is null or l.status = any($2::text[]))
                                    order by l.created_at desc""", pid, wanted)
    return [leads.lead_out(r) for r in rows]


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
        await refs.ensure_visible(conn, "crm_pipelines", body.pipeline_id)
        await refs.ensure_visible(conn, "crm_stages", body.stage_id)
        pid = body.pipeline_id or await pipelines.ensure_default(conn, auth.tenant_id)
        if body.stage_id and not await conn.fetchval(
                "select 1 from crm_stages where id=$1 and pipeline_id=$2", body.stage_id, pid):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That stage isn't in this pipeline")
        if not body.force:
            dups = await _find_duplicates(conn, body.name, body.company, body.phone, body.email)
            if dups:
                raise HTTPException(status.HTTP_409_CONFLICT,
                                    detail={"message": "Possible duplicate", "duplicates": [d.model_dump() for d in dups]})
        stage = await conn.fetchrow(
            """select id, is_won, default_probability from crm_stages
                where ($2::uuid is null and pipeline_id=$1) or id=$2
                order by position limit 1""", pid, body.stage_id)
        if not stage:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pipeline has no stages")
        lead_status = "won" if stage["is_won"] else "open"
        lead_score = scoring.score_lead(source=body.source, company=body.company, phone=body.phone,
                                        email=body.email, value_minor=body.value_minor)
        row = await conn.fetchrow(
            """insert into crm_leads (tenant_id, pipeline_id, stage_id, owner_id, name, company, phone, email,
                                      source, value_minor, score, status, won_at, probability, priority,
                                      expected_close_date, stage_entered_at)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                       case when $12 = 'won' then now() end, $13, $14, $15, now())
               returning *""",
            auth.tenant_id, pid, stage["id"], auth.user_id, body.name, body.company, body.phone,
            body.email, body.source, body.value_minor, lead_score, lead_status,
            100 if stage["is_won"] else stage["default_probability"], body.priority, body.expected_close_date)
        await timeline.record(conn, entity_type="lead", entity_id=str(row["id"]), kind="system",
                              payload={"event": "created", "source": body.source})
        await wf.emit(conn, auth.user_id, "lead.created", leads.event_payload(row))
        if lead_status == "won":
            await wf.emit(conn, auth.user_id, "lead.won", leads.event_payload(row, "won"))
        return await leads.fetch_out(conn, str(row["id"]))


@router.get("/leads/{lead_id}", response_model=LeadDetail)
async def get_lead(lead_id: str, auth: AuthContext = Depends(require("crm", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        lead = await leads.fetch_out(conn, lead_id)
        page = await timeline.page(conn, "lead", lead_id, limit=50)
        acts = await conn.fetch(
            activities.SELECT + f""" where a.entity_type = 'lead' and a.entity_id = $1 and {activities.OPEN}
                                     order by a.due_date, a.due_at nulls last, a.created_at""", lead_id)
    return LeadDetail(lead=lead, timeline=page.items, activities=[activities.out(a) for a in acts])


@router.patch("/leads/{lead_id}", response_model=LeadOut)
async def update_lead(lead_id: str, body: LeadUpdate, auth: AuthContext = Depends(require("crm", "write"))):
    fields = body.model_dump(exclude_unset=True)
    # Explicit nulls only clear the fields that may be empty.
    fields = {k: v for k, v in fields.items() if v is not None or k == "expected_close_date"}
    async with db.tenant_conn(auth.tenant_id) as conn:
        before = await leads.lock(conn, lead_id)
        await refs.ensure_visible(conn, "users", fields.get("owner_id"))
        patch = await leads.plan_patch(conn, before, fields)
        return await leads.save(conn, auth.user_id, before, patch)


@router.post("/leads/{lead_id}/won", response_model=LeadOut)
async def win_lead(lead_id: str, auth: AuthContext = Depends(perm("crm.lead.update"))) -> LeadOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await leads.mark_won(conn, auth.user_id, lead_id)


@router.post("/leads/{lead_id}/lost", response_model=LeadOut)
async def lose_lead(lead_id: str, body: LeadLost, auth: AuthContext = Depends(perm("crm.lead.update"))) -> LeadOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await leads.mark_lost(conn, auth.user_id, lead_id, body.lost_reason_id, body.lost_note)


@router.post("/leads/{lead_id}/restore", response_model=LeadOut)
async def restore_lead(lead_id: str, auth: AuthContext = Depends(perm("crm.lead.update"))) -> LeadOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await leads.restore(conn, auth.user_id, lead_id)


@router.get("/leads/{lead_id}/timeline", response_model=TimelinePage)
async def lead_timeline(lead_id: str, cursor: str | None = None, limit: int = Query(50, ge=1, le=200),
                        auth: AuthContext = Depends(perm("crm.lead.read"))) -> TimelinePage:
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("select 1 from crm_leads where id=$1", lead_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
        try:
            return await timeline.page(conn, "lead", lead_id, cursor=cursor, limit=limit)
        except ValueError as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))


@router.post("/leads/{lead_id}/notes", response_model=TimelineEventOut, status_code=status.HTTP_201_CREATED)
async def add_note(lead_id: str, body: NoteCreate, auth: AuthContext = Depends(perm("crm.lead.update"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("update crm_leads set updated_at = now() where id=$1 returning 1", lead_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
        event_id = await timeline.record(conn, entity_type="lead", entity_id=lead_id, kind="note", body=body.body)
        page = await timeline.page(conn, "lead", lead_id, limit=1)
    return next(e for e in page.items if e.id == event_id)


_CHANNEL_TYPE = {"call": "call", "whatsapp": "whatsapp"}


@router.post("/leads/{lead_id}/interactions", response_model=InteractionOut, status_code=status.HTTP_201_CREATED)
async def log_interaction(lead_id: str, body: InteractionCreate, auth: AuthContext = Depends(require("crm", "write"))):
    """The pre-activities way to log a contact, kept for API callers: the
    contact lands on the timeline (kind 'note' or 'call'), a follow-up time
    becomes a planned activity, and `interaction.logged` still fires."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        lead = await conn.fetchrow("update crm_leads set updated_at=now() where id=$1 returning *", lead_id)
        if not lead:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
        event_id = await timeline.record(
            conn, entity_type="lead", entity_id=lead_id, kind="note" if body.channel == "note" else "call",
            body=body.note or None,
            payload={"channel": body.channel, "outcome": body.outcome,
                     "next_follow_up_at": body.next_follow_up_at.isoformat() if body.next_follow_up_at else None})
        if body.next_follow_up_at:
            typ = await activities.type_by_code_or_name(conn, _CHANNEL_TYPE.get(body.channel, "todo"))
            if typ is not None:
                due_day: dt.date = await conn.fetchval("select ($1::timestamptz)::date", body.next_follow_up_at)
                await activities.create(conn, entity_type="lead", entity_id=lead_id, type_id=str(typ["id"]),
                                        due_date=due_day, due_at=body.next_follow_up_at, created_by=auth.user_id,
                                        summary="Follow up", note=body.note,
                                        assigned_to=str(lead["owner_id"]) if lead["owner_id"] else auth.user_id)
        await wf.emit(conn, auth.user_id, "interaction.logged", {
            **leads.event_payload(lead), "interaction_id": event_id, "channel": body.channel,
            "outcome": body.outcome, "note": body.note,
            "next_follow_up_at": body.next_follow_up_at.isoformat() if body.next_follow_up_at else None,
        })
        created_at = await conn.fetchval("select occurred_at from timeline_events where id=$1", event_id)
    return InteractionOut(
        id=str(event_id), user_id=auth.user_id, channel=body.channel, outcome=body.outcome, note=body.note,
        next_follow_up_at=body.next_follow_up_at, created_at=created_at)
