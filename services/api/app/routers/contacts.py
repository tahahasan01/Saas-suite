"""Contacts (D-30): the people and companies CRM, POS and invoicing share.

Guarded by the `contacts.*` keys (riding on the `crm` grant until the module
registry lands). The till needs two things without CRM: find a customer by
phone and add a new one, so lookup and create also accept `pos.sale.create`.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from .. import audit, contacts, contacts_backfill, db, rbac, refs
from ..deps import AuthContext, current_auth
from ..models import (
    AddressCreate,
    AddressOut,
    AddressUpdate,
    BackfillReport,
    ContactBrief,
    ContactCreate,
    ContactDeal,
    ContactDetail,
    ContactDuplicates,
    ContactKind,
    ContactLookup,
    ContactNoteCreate,
    ContactOut,
    ContactRole,
    ContactSale,
    ContactStats,
    ContactUpdate,
    LeadContact,
    QualifyRequest,
    ReviewItem,
    TagCreate,
    TagOut,
    TagUpdate,
    TimelineItem,
)
from ..phone import normalize_phone
from ..rbac import perm

router = APIRouter(tags=["contacts"])


def any_key(*keys: str) -> Callable[..., Awaitable[AuthContext]]:
    """Guard passing when the caller holds any one of `keys` (each with its
    module switched on, exactly as /auth/me reports them)."""
    for key in keys:
        rbac.PERMISSIONS[key]  # an undeclared key fails at import

    async def guard(auth: AuthContext = Depends(current_auth)) -> AuthContext:
        async with db.tenant_conn(auth.tenant_id) as conn:
            held = await rbac.effective_permissions(conn, auth.tenant_id, auth.role_id)
        if not any(k in held for k in keys):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires " + " or ".join(keys))
        return auth

    return guard


def all_keys(*keys: str) -> Callable[..., Awaitable[AuthContext]]:
    """Guard passing only when the caller holds every one of `keys`."""
    for key in keys:
        rbac.PERMISSIONS[key]

    async def guard(auth: AuthContext = Depends(current_auth)) -> AuthContext:
        async with db.tenant_conn(auth.tenant_id) as conn:
            held = await rbac.effective_permissions(conn, auth.tenant_id, auth.role_id)
        missing = [k for k in keys if k not in held]
        if missing:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires " + ", ".join(missing))
        return auth

    return guard


READ = perm("contacts.contact.read")
UPDATE = perm("contacts.contact.update")
CREATE_OR_TILL = any_key("contacts.contact.create", "pos.sale.create")
LOOKUP = any_key("contacts.contact.read", "pos.sale.create")


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def _get_live(conn: asyncpg.Connection, contact_id: str) -> asyncpg.Record:
    row = await conn.fetchrow("select * from contacts where id = $1", contact_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    if row["merged_into_id"] is not None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            {"message": "This contact was merged into another", "merged_into_id": str(row["merged_into_id"])})
    return row


async def _check_company(conn: asyncpg.Connection, kind: str, company_id: Any) -> None:
    if company_id is None:
        return
    if kind != "person":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A company can't belong to another company")
    parent = await conn.fetchrow("select kind, merged_into_id from contacts where id = $1", company_id)
    if parent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    if parent["kind"] != "company":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A contact can only belong to a company")
    if parent["merged_into_id"] is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That company was merged into another")


async def _set_tags(conn: asyncpg.Connection, tenant_id: str, contact_id: Any, tag_ids: list[Any]) -> None:
    ids = list(dict.fromkeys(tag_ids))
    if ids and await conn.fetchval("select count(*) from tags where id = any($1::uuid[])", ids) != len(ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    await conn.execute("delete from record_tags where entity_type = 'contact' and entity_id = $1", contact_id)
    for tid in ids:
        await conn.execute(
            "insert into record_tags (tenant_id, tag_id, entity_type, entity_id) values ($1, $2, 'contact', $3)",
            tenant_id, tid, contact_id)


# ── List, lookup, create ────────────────────────────────────────────────────
_LIST_WHERE = """($1::bool or c.archived_at is null)
  and ($2::text is null or c.kind = $2)
  and ($3::text is null or $3 = any(c.roles))
  and ($4::uuid is null or exists (select 1 from record_tags rt where rt.entity_type = 'contact'
                                     and rt.entity_id = c.id and rt.tag_id = $4))
  and ($5::uuid is null or c.owner_id = $5)
  and ($6::text is null or c.name ilike '%' || $6 || '%' or c.email_normalized like '%' || lower($6) || '%'
       or c.ntn = $6 or c.phone_raw like '%' || $6 || '%' or c.phone_e164 = $7)"""


@router.get("/contacts", response_model=list[ContactOut])
async def list_contacts(response: Response, q: str | None = None, kind: ContactKind | None = None,
                        role: ContactRole | None = None, tag: str | None = None, owner: str | None = None,
                        include_archived: bool = False,
                        limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                        auth: AuthContext = Depends(READ)) -> list[ContactOut]:
    """One page; `X-Total-Count` is how many match. A phone typed in any
    format matches its E.164 key."""
    term = q.strip() if q else None
    like = _escape_like(term) if term else None
    phone_key = normalize_phone(term) if term else None
    args = (include_archived, kind, role, tag, owner, like, phone_key)
    async with db.tenant_conn(auth.tenant_id) as conn:
        total = await conn.fetchval(f"select count(*) from contacts c where {_LIST_WHERE}", *args)
        rows = await conn.fetch(
            contacts.SELECT + f" where {_LIST_WHERE} order by c.archived_at nulls first, c.name, c.id"
            " limit $8 offset $9", *args, limit, offset)
        tags = await contacts.tags_by_contact(conn, [r["id"] for r in rows])
    response.headers["X-Total-Count"] = str(total)
    return [contacts.out(r, tags.get(str(r["id"]), [])) for r in rows]


@router.get("/contacts/lookup", response_model=ContactLookup)
async def lookup(phone: str, auth: AuthContext = Depends(LOOKUP)) -> ContactLookup:
    """Exact E.164 lookup for the till (and the WhatsApp inbox later). Every
    live holder comes back: a shared number is the cashier's pick, never an
    automatic match."""
    key = normalize_phone(phone)
    if key is None:
        return ContactLookup(phone_e164=None, shared=False, matches=[])
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            contacts.SELECT + """ where c.phone_e164 = $1 and c.archived_at is null
                                  order by c.updated_at desc limit $2""",
            key, contacts.SHARED_THRESHOLD + 1)
        shared = await contacts.is_shared(conn, "phone_e164", key)
    return ContactLookup(phone_e164=key, shared=shared, matches=[contacts.brief(r) for r in rows])


@router.post("/contacts", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
async def create_contact(body: ContactCreate, auth: AuthContext = Depends(CREATE_OR_TILL)) -> ContactOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _check_company(conn, body.kind, body.company_id)
        await refs.ensure_visible(conn, "users", body.owner_id)
        if not body.force:
            phone_e164, email_normalized = contacts.keys_for(body.phone, body.email)
            dups, shared = await contacts.find_duplicates(
                conn, phone_e164=phone_e164, email_normalized=email_normalized, ntn=body.ntn)
            if dups:
                raise HTTPException(status.HTTP_409_CONFLICT, detail={
                    "message": "Possible duplicate", "duplicates": [d.model_dump() for d in dups],
                    "shared_keys": shared})
        row = await contacts.insert(
            conn, auth.tenant_id, name=body.name, kind=body.kind, company_id=body.company_id,
            company_name=body.company_name, job_title=body.job_title, phone=body.phone, email=body.email,
            ntn=body.ntn, strn=body.strn, city=body.city, roles=list(body.roles), source=body.source,
            notes=body.notes, owner_id=body.owner_id or auth.user_id)
        if body.tag_ids:
            await _set_tags(conn, auth.tenant_id, row["id"], body.tag_ids)
        created = await contacts.fetch_out(conn, row["id"])
    assert created is not None
    return created


# Fixed paths before /contacts/{contact_id}, which would swallow them.
@router.get("/contacts/review", response_model=list[ReviewItem])
async def review_queue(auth: AuthContext = Depends(all_keys("contacts.contact.read", "crm.lead.read"))
                       ) -> list[ReviewItem]:
    """Open items, each with the contacts holding the clashing key."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        items = await conn.fetch(
            """select q.*, l.name as lead_name, l.phone as lead_phone, l.email as lead_email
                 from contact_review_items q join crm_leads l on l.id = q.lead_id
                where q.status = 'open' order by q.created_at, q.id limit 500""")
        keys = list({i["match_key"] for i in items if i["match_key"]})
        holders = await conn.fetch(
            contacts.SELECT + """ where (c.phone_e164 = any($1::text[]) or c.email_normalized = any($1::text[]))
                                    and c.merged_into_id is null order by c.created_at""", keys)
    by_key: dict[str, list[ContactBrief]] = {}
    for h in holders:
        for key in {h["phone_e164"], h["email_normalized"]} - {None}:
            by_key.setdefault(key, []).append(contacts.brief(h))
    return [ReviewItem(id=str(i["id"]), lead_id=str(i["lead_id"]), lead_name=i["lead_name"],
                       lead_phone=i["lead_phone"], lead_email=i["lead_email"], reason=i["reason"],
                       match_key=i["match_key"], candidates=by_key.get(i["match_key"], [])[:10],
                       created_at=i["created_at"]) for i in items]


# ── One contact ─────────────────────────────────────────────────────────────
async def _addresses(conn: asyncpg.Connection, contact_id: Any) -> list[AddressOut]:
    rows = await conn.fetch(
        "select * from contact_addresses where contact_id = $1 order by is_default desc, created_at", contact_id)
    return [AddressOut(id=str(r["id"]), kind=r["kind"], line1=r["line1"], line2=r["line2"], city=r["city"],
                       province=r["province"], postal_code=r["postal_code"], is_default=r["is_default"])
            for r in rows]


@router.get("/contacts/{contact_id}", response_model=ContactDetail)
async def get_contact(contact_id: str, auth: AuthContext = Depends(READ)) -> ContactDetail:
    """Contact 360: the record, its company or people, addresses, and what
    the other modules hold for it."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        contact = await contacts.fetch_out(conn, contact_id)
        if contact is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
        company: ContactBrief | None = None
        if contact.company_id:
            crow = await conn.fetchrow(contacts.SELECT + " where c.id = $1", contact.company_id)
            company = contacts.brief(crow) if crow else None
        people = await conn.fetch(
            contacts.SELECT + " where c.company_id = $1 and c.merged_into_id is null order by c.name", contact_id)
        addresses = await _addresses(conn, contact_id)
        related = await _related(conn, contact_id)
    return ContactDetail(contact=contact, company=company, people=[contacts.brief(p) for p in people],
                         addresses=addresses, **related)


async def _related(conn: asyncpg.Connection, contact_id: str) -> dict[str, Any]:
    """What CRM and POS hold for this contact: its deals, its sales, and the
    figures for the KPI strip (St02 §6.2). Activities come from CRM later."""
    deals = await conn.fetch(
        """select l.id, l.name, l.value_minor, l.created_at, s.name as stage, s.kind as stage_kind
             from crm_leads l join crm_stages s on s.id = l.stage_id
            where l.contact_id = $1 order by l.created_at desc limit 50""", contact_id)
    sales = await conn.fetch(
        """select id, total_minor, item_count, payment_method, created_at from pos_sales
            where contact_id = $1 order by created_at desc limit 50""", contact_id)
    totals = await conn.fetchrow(
        """select count(*) as n, coalesce(sum(total_minor), 0) as spend, max(created_at) as last_at
             from pos_sales where contact_id = $1""", contact_id)
    lead_totals = await conn.fetchrow(
        """select count(*) filter (where s.kind = 'active') as open,
                  coalesce(sum(l.value_minor) filter (where s.kind = 'won'), 0) as won
             from crm_leads l join crm_stages s on s.id = l.stage_id where l.contact_id = $1""", contact_id)
    return {
        "stats": ContactStats(open_deals=lead_totals["open"], won_value_minor=lead_totals["won"],
                              sales_count=totals["n"], lifetime_spend_minor=totals["spend"],
                              last_visit_at=totals["last_at"], invoiced_minor=0),
        "deals": [ContactDeal(id=str(d["id"]), name=d["name"], stage=d["stage"], stage_kind=d["stage_kind"],
                              value_minor=d["value_minor"], created_at=d["created_at"]) for d in deals],
        "sales": [ContactSale(id=str(s["id"]), total_minor=s["total_minor"], item_count=s["item_count"],
                              payment_method=s["payment_method"], created_at=s["created_at"]) for s in sales],
        "invoices": [],
    }


@router.patch("/contacts/{contact_id}", response_model=ContactOut)
async def update_contact(contact_id: str, body: ContactUpdate, auth: AuthContext = Depends(UPDATE)) -> ContactOut:
    given = body.model_fields_set
    async with db.tenant_conn(auth.tenant_id) as conn:
        cur = await _get_live(conn, contact_id)
        kind = body.kind or cur["kind"]
        company_id = body.company_id if "company_id" in given else cur["company_id"]
        if kind == "person" and cur["kind"] == "company" and await conn.fetchval(
                "select 1 from contacts where company_id = $1 and merged_into_id is null limit 1", contact_id):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "This company still has people; move them before making it a person")
        if "company_id" in given or "kind" in given:
            await _check_company(conn, kind, company_id)
        if "owner_id" in given:
            await refs.ensure_visible(conn, "users", body.owner_id)
        cols: dict[str, Any] = {}
        for field in ("kind", "name", "company_name", "job_title", "ntn", "strn", "city", "source", "notes"):
            value = getattr(body, field)
            if field in given and value is not None:
                cols[field] = value.strip() if isinstance(value, str) else value
        if "company_id" in given:
            cols["company_id"] = body.company_id
        if "owner_id" in given:
            cols["owner_id"] = body.owner_id
        if body.roles is not None:
            cols["roles"] = sorted(set(body.roles))
        if body.phone is not None:
            cols["phone_raw"] = body.phone.strip()
            cols["phone_e164"] = normalize_phone(body.phone)
        if body.email is not None:
            cols["email"] = body.email.strip()
            cols["email_normalized"] = contacts.keys_for(None, body.email)[1]
        if cols:
            sets = ", ".join(f"{k} = ${i}" for i, k in enumerate(cols, start=2))
            await conn.execute(f"update contacts set {sets}, updated_at = now() where id = $1",
                               contact_id, *cols.values())
        if body.tag_ids is not None:
            await _set_tags(conn, auth.tenant_id, contact_id, body.tag_ids)
        updated = await contacts.fetch_out(conn, contact_id)
    assert updated is not None
    return updated


@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_contact(contact_id: str, auth: AuthContext = Depends(perm("contacts.contact.archive"))) -> Response:
    """Archive, never delete: sales, invoices and old receipts keep pointing here."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _get_live(conn, contact_id)
        await conn.execute(
            "update contacts set archived_at = coalesce(archived_at, now()), updated_at = now() where id = $1",
            contact_id)
        await audit.track(conn, entity_type="contact", entity_id=contact_id, contact_id=contact_id,
                          kind="system", body="Archived")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/contacts/{contact_id}/restore", response_model=ContactOut)
async def restore_contact(contact_id: str, auth: AuthContext = Depends(perm("contacts.contact.archive"))) -> ContactOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _get_live(conn, contact_id)
        await conn.execute("update contacts set archived_at = null, updated_at = now() where id = $1", contact_id)
        await audit.track(conn, entity_type="contact", entity_id=contact_id, contact_id=contact_id,
                          kind="restored", body="Restored")
        restored = await contacts.fetch_out(conn, contact_id)
    assert restored is not None
    return restored


@router.get("/contacts/{contact_id}/duplicates", response_model=ContactDuplicates)
async def contact_duplicates(contact_id: str, auth: AuthContext = Depends(READ)) -> ContactDuplicates:
    """Other contacts holding this one's phone, email or NTN (archived ones
    too); keys shared by more than the threshold are listed, not matched."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow("select * from contacts where id = $1", contact_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
        dups, shared = await contacts.find_duplicates(
            conn, phone_e164=row["phone_e164"], email_normalized=row["email_normalized"], ntn=row["ntn"],
            exclude=[row["id"]])
    return ContactDuplicates(duplicates=dups, shared_keys=shared)


# ── Timeline ────────────────────────────────────────────────────────────────
@router.get("/contacts/{contact_id}/timeline", response_model=list[TimelineItem])
async def contact_timeline(contact_id: str, limit: int = Query(100, ge=1, le=500),
                           auth: AuthContext = Depends(READ)) -> list[TimelineItem]:
    """Everything that happened to this contact or to a record rolled up to
    it, newest first. Contacts merged into this one bring their history: the
    timeline is append-only, so reads follow merged_into_id instead of
    rewriting old events (contact_merge registry, strategy "follow")."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("select 1 from contacts where id = $1", contact_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
        rows = await conn.fetch(
            """with chain as (select $1::uuid as id union select id from contacts where merged_into_id = $1)
               select e.*, u.name as actor_name from timeline_events e
                 left join users u on u.id = e.actor_id
                where e.contact_id in (select id from chain)
                   or (e.entity_type = 'contact' and e.entity_id in (select id from chain))
                order by e.occurred_at desc, e.id desc limit $2""", contact_id, limit)
    return [TimelineItem(id=str(r["id"]), entity_type=r["entity_type"], entity_id=str(r["entity_id"]),
                         kind=r["kind"], body=r["body"], changes=r["changes"],
                         actor_id=str(r["actor_id"]) if r["actor_id"] else None, actor_name=r["actor_name"],
                         occurred_at=r["occurred_at"]) for r in rows]


@router.post("/contacts/{contact_id}/notes", status_code=status.HTTP_201_CREATED)
async def add_note(contact_id: str, body: ContactNoteCreate, auth: AuthContext = Depends(UPDATE)) -> dict[str, bool]:
    note = body.body.strip()
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _get_live(conn, contact_id)
        await audit.track(conn, entity_type="contact", entity_id=contact_id, contact_id=contact_id,
                          kind="note", body=note)
    return {"ok": True}


# ── Addresses ───────────────────────────────────────────────────────────────
async def _unset_other_defaults(conn: asyncpg.Connection, contact_id: str, keep: Any) -> None:
    await conn.execute(
        "update contact_addresses set is_default = false where contact_id = $1 and id <> $2 and is_default",
        contact_id, keep)


@router.post("/contacts/{contact_id}/addresses", response_model=AddressOut, status_code=status.HTTP_201_CREATED)
async def add_address(contact_id: str, body: AddressCreate, auth: AuthContext = Depends(UPDATE)) -> AddressOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _get_live(conn, contact_id)
        aid = await conn.fetchval(
            """insert into contact_addresses (tenant_id, contact_id, kind, line1, line2, city, province,
                                              postal_code, is_default)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id""",
            auth.tenant_id, contact_id, body.kind, body.line1.strip(), body.line2.strip(), body.city.strip(),
            body.province.strip(), body.postal_code.strip(), body.is_default)
        if body.is_default:
            await _unset_other_defaults(conn, contact_id, aid)
        found = [a for a in await _addresses(conn, contact_id) if a.id == str(aid)]
    return found[0]


@router.patch("/contacts/{contact_id}/addresses/{address_id}", response_model=AddressOut)
async def update_address(contact_id: str, address_id: str, body: AddressUpdate,
                         auth: AuthContext = Depends(UPDATE)) -> AddressOut:
    cols = {k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump(exclude_none=True).items()}
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _get_live(conn, contact_id)
        if not await conn.fetchval(
                "select 1 from contact_addresses where id = $1 and contact_id = $2", address_id, contact_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Address not found")
        if cols:
            sets = ", ".join(f"{k} = ${i}" for i, k in enumerate(cols, start=2))
            await conn.execute(f"update contact_addresses set {sets} where id = $1", address_id, *cols.values())
        if cols.get("is_default"):
            await _unset_other_defaults(conn, contact_id, address_id)
        found = [a for a in await _addresses(conn, contact_id) if a.id == address_id]
    return found[0]


@router.delete("/contacts/{contact_id}/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(contact_id: str, address_id: str, auth: AuthContext = Depends(UPDATE)) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _get_live(conn, contact_id)
        done = await conn.execute(
            "delete from contact_addresses where id = $1 and contact_id = $2", address_id, contact_id)
    if done == "DELETE 0":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Address not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Tags ────────────────────────────────────────────────────────────────────
@router.get("/tags", response_model=list[TagOut])
async def list_tags(auth: AuthContext = Depends(READ)) -> list[TagOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select id, name, color from tags order by lower(name)")
    return [TagOut(id=str(r["id"]), name=r["name"], color=r["color"]) for r in rows]


@router.post("/tags", response_model=TagOut, status_code=status.HTTP_201_CREATED)
async def create_tag(body: TagCreate, auth: AuthContext = Depends(perm("contacts.tag.manage"))) -> TagOut:
    try:
        async with db.tenant_conn(auth.tenant_id) as conn:
            row = await conn.fetchrow(
                "insert into tags (tenant_id, name, color) values ($1, $2, $3) returning id, name, color",
                auth.tenant_id, body.name.strip(), body.color)
    except asyncpg.UniqueViolationError:
        raise HTTPException(status.HTTP_409_CONFLICT, "A tag with that name already exists")
    return TagOut(id=str(row["id"]), name=row["name"], color=row["color"])


@router.patch("/tags/{tag_id}", response_model=TagOut)
async def update_tag(tag_id: str, body: TagUpdate, auth: AuthContext = Depends(perm("contacts.tag.manage"))) -> TagOut:
    cols = {k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump(exclude_none=True).items()}
    try:
        async with db.tenant_conn(auth.tenant_id) as conn:
            if cols:
                sets = ", ".join(f"{k} = ${i}" for i, k in enumerate(cols, start=2))
                await conn.execute(f"update tags set {sets} where id = $1", tag_id, *cols.values())
            row = await conn.fetchrow("select id, name, color from tags where id = $1", tag_id)
    except asyncpg.UniqueViolationError:
        raise HTTPException(status.HTTP_409_CONFLICT, "A tag with that name already exists")
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    return TagOut(id=str(row["id"]), name=row["name"], color=row["color"])


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(tag_id: str, auth: AuthContext = Depends(perm("contacts.tag.manage"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        done = await conn.execute("delete from tags where id = $1", tag_id)
    if done == "DELETE 0":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Leads: Qualify (D-31) ───────────────────────────────────────────────────
# Lives here rather than in routers/crm.py: it is the contacts side of the
# lead, and it leaves the CRM router free to change shape.
@router.get("/crm/leads/{lead_id}/contact", response_model=ContactOut | None)
async def lead_contact(lead_id: str, auth: AuthContext = Depends(perm("crm.lead.read"))) -> ContactOut | None:
    """The contact a lead is qualified to, or null."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        lead = await conn.fetchrow("select contact_id from crm_leads where id = $1", lead_id)
        if lead is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
        if lead["contact_id"] is None:
            return None
        return await contacts.fetch_out(conn, lead["contact_id"])


async def _find_or_create_company(conn: asyncpg.Connection, tenant_id: str, name: str, owner_id: Any) -> Any:
    name = name.strip()
    found = await conn.fetchval(
        """select id from contacts where kind = 'company' and lower(name) = lower($1)
              and merged_into_id is null order by archived_at nulls first, created_at limit 1""", name)
    if found:
        return found
    row = await contacts.insert(conn, tenant_id, name=name, kind="company", owner_id=owner_id)
    return row["id"]


@router.post("/crm/leads/{lead_id}/qualify", response_model=LeadContact)
async def qualify_lead(lead_id: str, body: QualifyRequest,
                       auth: AuthContext = Depends(all_keys("crm.lead.update", "contacts.contact.create"))
                       ) -> LeadContact:
    """Link the lead to a contact, or create the contact from the lead. A
    create that finds a contact with the same phone or email answers 409
    with them, so the user links instead of duplicating (unless `force`)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        lead = await conn.fetchrow("select * from crm_leads where id = $1 for update", lead_id)
        if lead is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
        if body.mode == "link":
            if body.contact_id is None:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose the contact to link")
            target = await _get_live(conn, str(body.contact_id))
            contact_id = target["id"]
            note = f"Qualified: linked to {target['name']}"
        else:
            if lead["contact_id"] is not None:
                raise HTTPException(status.HTTP_409_CONFLICT, "This lead is already linked to a contact")
            if not body.force:
                phone_e164, email_normalized = contacts.keys_for(lead["phone"], lead["email"])
                dups, shared = await contacts.find_duplicates(
                    conn, phone_e164=phone_e164, email_normalized=email_normalized, ntn=None)
                if dups:
                    raise HTTPException(status.HTTP_409_CONFLICT, detail={
                        "message": "A contact with this phone or email already exists",
                        "duplicates": [d.model_dump() for d in dups], "shared_keys": shared})
            company_id = body.company_id
            if company_id is not None:
                await _check_company(conn, "person", company_id)
            elif body.create_company and lead["company"].strip():
                company_id = await _find_or_create_company(conn, auth.tenant_id, lead["company"], lead["owner_id"])
            row = await contacts.insert(
                conn, auth.tenant_id, name=lead["name"], company_id=company_id, company_name=lead["company"],
                phone=lead["phone"], email=lead["email"], source=lead["source"],
                owner_id=lead["owner_id"] or auth.user_id)
            contact_id = row["id"]
            note = "Qualified: contact created"
        await contacts_backfill.link_lead(conn, lead_id, contact_id, body=note)
        await conn.execute(
            """update contact_review_items set status = 'resolved', resolved_contact_id = $2,
                      resolved_by = $3, resolved_at = now()
                where lead_id = $1 and status = 'open'""", lead_id, contact_id, auth.user_id)
        contact = await contacts.fetch_out(conn, contact_id)
    assert contact is not None
    return LeadContact(lead_id=lead_id, contact=contact)


# ── Backfill and its review queue (docs §7.1) ───────────────────────────────
@router.post("/contacts/backfill", response_model=BackfillReport)
async def run_backfill(auth: AuthContext = Depends(perm("contacts.contact.merge"))) -> BackfillReport:
    """Create contacts for this tenant's leads (option b). Safe to rerun."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        report = await contacts_backfill.backfill(conn, auth.tenant_id)
        await audit.event(conn, "contacts.backfill", "contacts", data=report.model_dump())
    return report


@router.post("/contacts/review/{item_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_review(item_id: str, auth: AuthContext = Depends(perm("crm.lead.update"))) -> Response:
    """Leave the lead without a contact; the backfill won't queue it again."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        done = await conn.execute(
            """update contact_review_items set status = 'dismissed', resolved_by = $2, resolved_at = now()
                where id = $1 and status = 'open'""", item_id, auth.user_id)
    if done == "UPDATE 0":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review item not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
