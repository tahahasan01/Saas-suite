"""Contacts: the pieces shared by the contacts router, Qualify, the leads
backfill and merge (D-30, D-33, St02 §6.2 and §6.6).

Matching keys are signals, not identities. A phone, email or NTN held by more
than SHARED_THRESHOLD contacts (a shop landline, a family number, a school
parent) is "shared": it is reported but never used to match, so it can't
attach a sale or a chat to the wrong person (St02 risk 3).
"""
from __future__ import annotations

from typing import Any

import asyncpg

from . import audit
from .models import ContactBrief, ContactDuplicate, ContactOut, DuplicateReason, TagOut
from .phone import normalize_email, normalize_phone

SHARED_THRESHOLD = 5

# The person under a company reads its tax numbers through (no copy-sync).
SELECT = """select c.*, co.name as linked_company_name, co.ntn as company_ntn
              from contacts c left join contacts co on co.id = c.company_id"""

_KEYS: tuple[tuple[DuplicateReason, str], ...] = (
    ("phone", "phone_e164"), ("email", "email_normalized"), ("ntn", "ntn"))


def keys_for(phone: str | None, email: str | None) -> tuple[str | None, str | None]:
    return normalize_phone(phone), normalize_email(email)


def out(row: asyncpg.Record, tags: list[TagOut] | None = None) -> ContactOut:
    company_ntn = row["company_ntn"] or ""
    return ContactOut(
        id=str(row["id"]), kind=row["kind"], name=row["name"],
        company_id=str(row["company_id"]) if row["company_id"] else None,
        company_name=row["linked_company_name"] or row["company_name"],
        job_title=row["job_title"], phone=row["phone_raw"], phone_e164=row["phone_e164"],
        email=row["email"], ntn=row["ntn"], strn=row["strn"],
        effective_ntn=company_ntn or row["ntn"], city=row["city"], roles=list(row["roles"]),
        source=row["source"], notes=row["notes"],
        owner_id=str(row["owner_id"]) if row["owner_id"] else None, tags=tags or [],
        archived_at=row["archived_at"],
        merged_into_id=str(row["merged_into_id"]) if row["merged_into_id"] else None,
        created_at=row["created_at"], updated_at=row["updated_at"])


def brief(row: asyncpg.Record) -> ContactBrief:
    return ContactBrief(
        id=str(row["id"]), kind=row["kind"], name=row["name"], phone=row["phone_raw"],
        phone_e164=row["phone_e164"], email=row["email"],
        company_name=dict(row).get("linked_company_name") or row["company_name"],
        archived=row["archived_at"] is not None)


async def tags_by_contact(conn: asyncpg.Connection, ids: list[Any]) -> dict[str, list[TagOut]]:
    rows = await conn.fetch(
        """select rt.entity_id, t.id, t.name, t.color from record_tags rt join tags t on t.id = rt.tag_id
            where rt.entity_type = 'contact' and rt.entity_id = any($1::uuid[]) order by t.name""", ids)
    found: dict[str, list[TagOut]] = {}
    for r in rows:
        found.setdefault(str(r["entity_id"]), []).append(TagOut(id=str(r["id"]), name=r["name"], color=r["color"]))
    return found


async def fetch_out(conn: asyncpg.Connection, contact_id: Any) -> ContactOut | None:
    row = await conn.fetchrow(SELECT + " where c.id = $1", contact_id)
    if row is None:
        return None
    return out(row, (await tags_by_contact(conn, [row["id"]])).get(str(row["id"]), []))


async def is_shared(conn: asyncpg.Connection, column: str, value: str) -> bool:
    """Whether a key is held by more than SHARED_THRESHOLD live-or-archived
    contacts. Merged-away rows don't count: they point at the winner."""
    assert column in {c for _, c in _KEYS}  # never interpolate input
    n = await conn.fetchval(
        f"select count(*) from contacts where {column} = $1 and merged_into_id is null", value)
    return int(n) > SHARED_THRESHOLD


async def find_duplicates(conn: asyncpg.Connection, *, phone_e164: str | None, email_normalized: str | None,
                          ntn: str | None, exclude: list[Any] | None = None
                          ) -> tuple[list[ContactDuplicate], list[str]]:
    """Contacts that hold one of these keys, archived ones included (an
    archived customer coming back is the commonest duplicate). Returns the
    matches and the keys skipped for being shared."""
    found: dict[str, ContactDuplicate] = {}
    shared: list[str] = []
    values = {"phone_e164": phone_e164, "email_normalized": email_normalized, "ntn": (ntn or "").strip() or None}
    for reason, column in _KEYS:
        value = values[column]
        if not value:
            continue
        if await is_shared(conn, column, value):
            shared.append(value)
            continue
        rows = await conn.fetch(
            f"""select id, name, kind, phone_e164, email, ntn, archived_at from contacts
                 where {column} = $1 and merged_into_id is null and not (id = any($2::uuid[]))
                 order by archived_at nulls first, created_at limit 10""",
            value, exclude or [])
        for r in rows:
            found.setdefault(str(r["id"]), ContactDuplicate(
                id=str(r["id"]), name=r["name"], kind=r["kind"], phone_e164=r["phone_e164"],
                email=r["email"], ntn=r["ntn"], archived=r["archived_at"] is not None, reason=reason))
    return list(found.values()), shared


async def insert(conn: asyncpg.Connection, tenant_id: str, *, name: str, kind: str = "person",
                 company_id: Any = None, company_name: str = "", job_title: str = "", phone: str = "",
                 email: str = "", ntn: str = "", strn: str = "", city: str = "", roles: list[str] | None = None,
                 source: str = "", notes: str = "", owner_id: Any = None,
                 created_by_migration: bool = False) -> asyncpg.Record:
    """Insert one contact with its match keys computed, and note it on its
    timeline. Callers check references and duplicates first."""
    phone_e164, email_normalized = keys_for(phone, email)
    row = await conn.fetchrow(
        """insert into contacts (tenant_id, kind, company_id, name, company_name, job_title, phone_raw,
                                 phone_e164, email, email_normalized, ntn, strn, city, roles, source, notes,
                                 owner_id, created_by_migration)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning id""",
        tenant_id, kind, company_id, name.strip(), company_name.strip(), job_title.strip(), phone.strip(),
        phone_e164, email.strip(), email_normalized, ntn.strip(), strn.strip(), city.strip(),
        sorted(set(roles or [])), source, notes, owner_id, created_by_migration)
    await audit.track(conn, entity_type="contact", entity_id=str(row["id"]), contact_id=str(row["id"]),
                      kind="system", body="Contact created" + (" from a lead" if created_by_migration else ""))
    return row
