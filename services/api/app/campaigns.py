"""Consent, segments, templates and email campaigns (wave D, C19/C20/C22,
migration 0124; study 12 §5).

* Consent is per contact and channel. A marketing message needs an opt-in;
  an opt-out always wins (also when contacts are merged).
* A segment is a structured filter from a fixed allow-list, compiled here to
  parameterised SQL and run under RLS, so it is always the current list.
* Templates use merge tokens from a fixed list, checked when saved. Values
  are inserted as plain text: braces and line breaks in a value can't become
  tokens or mail headers.
* Sending snapshots the wording, then records every contact in the segment
  as queued (with its email outbox row) or skipped with the reason. The
  tenant's daily cap holds back the rest; mail written between 9 pm and 9 am
  Pakistan time waits in the outbox until 9 am.
* Every email carries an unsubscribe link: /u/{token}, where the token is
  the campaign and contact ids signed with a server key. Its GET only shows
  a page (mail scanners follow links); the POST opts the contact out.
"""
from __future__ import annotations

import hashlib
import hmac
import re
from datetime import datetime, time, timedelta, timezone
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg
from fastapi import HTTPException, status

from . import audit, db, email
from .config import settings
from .crm_selling_models import SegmentFilter, SegmentPreview, PersonOut
from .phone import normalize_email

PKT = ZoneInfo("Asia/Karachi")
QUIET_FROM = time(21, 0)
QUIET_UNTIL = time(9, 0)
SENDERS = {"email"}          # SMS and WhatsApp join when their senders exist (Phase 4)

TOKENS = {"name", "first_name", "company", "city", "business_name"}
_TOKEN = re.compile(r"\{\{\s*([a-z_]+)\s*(?:\|([^{}]*))?\}\}")


# ── Templates ───────────────────────────────────────────────────────────────
def check_template(*texts: str) -> None:
    """422 for a token we don't know or a half-written one."""
    for text in texts:
        unknown = {m.group(1) for m in _TOKEN.finditer(text)} - TOKENS
        if unknown:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                f"Unknown merge field: {', '.join(sorted(unknown))}. "
                                f"Use {', '.join('{{' + t + '}}' for t in sorted(TOKENS))}")
        if "{{" in _TOKEN.sub("", text) or "}}" in _TOKEN.sub("", text):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A merge field isn't closed with }}")


def _plain(v: str) -> str:
    return re.sub(r"[\r\n\t]+", " ", v).strip()


def render(text: str, data: dict[str, str]) -> str:
    """One pass: a value is never searched for tokens again."""
    def fill(m: re.Match[str]) -> str:
        value = _plain(data.get(m.group(1), ""))
        return value or (m.group(2) or "").strip()
    return _TOKEN.sub(fill, text)


def merge_data(c: asyncpg.Record | dict[str, Any], business: str) -> dict[str, str]:
    name = (c["name"] or "").strip()
    return {"name": name, "first_name": name.split(" ")[0] if name else "", "company": c["company_name"] or "",
            "city": c["city"] or "", "business_name": business}


# ── Quiet hours ─────────────────────────────────────────────────────────────
def quiet_until(now: datetime) -> datetime | None:
    """9 am Pakistan time when `now` falls in the quiet hours, else None."""
    local = now.astimezone(PKT)
    if QUIET_UNTIL <= local.time() < QUIET_FROM:
        return None
    day = local.date() if local.time() < QUIET_UNTIL else local.date() + timedelta(days=1)
    return datetime.combine(day, QUIET_UNTIL, tzinfo=PKT)


# ── Segments ────────────────────────────────────────────────────────────────
def segment_sql(f: SegmentFilter) -> tuple[str, list[Any]]:
    """WHERE clause over contacts `c` and its parameters, from the allow-list only."""
    where = ["c.archived_at is null", "c.merged_into_id is null"]
    args: list[Any] = []

    def arg(v: Any) -> str:
        args.append(v)
        return f"${len(args)}"
    if f.tag_ids:
        where.append(f"""exists (select 1 from record_tags rt where rt.entity_type = 'contact'
                                    and rt.entity_id = c.id and rt.tag_id = any({arg(list(f.tag_ids))}::uuid[]))""")
    if f.kind:
        where.append(f"c.kind = {arg(f.kind)}")
    if f.roles:
        where.append(f"c.roles && {arg(list(f.roles))}::text[]")
    if f.city:
        where.append(f"lower(btrim(c.city)) = lower(btrim({arg(f.city)}))")
    if f.has_email is not None:
        where.append("c.email_normalized is not null" if f.has_email else "c.email_normalized is null")
    return " and ".join(where), args


async def check_tags(conn: asyncpg.Connection, f: SegmentFilter) -> None:
    if f.tag_ids:
        seen = await conn.fetchval("select count(*) from tags where id = any($1::uuid[])", list(f.tag_ids))
        if seen != len(set(f.tag_ids)):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")


async def audience(conn: asyncpg.Connection, f: SegmentFilter, channel: str) -> list[dict[str, Any]]:
    """Every contact in the segment with the address for `channel` and why
    they can't be reached, if they can't (skip None = reachable)."""
    where, args = segment_sql(f)
    args.append(channel)
    rows = await conn.fetch(
        f"""select c.id, c.name, c.company_name, c.city, c.email_normalized, c.phone_e164, cc.status as consent
              from contacts c
              left join contact_consents cc on cc.contact_id = c.id and cc.channel = ${len(args)}
             where {where} order by lower(c.name), c.id""", *args)
    out = []
    for r in rows:
        address = (r["email_normalized"] if channel == "email" else r["phone_e164"]) or ""
        skip = ("opted_out" if r["consent"] == "opted_out" else "no_address" if not address
                else "no_consent" if r["consent"] != "opted_in" else None)
        out.append({**dict(r), "address": address, "skip": skip})
    return out


async def preview(conn: asyncpg.Connection, f: SegmentFilter, channel: str) -> SegmentPreview:
    people = await audience(conn, f, channel)
    skipped: dict[str, int] = {}
    for p in people:
        if p["skip"]:
            skipped[p["skip"]] = skipped.get(p["skip"], 0) + 1
    ok = [p for p in people if not p["skip"]]
    return SegmentPreview(total=len(people), reachable=len(ok), skipped=skipped,
                          sample=[PersonOut(id=str(p["id"]), name=p["name"]) for p in ok[:5]])


# ── Unsubscribe tokens ──────────────────────────────────────────────────────
def _key() -> bytes:
    seed = settings.bos_data_keys + settings.database_url
    return hashlib.sha256(b"bos-unsubscribe:" + seed.encode()).digest()


def unsubscribe_token(campaign_id: Any, contact_id: Any) -> str:
    body = f"{campaign_id}.{contact_id}"
    return f"{body}.{hmac.new(_key(), body.encode(), hashlib.sha256).hexdigest()[:32]}"


def read_token(token: str) -> tuple[UUID, UUID] | None:
    parts = token.split(".")
    if len(parts) != 3:
        return None
    body = f"{parts[0]}.{parts[1]}"
    good = hmac.new(_key(), body.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(parts[2], good):
        return None
    try:
        return UUID(parts[0]), UUID(parts[1])
    except ValueError:
        return None


async def resolve_unsubscribe(token: str) -> asyncpg.Record:
    ids = read_token(token)
    if ids is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This link isn't valid.")
    async with db.owner_conn() as oc:
        row: asyncpg.Record | None = await oc.fetchrow(
            """select r.tenant_id, r.contact_id, k.channel from crm_campaign_recipients r
                 join crm_campaigns k on k.id = r.campaign_id
                where r.campaign_id = $1 and r.contact_id = $2""", *ids)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This link isn't valid.")
    return row


async def opt_out(conn: asyncpg.Connection, tenant_id: Any, contact_id: Any, channel: str, source: str,
                  user_id: str | None = None) -> None:
    await conn.execute(
        """insert into contact_consents (tenant_id, contact_id, channel, status, source, updated_by)
           values ($1, $2, $3, 'opted_out', $4, $5)
           on conflict (contact_id, channel) do update
             set status = 'opted_out', source = excluded.source, updated_by = excluded.updated_by, updated_at = now()""",
        tenant_id, contact_id, channel, source, user_id)


# ── Sending ─────────────────────────────────────────────────────────────────
async def send(conn: asyncpg.Connection, tenant_id: str, user_id: str, campaign_id: str) -> None:
    k = await conn.fetchrow("select * from crm_campaigns where id = $1 for update", campaign_id)
    if k is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    if k["status"] != "draft":
        raise HTTPException(status.HTTP_409_CONFLICT, "This campaign has already been sent")
    seg = await conn.fetchrow("select filter from crm_segments where id = $1", k["segment_id"])
    tpl = await conn.fetchrow("select subject, body from crm_templates where id = $1", k["template_id"])
    business: str = await conn.fetchval(
        """select coalesce(nullif(c.legal_name, ''), t.name) from tenants t
             left join tenant_company c on c.tenant_id = t.id where t.id = $1""", tenant_id)
    cap: int = await conn.fetchval("select campaign_daily_cap from crm_settings") or 500
    used: int = await conn.fetchval(
        """select count(*) from crm_campaign_recipients
            where status = 'queued' and created_at >= date_trunc('day', now())""")
    hold = quiet_until(datetime.now(timezone.utc))
    queued = skipped = 0
    for p in await audience(conn, SegmentFilter.model_validate(seg["filter"]), k["channel"]):
        skip = p["skip"] or ("daily_cap" if used + queued >= cap else None)
        outbox_id = None
        if skip is None:
            data = merge_data(p, business)
            outbox_id = await email.queue_campaign(
                conn, tenant_id, p["address"], subject=render(tpl["subject"], data), body=render(tpl["body"], data),
                business=business, unsubscribe_token=unsubscribe_token(campaign_id, p["id"]), run_after=hold)
            queued += 1
        else:
            skipped += 1
        await conn.execute(
            """insert into crm_campaign_recipients (tenant_id, campaign_id, contact_id, address, status, skip_reason,
                                                    outbox_id)
               values ($1, $2, $3, $4, $5, $6, $7)""",
            tenant_id, campaign_id, p["id"], p["address"], "skipped" if skip else "queued", skip, outbox_id)
    await conn.execute(
        """update crm_campaigns set status = 'sent', subject = $2, body = $3, queued_count = $4, skipped_count = $5,
                                    sent_by = $6, sent_at = now(), updated_at = now()
            where id = $1""", campaign_id, tpl["subject"], tpl["body"], queued, skipped, user_id)



# ── A web form's tick: confirmed by the address owner (double opt-in) ──────
# Security review of c6b3ca3: anyone can type a stranger's email or phone into
# a public form, so a tick never opts anyone in by itself. When staff qualify
# the lead, the contact is emailed a confirmation link at their own address;
# only clicking it records the opt-in. Phone channels wait for a phone
# confirmation (Phase 4 senders).
CONSENT_TTL_SECONDS = 14 * 24 * 3600


def _now_s() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _consent_key() -> bytes:
    seed = settings.bos_data_keys + settings.database_url
    return hashlib.sha256(b"bos-consent-confirm:" + seed.encode()).digest()


def _consent_sig(contact_id: str, exp: int, address: str) -> str:
    msg = f"{contact_id}.{exp}.{address.lower()}".encode()
    return hmac.new(_consent_key(), msg, hashlib.sha256).hexdigest()[:32]


def consent_token(contact_id: Any, address: str) -> str:
    """'<contact>.<expiry>.<signature>', the signature bound to the address
    as it is now, so a link stops working if the contact's email changes."""
    exp = _now_s() + CONSENT_TTL_SECONDS
    return f"{contact_id}.{exp}.{_consent_sig(str(contact_id), exp, address)}"


async def resolve_consent(token: str) -> asyncpg.Record:
    """The contact (and its business) a confirmation link is for, or 404:
    forged, expired, or for an address the contact no longer has."""
    parts = token.split(".")
    if len(parts) != 3 or not parts[1].isdigit():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This link isn't valid.")
    try:
        contact_id = UUID(parts[0])
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This link isn't valid.") from None
    if int(parts[1]) < _now_s():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This link has expired.")
    async with db.owner_conn() as oc:
        row: asyncpg.Record | None = await oc.fetchrow(
            """select id, tenant_id, email_normalized from contacts
                where id = $1 and archived_at is null and merged_into_id is null""", contact_id)
    if row is None or not row["email_normalized"] or not hmac.compare_digest(
            parts[2], _consent_sig(str(contact_id), int(parts[1]), row["email_normalized"])):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This link isn't valid.")
    return row


async def ask_to_confirm(conn: asyncpg.Connection, tenant_id: Any, lead: asyncpg.Record,
                         contact_id: Any) -> int | None:
    """After qualifying a lead that ticked the form's box: email the contact
    a confirmation link, if the email the visitor typed is the contact's own
    and they haven't opted out. Opts nobody in. Returns the outbox row queued."""
    if lead["consent_at"] is None or not lead["email"]:
        return None
    c = await conn.fetchrow("select email_normalized from contacts where id = $1", contact_id)
    if c is None or not c["email_normalized"] or normalize_email(lead["email"]) != c["email_normalized"]:
        return None
    if await conn.fetchval(
            "select 1 from contact_consents where contact_id = $1 and channel = 'email'", contact_id):
        return None       # already decided, either way: an opt-out stays, an opt-in needs nothing
    mail: int = await email.queue_consent_confirm(conn, str(tenant_id), c["email_normalized"], str(contact_id))
    await audit.track(conn, entity_type="contact", entity_id=str(contact_id), contact_id=str(contact_id),
                      kind="system", body="Asked to confirm marketing by email (they ticked it on a web form)")
    return mail


async def confirm(conn: asyncpg.Connection, tenant_id: Any, contact_id: Any) -> bool:
    """The address owner clicked yes. An opt-out on record stays (returns False)."""
    cur = await conn.fetchval(
        "select status from contact_consents where contact_id = $1 and channel = 'email'", contact_id)
    if cur == "opted_out":
        return False
    await conn.execute(
        """insert into contact_consents (tenant_id, contact_id, channel, status, source)
           values ($1, $2, 'email', 'opted_in', 'Confirmed by the email link (double opt-in)')
           on conflict (contact_id, channel) do nothing""", tenant_id, contact_id)
    return True
