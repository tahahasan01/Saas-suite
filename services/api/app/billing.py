"""Plans, limits, and enforcement. Flat PKR pricing (not per-seat), with limits
on seats, active modules, and monthly AI usage. Manual bank-transfer activation;
a real gateway (Safepay/PayFast) plugs into the same payment_requests flow."""
from __future__ import annotations

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
    "note": "Add the reference code in your transfer, then confirm below.",
}


def effective_limits(sub: asyncpg.Record | None) -> dict:
    if sub is None:
        return PLANS["starter"]
    if sub["status"] == "trialing":
        return PLANS[TRIAL_PLAN]
    return PLANS.get(sub["plan"], PLANS["starter"])


async def _sub(conn: asyncpg.Connection) -> asyncpg.Record | None:
    return await conn.fetchrow(
        "select * from subscriptions where tenant_id = current_setting('app.tenant_id')::uuid")


async def check_seat_limit(conn: asyncpg.Connection) -> None:
    limits = effective_limits(await _sub(conn))
    if await conn.fetchval("select count(*) from users") >= limits["max_seats"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"Seat limit reached ({limits['max_seats']}). Upgrade your plan to add more users.")


async def check_section_limit(conn: asyncpg.Connection) -> None:
    limits = effective_limits(await _sub(conn))
    if await conn.fetchval("select count(*) from entitlements where enabled") >= limits["max_sections"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"Your plan includes {limits['max_sections']} module(s). Upgrade to enable more.")
