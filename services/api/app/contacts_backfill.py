"""Leads → contacts backfill (docs §7.1, St02 risk 1, option b).

A contact is made only for a lead worth keeping: one with a phone or an
email, or one that was won. Leads are matched on the normalised keys:

* the same key and the same name → the same contact (typed twice);
* the same key under a different name → review queue (a family or a shop
  sharing a number is not one person);
* a phone held by more than SHARED_THRESHOLD leads or contacts → review
  queue (a shop landline, a school's front desk), never auto-merged.

Idempotent: only leads without a contact that were never queued are looked
at, so a second run does nothing. Rows it creates carry
created_by_migration=true for the §7.1 rollback.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

import asyncpg

from . import audit, contacts
from .models import BackfillReport
from .phone import normalize_email, normalize_phone


def same_name(a: str, b: str) -> bool:
    """Case and spacing don't make two people."""
    return " ".join(a.casefold().split()) == " ".join(b.casefold().split())


async def _queue(conn: asyncpg.Connection, tenant_id: str, lead_id: Any, reason: str, key: str) -> None:
    await conn.execute(
        """insert into contact_review_items (tenant_id, lead_id, reason, match_key) values ($1, $2, $3, $4)
           on conflict (tenant_id, lead_id) do nothing""", tenant_id, lead_id, reason, key)


async def link_lead(conn: asyncpg.Connection, lead_id: Any, contact_id: Any, *, body: str | None = None) -> int:
    """Point a lead at a contact. With `body`, say so on the lead's timeline
    (rolled up to the contact): Qualify does, the bulk backfill doesn't, so
    a migration doesn't write an event on every old lead."""
    # updated_at stays: the lost-stage migration (§7.1) reads it as lost_at.
    await conn.execute("update crm_leads set contact_id = $2 where id = $1", lead_id, contact_id)
    # Requests raised on the lead before it had a contact now bill it (0061).
    moved = await conn.execute(
        "update crm_invoice_requests set contact_id = $2 where lead_id = $1 and contact_id is null",
        lead_id, contact_id)
    if body is not None:
        await audit.track(conn, entity_type="lead", entity_id=str(lead_id), contact_id=str(contact_id),
                          kind="system", body=body)
    return int(moved.split()[-1])


async def backfill(conn: asyncpg.Connection, tenant_id: str) -> BackfillReport:
    """Run for one tenant inside its tenant connection."""
    all_phones = Counter(
        key for key in (normalize_phone(r["phone"]) for r in await conn.fetch(
            "select phone from crm_leads where phone <> ''")) if key)
    leads = await conn.fetch(
        """select l.id, l.name, l.company, l.phone, l.email, l.source, l.owner_id, s.kind as stage_kind
             from crm_leads l join crm_stages s on s.id = l.stage_id
            where l.contact_id is null
              and not exists (select 1 from contact_review_items q where q.lead_id = l.id)
              and (l.phone <> '' or l.email <> '' or s.kind = 'won')
            order by l.created_at, l.id""")
    created = linked = queued = invalid = invoices = 0
    for lead in leads:
        phone_key, email_key = normalize_phone(lead["phone"]), normalize_email(lead["email"])
        if lead["phone"].strip() and phone_key is None:
            invalid += 1
        if phone_key and (all_phones[phone_key] > contacts.SHARED_THRESHOLD
                          or await contacts.is_shared(conn, "phone_e164", phone_key)):
            await _queue(conn, tenant_id, lead["id"], "shared_phone", phone_key)
            queued += 1
            continue
        match = None
        for column, key in (("phone_e164", phone_key), ("email_normalized", email_key)):
            if key is None or (column == "email_normalized" and await contacts.is_shared(conn, column, key)):
                continue
            match = await conn.fetchrow(
                f"""select id, name from contacts where {column} = $1 and merged_into_id is null
                     order by archived_at nulls first, created_at limit 1""", key)
            if match is not None:
                match_key = key
                break
        if match is not None:
            if not same_name(match["name"], lead["name"]):
                await _queue(conn, tenant_id, lead["id"], "name_mismatch", match_key)
                queued += 1
                continue
            contact_id = match["id"]
        else:
            row = await contacts.insert(
                conn, tenant_id, name=lead["name"], company_name=lead["company"], phone=lead["phone"],
                email=lead["email"], source=lead["source"], owner_id=lead["owner_id"],
                created_by_migration=True)
            contact_id = row["id"]
            created += 1
        invoices += await link_lead(conn, lead["id"], contact_id)
        linked += 1
    return BackfillReport(leads_seen=len(leads), contacts_created=created, leads_linked=linked,
                          queued=queued, invalid_phones=invalid, invoices_linked=invoices)
