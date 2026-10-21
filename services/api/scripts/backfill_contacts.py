"""Leads → contacts backfill for every tenant (docs §7.1, option b).

Run once after migrations 0059–0061, from services/api:
    ./.venv/Scripts/python -m scripts.backfill_contacts

Idempotent: a second run links nothing new. Each tenant runs in its own
tenant transaction as a job (audit rows read actor_kind 'job'), so one
tenant's failure leaves the others done. Prints counts only, never names.
"""
from __future__ import annotations

import asyncio
import sys

from app import contacts_backfill, db
from app.models import BackfillReport


async def backfill_all() -> dict[str, BackfillReport]:
    async with db.owner_conn() as conn:
        tenant_ids = [str(r["id"]) for r in await conn.fetch("select id from tenants order by created_at")]
    reports: dict[str, BackfillReport] = {}
    for tenant_id in tenant_ids:
        async with db.job_conn(tenant_id, "contacts.backfill") as conn:
            reports[tenant_id] = await contacts_backfill.backfill(conn, tenant_id)
    return reports


async def main() -> int:
    await db.connect()
    try:
        reports = await backfill_all()
    finally:
        await db.disconnect()
    for tenant_id, r in reports.items():
        if r.leads_seen:
            print(f"{tenant_id}: {r.contacts_created} created, {r.leads_linked} linked, "
                  f"{r.queued} to review, {r.invalid_phones} invalid phones")
    total = sum(r.leads_linked for r in reports.values())
    print(f"[backfill_contacts] {len(reports)} tenants, {total} leads linked")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
