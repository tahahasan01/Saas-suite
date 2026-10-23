"""Web lead forms and lead assignment (wave D, C12/C13, migration 0122; study 12 §1).

A form is published on a hosted page (/f/{public_id}). The visitor's browser
gets the form's wording and a ticket; posting back makes a lead whose
pipeline, stage, source and owner all come from the form row. Spam is met in
layers, each answered with the same thank-you so a bot learns nothing:

* a honeypot field people never see;
* the ticket: a signed time from when the form was read. A forged one is
  dropped; one filled in faster than MIN_FILL_SECONDS is dropped; one older
  than TICKET_TTL_SECONDS asks the person to reload (a real visitor who left
  the tab open must not lose their message silently);
* a per-IP rate limit across all forms, and a per-form daily cap.

A visitor whose phone or email matches an open lead doesn't make a second
lead: the message lands on that lead's timeline with a follow-up for its
owner, and the answer is the same as for a new lead, so the form can't be
used to learn who is already a customer. Public input never edits a contact.

Unowned leads go round the assignment pool: the active member, under their
daily cap and not on approved leave today, who had a lead longest ago.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import secrets
import time
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import activities, db, leads, notifications, pipelines, scoring, sequences, timeline
from .config import settings
from .crm_selling_models import WebFormOut, WebFormPublic, WebFormValues
from .phone import normalize_email, normalize_phone
from .workflow import engine as wf

MIN_FILL_SECONDS = 3
TICKET_TTL_SECONDS = 24 * 3600
THANK_YOU = "Thank you. We'll be in touch soon."


def link_of(public_id: str) -> str:
    return f"/f/{public_id}"


def new_public_id() -> str:
    return secrets.token_urlsafe(16)


# ── Tickets ─────────────────────────────────────────────────────────────────
def _key() -> bytes:
    seed = settings.bos_data_keys + settings.database_url
    return hashlib.sha256(b"bos-form-ticket:" + seed.encode()).digest()


def _sign(public_id: str, ts: int) -> str:
    return hmac.new(_key(), f"{public_id}.{ts}".encode(), hashlib.sha256).hexdigest()[:32]


def ticket(public_id: str) -> str:
    ts = int(time.time())
    return f"{ts}.{_sign(public_id, ts)}"


def check_ticket(public_id: str, raw: str) -> str:
    """'ok', 'bot' (forged or too fast) or 'stale' (too old: ask to reload)."""
    ts_s, _, sig = raw.partition(".")
    if not ts_s.isdigit() or not hmac.compare_digest(sig, _sign(public_id, int(ts_s))):
        return "bot"
    age = time.time() - int(ts_s)
    if age < MIN_FILL_SECONDS:
        return "bot"
    if age > TICKET_TTL_SECONDS:
        return "stale"
    return "ok"


# ── Staff side ──────────────────────────────────────────────────────────────
def out(r: asyncpg.Record) -> WebFormOut:
    return WebFormOut(
        id=str(r["id"]), public_id=r["public_id"], link=link_of(r["public_id"]), name=r["name"], title=r["title"],
        intro=r["intro"], thank_you=r["thank_you"], fields=list(r["fields"]),
        pipeline_id=str(r["pipeline_id"]) if r["pipeline_id"] else None,
        stage_id=str(r["stage_id"]) if r["stage_id"] else None, source=r["source"],
        owner_id=str(r["owner_id"]) if r["owner_id"] else None, daily_cap=r["daily_cap"], active=r["active"],
        leads_today=r["leads_today"], created_at=r["created_at"], consent_label=r["consent_label"])


SELECT = """select f.*, (select count(*) from crm_leads l where l.web_form_id = f.id
                          and l.created_at >= date_trunc('day', now())) as leads_today
              from crm_web_forms f"""


async def check_routing(conn: asyncpg.Connection, pipeline_id: Any, stage_id: Any, owner_id: Any) -> None:
    """The form's pipeline, stage and owner must be this tenant's (a foreign
    key alone ignores RLS), and the stage must be in the pipeline."""
    if pipeline_id and not await conn.fetchval("select 1 from crm_pipelines where id = $1", pipeline_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pipeline not found")
    if stage_id:
        sp = await conn.fetchval("select pipeline_id from crm_stages where id = $1", stage_id)
        if sp is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Stage not found")
        if pipeline_id and str(sp) != str(pipeline_id):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That stage isn't in this pipeline")
    if owner_id and not await conn.fetchval("select 1 from users where id = $1 and status = 'active'", owner_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")


# ── Public side ─────────────────────────────────────────────────────────────
async def resolve(public_id: str) -> asyncpg.Record:
    """The active form for a public id, with its tenant; 404 otherwise."""
    async with db.owner_conn() as oc:
        row: asyncpg.Record | None = await oc.fetchrow(
            """select f.id, f.tenant_id from crm_web_forms f
                 join tenants t on t.id = f.tenant_id
                 join entitlements e on e.tenant_id = f.tenant_id and e.section_key = 'crm' and e.enabled
                where f.public_id = $1 and f.active and t.status = 'active'""", public_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This form isn't available.")
    return row


async def describe(conn: asyncpg.Connection, form_id: Any) -> WebFormPublic:
    f = await conn.fetchrow(
        "select public_id, name, title, intro, fields, consent_label from crm_web_forms where id = $1", form_id)
    business = await conn.fetchval(
        """select coalesce(nullif(c.legal_name, ''), t.name) from tenants t
             left join tenant_company c on c.tenant_id = t.id
            where t.id = current_setting('app.tenant_id')::uuid""")
    return WebFormPublic(title=f["title"] or f["name"], intro=f["intro"], fields=list(f["fields"]),
                         business_name=business or "", ticket=ticket(f["public_id"]),
                         consent_label=f["consent_label"] or None)


def _clean(v: WebFormValues, asked: list[str]) -> dict[str, str]:
    """The values the form asks for, trimmed; 422 for what a person must fix."""
    name = v.name.strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Please enter your name")
    got = {k: getattr(v, k).strip() if k in asked else "" for k in ("phone", "email", "company", "city", "message")}
    phone = normalize_phone(got["phone"]) if got["phone"] else ""
    if got["phone"] and not phone:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Please check the phone number")
    email = normalize_email(got["email"]) if got["email"] else ""
    if got["email"] and not email:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Please check the email address")
    if not phone and not email:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Please give a phone number or an email")
    return {**got, "name": name, "phone": phone or "", "email": email or ""}


async def submit(conn: asyncpg.Connection, tenant_id: str, form_id: Any, v: WebFormValues, ip: str = "") -> str:
    """Make (or merge) the lead; returns the thank-you text."""
    form = await conn.fetchrow("select * from crm_web_forms where id = $1 for update", form_id)
    thanks: str = form["thank_you"] or THANK_YOU
    values = _clean(v, list(form["fields"]))
    today = await conn.fetchval(
        "select count(*) from crm_leads where web_form_id = $1 and created_at >= date_trunc('day', now())", form_id)
    if today >= form["daily_cap"]:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "We've had a lot of messages today. Please call or try again tomorrow.")
    utm = {k: getattr(v, k).strip() or None for k in ("utm_source", "utm_medium", "utm_campaign")}
    # The tick counts only when the form asked, and is kept with its wording.
    ticked = bool(form["consent_label"]) and v.consent

    existing = await conn.fetchrow(
        """select * from crm_leads where status = 'open'
              and (($1 <> '' and phone = $1) or ($2 <> '' and lower(email) = $2))
            order by created_at desc limit 1""", values["phone"], values["email"])
    if existing is not None:
        await _repeat(conn, existing, form, values)
        if ticked:
            await conn.execute(
                """update crm_leads set consent_at = now(), consent_ip = $2, consent_text = $3
                    where id = $1 and consent_at is null""", existing["id"], ip[:64], form["consent_label"])
        return thanks

    pid = form["pipeline_id"] or await pipelines.ensure_default(conn, tenant_id)
    stage = await conn.fetchrow(
        """select id, is_won, default_probability from crm_stages
            where ($2::uuid is null and pipeline_id = $1) or id = $2 order by position limit 1""",
        pid, form["stage_id"])
    owner, why = await _owner(conn, form, values["city"])
    row = await conn.fetchrow(
        """insert into crm_leads (tenant_id, pipeline_id, stage_id, owner_id, name, company, phone, email, source,
                                  value_minor, score, status, won_at, probability, stage_entered_at, web_form_id,
                                  utm_source, utm_medium, utm_campaign, message, consent_at, consent_ip, consent_text,
                                  city)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11, case when $11 = 'won' then now() end, $12, now(), $13,
                   $14, $15, $16, $17, case when $18 then now() end, case when $18 then $19 end,
                   case when $18 then $20 end, $21)
           returning *""",
        tenant_id, pid, stage["id"], owner, values["name"], values["company"], values["phone"], values["email"],
        form["source"], scoring.score_lead(source=form["source"], company=values["company"], phone=values["phone"],
                                           email=values["email"], value_minor=0),
        "won" if stage["is_won"] else "open", 100 if stage["is_won"] else stage["default_probability"], form_id,
        utm["utm_source"], utm["utm_medium"], utm["utm_campaign"], values["message"] or None,
        ticked, ip[:64], form["consent_label"], values["city"] or None)
    lead_id = str(row["id"])
    await timeline.record(conn, entity_type="lead", entity_id=lead_id, kind="system",
                          body=f"From the web form “{form['name']}”. {why}",
                          payload={"event": "created", "source": form["source"], "web_form_id": str(form_id)})
    if values["message"]:
        await timeline.record(conn, entity_type="lead", entity_id=lead_id, kind="note", body=values["message"])
    if owner:
        await notifications.create(conn, user_id=owner, title="New web enquiry",
                                   body=f"{values['name']} via {form['name']}", kind="info", link="/crm")
        await wf.emit(conn, owner, "lead.created", leads.event_payload(row))
    return thanks


async def _repeat(conn: asyncpg.Connection, lead: asyncpg.Record, form: asyncpg.Record,
                  values: dict[str, str]) -> None:
    """A second message from someone with an open lead: note it there and ask
    the owner to follow up. The lead itself is not edited by public input."""
    lead_id = str(lead["id"])
    text = values["message"] or "(no message)"
    await timeline.record(conn, entity_type="lead", entity_id=lead_id, kind="note",
                          body=f"New enquiry from the web form “{form['name']}” ({values['name']}): {text}")
    owner = str(lead["owner_id"]) if lead["owner_id"] else None
    typ = await activities.type_by_code_or_name(conn, "call")
    if typ is not None and owner:
        await activities.create(conn, entity_type="lead", entity_id=lead_id, type_id=str(typ["id"]),
                                due_date=await sequences.local_date(conn, None), created_by=owner,
                                assigned_to=owner, summary="New enquiry from the web form: follow up",
                                automated=True)
    await conn.execute("update crm_leads set updated_at = now() where id = $1", lead["id"])


# ── Assignment (C13) ────────────────────────────────────────────────────────
def _same(a: str | None, b: str | None) -> bool:
    return (a or "").strip().lower() == (b or "").strip().lower()


async def _owner(conn: asyncpg.Connection, form: asyncpg.Record, city: str) -> tuple[str | None, str]:
    """Who takes the lead, and why (for the timeline): the form's own owner,
    else the first rule matching its source and/or city that has someone
    free, else the whole pool, else the business owner."""
    if form["owner_id"]:
        return str(form["owner_id"]), "Owner set on the form."
    for rule in await conn.fetch("select * from crm_assignment_rules order by position, id"):
        if rule["source"] is not None and not _same(rule["source"], form["source"]):
            continue
        if rule["city"] is not None and not _same(rule["city"], city):
            continue
        picked = await take_turn(conn, only=list(rule["user_ids"]))
        if picked:
            return picked, f"Assigned in turn by the rule “{rule['name']}”."
    picked = await take_turn(conn)
    if picked:
        return picked, "Assigned in turn from the lead pool."
    fallback = await conn.fetchval(
        """select u.id from users u join roles r on r.id = u.role_id
            where u.status = 'active' and r.name = 'Owner' order by u.created_at limit 1""")
    return (str(fallback) if fallback else None), "Nobody in the lead pool: assigned to the owner."


async def take_turn(conn: asyncpg.Connection, only: list[Any] | None = None) -> str | None:
    """The next pool member in turn (among `only`, when given), or None. The
    rows are locked, so two leads arriving together go to two people."""
    today: dt.date = await sequences.local_date(conn, None)
    rows = await conn.fetch(
        """select p.user_id, p.daily_cap,
                  case when p.assigned_day = $1 then p.assigned_today else 0 end as taken
             from crm_assignment_pool p
             join users u on u.id = p.user_id and u.status = 'active'
            where p.active and ($2::uuid[] is null or p.user_id = any($2::uuid[]))
              and not exists (
                  select 1 from hrms_employees e
                    join hrms_leave_requests lr on lr.employee_id = e.id
                   where e.user_id = p.user_id and lr.status = 'approved'
                     and $1 between lr.from_date and lr.to_date)
            order by p.last_assigned_at nulls first, p.user_id
            for update of p""", today, only)
    for r in rows:
        if r["daily_cap"] is None or r["taken"] < r["daily_cap"]:
            await conn.execute(
                """update crm_assignment_pool set last_assigned_at = clock_timestamp(), assigned_day = $2,
                          assigned_today = case when assigned_day = $2 then assigned_today + 1 else 1 end
                    where user_id = $1""", r["user_id"], today)
            return str(r["user_id"])
    return None
