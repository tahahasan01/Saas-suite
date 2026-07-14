"""Activate a paid plan after a bank transfer has been reconciled by a human.

This is deliberately an operator tool and not an API endpoint: the customer is
the payer, so the customer does not get to assert that the money arrived. The
app can only record a claim (`status='submitted'`); this is the only path that
grants an active plan.

    python scripts/activate_payment.py --list
    python scripts/activate_payment.py --activate <payment_request_id>
    python scripts/activate_payment.py --reject <payment_request_id>

Runs on the owner pool: it intentionally crosses tenants, which RLS forbids.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone

from app import db

PERIOD_DAYS = 30


async def list_pending() -> None:
    async with db.owner_conn() as conn:
        rows = await conn.fetch(
            """select p.id, p.plan, p.amount_minor, p.reference, p.status, p.created_at, t.name
                 from payment_requests p join tenants t on t.id = p.tenant_id
                where p.status in ('pending', 'submitted')
                order by p.created_at""")
    if not rows:
        print("Nothing awaiting reconciliation.")
        return
    print(f"{'id':38} {'tenant':24} {'plan':10} {'PKR':>10}  {'ref':12} status")
    for r in rows:
        print(f"{str(r['id']):38} {r['name'][:24]:24} {r['plan']:10} "
              f"{r['amount_minor'] / 100:>10,.0f}  {r['reference']:12} {r['status']}")


async def activate(request_id: str) -> int:
    async with db.owner_conn() as conn:
        async with conn.transaction():
            pr = await conn.fetchrow(
                "select tenant_id, plan, status from payment_requests where id=$1", request_id)
            if pr is None:
                print(f"No payment request {request_id}", file=sys.stderr)
                return 1
            if pr["status"] == "paid":
                print("Already activated — nothing to do.", file=sys.stderr)
                return 1
            await conn.execute("update payment_requests set status='paid' where id=$1", request_id)
            await conn.execute(
                """insert into subscriptions (tenant_id, plan, status, current_period_end, updated_at)
                   values ($1, $2, 'active', $3, now())
                   on conflict (tenant_id) do update set plan=excluded.plan, status='active',
                     current_period_end=excluded.current_period_end, updated_at=now()""",
                pr["tenant_id"], pr["plan"],
                datetime.now(timezone.utc) + timedelta(days=PERIOD_DAYS))
    print(f"Activated {pr['plan']} for tenant {pr['tenant_id']} until "
          f"{(datetime.now(timezone.utc) + timedelta(days=PERIOD_DAYS)).date()}")
    return 0


async def reject(request_id: str) -> int:
    async with db.owner_conn() as conn:
        updated = await conn.execute(
            "update payment_requests set status='rejected' where id=$1 and status<>'paid'", request_id)
    if updated.endswith("0"):
        print("Not found, or already activated.", file=sys.stderr)
        return 1
    print(f"Rejected {request_id}")
    return 0


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--list", action="store_true", help="show transfers awaiting reconciliation")
    g.add_argument("--activate", metavar="ID", help="grant the plan after the money has landed")
    g.add_argument("--reject", metavar="ID", help="mark the claim rejected")
    args = ap.parse_args()

    await db.connect()
    try:
        if args.list:
            await list_pending()
            return 0
        if args.activate:
            return await activate(args.activate)
        return await reject(args.reject)
    finally:
        await db.disconnect()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
