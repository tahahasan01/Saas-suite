"""Consent, segments, templates and campaigns (wave D, C19/C20/C22). Drafting
lists, templates and campaigns needs crm.campaign.manage; sending needs
crm.campaign.send; a contact's consent rides on the contacts keys. The
unsubscribe page is /public/unsubscribe/{token}: its GET only reads. The
logic is in app/campaigns.py."""
from __future__ import annotations

from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from .. import campaigns, context, db, ratelimit
from ..crm_selling_models import (
    CampaignIn,
    CampaignOut,
    ConsentIn,
    ConsentOut,
    RecipientOut,
    SegmentFilter,
    SegmentIn,
    SegmentOut,
    SegmentPreview,
    TemplateIn,
    TemplateOut,
    UnsubscribePage,
)
from ..deps import AuthContext
from ..models import MessageChannel
from ..rbac import perm

router = APIRouter(tags=["crm-campaigns"])
public = APIRouter(prefix="/public/unsubscribe", tags=["public"])


# ── Consent ─────────────────────────────────────────────────────────────────
def _consent(r: asyncpg.Record) -> ConsentOut:
    return ConsentOut(channel=r["channel"], status=r["status"], source=r["source"], updated_at=r["updated_at"])


@router.get("/contacts/{contact_id}/consents", response_model=list[ConsentOut])
async def list_consents(contact_id: str,
                        auth: AuthContext = Depends(perm("contacts.contact.read"))) -> list[ConsentOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select * from contact_consents where contact_id = $1 order by channel", contact_id)
    return [_consent(r) for r in rows]


@router.put("/contacts/{contact_id}/consents", response_model=ConsentOut)
async def set_consent(contact_id: str, body: ConsentIn,
                      auth: AuthContext = Depends(perm("contacts.contact.update"))) -> ConsentOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("select 1 from contacts where id = $1", contact_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
        row = await conn.fetchrow(
            """insert into contact_consents (tenant_id, contact_id, channel, status, source, updated_by)
               values ($1, $2, $3, $4, $5, $6)
               on conflict (contact_id, channel) do update
                 set status = excluded.status, source = excluded.source, updated_by = excluded.updated_by,
                     updated_at = now()
               returning *""", auth.tenant_id, contact_id, body.channel, body.status, body.source, auth.user_id)
    return _consent(row)


# ── Segments ────────────────────────────────────────────────────────────────
def _segment(r: asyncpg.Record) -> SegmentOut:
    return SegmentOut(id=str(r["id"]), name=r["name"], filter=SegmentFilter.model_validate(r["filter"]),
                      created_at=r["created_at"])


@router.get("/crm/segments", response_model=list[SegmentOut])
async def list_segments(auth: AuthContext = Depends(perm("crm.campaign.manage"))) -> list[SegmentOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select * from crm_segments where archived_at is null order by lower(name)")
    return [_segment(r) for r in rows]


@router.post("/crm/segments", response_model=SegmentOut, status_code=status.HTTP_201_CREATED)
async def create_segment(body: SegmentIn, auth: AuthContext = Depends(perm("crm.campaign.manage"))) -> SegmentOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await campaigns.check_tags(conn, body.filter)
        row = await conn.fetchrow(
            """insert into crm_segments (tenant_id, name, filter, created_by) values ($1, btrim($2), $3, $4)
               returning *""", auth.tenant_id, body.name, body.filter.model_dump(mode="json"), auth.user_id)
    return _segment(row)


@router.get("/crm/segments/{segment_id}/preview", response_model=SegmentPreview)
async def preview_segment(segment_id: str, channel: MessageChannel = Query("email"),
                          auth: AuthContext = Depends(perm("crm.campaign.manage"))) -> SegmentPreview:
    async with db.tenant_conn(auth.tenant_id) as conn:
        f = await conn.fetchval("select filter from crm_segments where id = $1", segment_id)
        if f is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Segment not found")
        return await campaigns.preview(conn, SegmentFilter.model_validate(f), channel)


# ── Templates ───────────────────────────────────────────────────────────────
def _template(r: asyncpg.Record) -> TemplateOut:
    return TemplateOut(id=str(r["id"]), name=r["name"], channel=r["channel"], subject=r["subject"], body=r["body"],
                       created_at=r["created_at"])


@router.get("/crm/templates", response_model=list[TemplateOut])
async def list_templates(auth: AuthContext = Depends(perm("crm.campaign.manage"))) -> list[TemplateOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select * from crm_templates where archived_at is null order by lower(name)")
    return [_template(r) for r in rows]


@router.post("/crm/templates", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(body: TemplateIn, auth: AuthContext = Depends(perm("crm.campaign.manage"))) -> TemplateOut:
    campaigns.check_template(body.subject, body.body)
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """insert into crm_templates (tenant_id, name, channel, subject, body, created_by)
               values ($1, btrim($2), $3, $4, $5, $6) returning *""",
            auth.tenant_id, body.name, body.channel, body.subject, body.body, auth.user_id)
    return _template(row)


# ── Campaigns ───────────────────────────────────────────────────────────────
def _campaign(r: asyncpg.Record) -> CampaignOut:
    return CampaignOut(id=str(r["id"]), name=r["name"], channel=r["channel"], segment_id=str(r["segment_id"]),
                       template_id=str(r["template_id"]), status=r["status"], queued_count=r["queued_count"],
                       skipped_count=r["skipped_count"], sent_at=r["sent_at"], created_at=r["created_at"])


@router.get("/crm/campaigns", response_model=list[CampaignOut])
async def list_campaigns(auth: AuthContext = Depends(perm("crm.campaign.manage"))) -> list[CampaignOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select * from crm_campaigns order by created_at desc limit 200")
    return [_campaign(r) for r in rows]


@router.post("/crm/campaigns", response_model=CampaignOut, status_code=status.HTTP_201_CREATED)
async def create_campaign(body: CampaignIn, auth: AuthContext = Depends(perm("crm.campaign.manage"))) -> CampaignOut:
    if body.channel not in campaigns.SENDERS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"{body.channel.upper() if body.channel == 'sms' else 'WhatsApp'} campaigns aren't "
                            "available yet. Use email for now.")
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("select 1 from crm_segments where id = $1 and archived_at is null", body.segment_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Segment not found")
        tpl = await conn.fetchval("select channel from crm_templates where id = $1 and archived_at is null",
                                  body.template_id)
        if tpl is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
        if tpl != body.channel:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That template is for another channel")
        row = await conn.fetchrow(
            """insert into crm_campaigns (tenant_id, name, channel, segment_id, template_id, created_by)
               values ($1, btrim($2), $3, $4, $5, $6) returning *""",
            auth.tenant_id, body.name, body.channel, body.segment_id, body.template_id, auth.user_id)
    return _campaign(row)


@router.post("/crm/campaigns/{campaign_id}/send", response_model=CampaignOut)
async def send_campaign(campaign_id: str, auth: AuthContext = Depends(perm("crm.campaign.send"))) -> CampaignOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await campaigns.send(conn, auth.tenant_id, auth.user_id, campaign_id)
        return _campaign(await conn.fetchrow("select * from crm_campaigns where id = $1", campaign_id))


@router.get("/crm/campaigns/{campaign_id}/recipients", response_model=list[RecipientOut])
async def recipients(campaign_id: str,
                     auth: AuthContext = Depends(perm("crm.campaign.manage"))) -> list[RecipientOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select r.*, c.name from crm_campaign_recipients r join contacts c on c.id = r.contact_id
                where r.campaign_id = $1 order by r.status, lower(c.name)""", campaign_id)
    return [RecipientOut(contact_id=str(r["contact_id"]), name=r["name"], address=r["address"], status=r["status"],
                         skip_reason=r["skip_reason"]) for r in rows]


# ── Unsubscribe (public) ────────────────────────────────────────────────────
async def _no_store(request: Request, response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    retry = await ratelimit.hit(f"ip:{ratelimit.client_ip(request)}:unsubscribe", 30, 60)
    if retry:
        raise ratelimit.too_many(retry)


async def _page(row: asyncpg.Record) -> UnsubscribePage:
    async with db.tenant_conn(str(row["tenant_id"])) as conn:
        business: Any = await conn.fetchval(
            """select coalesce(nullif(c.legal_name, ''), t.name) from tenants t
                 left join tenant_company c on c.tenant_id = t.id where t.id = $1""", row["tenant_id"])
        done = await conn.fetchval(
            "select status = 'opted_out' from contact_consents where contact_id = $1 and channel = $2",
            row["contact_id"], row["channel"])
    return UnsubscribePage(business_name=business or "", channel=row["channel"], done=bool(done))


@public.get("/{token}", response_model=UnsubscribePage, dependencies=[Depends(_no_store)])
async def unsubscribe_page(token: str) -> UnsubscribePage:
    """Shows who is asking; changes nothing (mail scanners open links)."""
    return await _page(await campaigns.resolve_unsubscribe(token))


@public.post("/{token}", response_model=UnsubscribePage, dependencies=[Depends(_no_store)])
async def unsubscribe(token: str) -> UnsubscribePage:
    row = await campaigns.resolve_unsubscribe(token)
    context.set_actor("", "public")
    async with db.tenant_conn(str(row["tenant_id"])) as conn:
        await campaigns.opt_out(conn, row["tenant_id"], row["contact_id"], row["channel"],
                                "Unsubscribed from an email link")
    return await _page(row)
