"""Plans, limits, and enforcement. Flat PKR pricing (not per-seat), with limits
on seats, active modules, and monthly AI usage. Manual bank-transfer activation;
a real gateway (Safepay/PayFast) plugs into the same payment_requests flow."""
from __future__ import annotations

from datetime import datetime, timezone

import asyncpg
from fastapi import HTTPException, status

# price_minor = monthly price in PKR paisa. Enterprise = "contact us".
PLANS: dict[str, dict] = {
    "starter": {"name": "Starter", "price_minor": 250_000, "max_sections": 1, "max_seats": 5, "ai_monthly": 100},
    "growth": {"name": "Growth", "price_minor": 600_000, "max_sections": 3, "max_seats": 20, "ai_monthly": 1000},
    "enterprise": {"name": "Enterprise", "price_minor": 0, "max_sections": 3, "max_seats": 100000, "ai_monthly": 100000},
}
TRIAL_PLAN = "growth"  # a trial unlocks Growth-level features

# Manual bank-transfer details shown at checkout.
BANK = {
    "bank": "Meezan Bank",
    "title": "Business OS (Pvt) Ltd",
    "account": "PK00 MEZN 0000 0000 0000 00",
    "note": "Add the reference code in your transfer. We activate once it clears.",
}


def trial_expired(sub: asyncpg.Record | None) -> bool:
    if sub is None or sub["status"] != "trialing":
        return False
    ends = sub["trial_ends_at"]
    return bool(ends and ends <= datetime.now(timezone.utc))


def effective_limits(sub: asyncpg.Record | None) -> dict:
    """Limits actually in force right now.

    Trial expiry is evaluated here rather than by a nightly job: a job that
    fails to run silently hands out free Growth forever, which is exactly how
    this leaked before.
    """
    if sub is None:
        return PLANS["starter"]
    if sub["status"] == "trialing":
        return PLANS["starter"] if trial_expired(sub) else PLANS[TRIAL_PLAN]
    if sub["status"] != "active":
        return PLANS["starter"]  # past_due / canceled fall back to the floor
    return PLANS.get(sub["plan"], PLANS["starter"])


async def _sub(conn: asyncpg.Connection) -> asyncpg.Record | None:
    return await conn.fetchrow(
        "select * from subscriptions where tenant_id = current_setting('app.tenant_id')::uuid")


async def check_seat_limit(conn: asyncpg.Connection) -> None:
    limits = effective_limits(await _sub(conn))
    # Seats are team members. Employee self-service logins sit on the 'Employee'
    # role and are excluded — a 20-person shop must not exhaust its plan just by
    # letting staff view their own payslips.
    seats = await conn.fetchval(
        """select count(*) from users u
             left join roles r on r.id = u.role_id
            where r.name is distinct from 'Employee'""")
    if seats >= limits["max_seats"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"Seat limit reached ({limits['max_seats']}). Upgrade your plan to add more users.")


async def check_section_limit(conn: asyncpg.Connection) -> None:
    limits = effective_limits(await _sub(conn))
    if await conn.fetchval("select count(*) from entitlements where enabled") >= limits["max_sections"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"Your plan includes {limits['max_sections']} module(s). Upgrade to enable more.")


async def check_ai_limit(conn: asyncpg.Connection) -> None:
    """AI is the metered unit on the pricing page, so it has to actually meter."""
    limits = effective_limits(await _sub(conn))
    used = await conn.fetchval(
        "select count(*) from ai_interactions where created_at >= date_trunc('month', now())")
    if used >= limits["ai_monthly"]:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"You've used all {limits['ai_monthly']:,} AI questions this month. "
                            "Upgrade your plan for more.")
