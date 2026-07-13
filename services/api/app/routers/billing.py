"""Billing — subscription state, plans, and the manual upgrade flow."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from .. import billing, db
from ..deps import AuthContext, current_auth
from ..models import BillingOut, PaymentInstructions, PlanOut, UpgradeRequest
from ..rbac import require

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("", response_model=BillingOut)
async def get_billing(auth: AuthContext = Depends(current_auth)) -> BillingOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        sub = await conn.fetchrow("select * from subscriptions where tenant_id=$1", auth.tenant_id)
        seats = await conn.fetchval("select count(*) from users")
        sections = await conn.fetchval("select count(*) from entitlements where enabled")
    limits = billing.effective_limits(sub)
    days_left = None
    if sub and sub["status"] == "trialing" and sub["trial_ends_at"]:
        days_left = max(0, (sub["trial_ends_at"] - datetime.now(timezone.utc)).days)
    return BillingOut(
        plan=sub["plan"] if sub else "starter", status=sub["status"] if sub else "trialing",
        days_left=days_left, current_period_end=sub["current_period_end"] if sub else None,
        max_sections=limits["max_sections"], max_seats=limits["max_seats"], ai_monthly=limits["ai_monthly"],
        seats_used=seats, sections_used=sections)


@router.get("/plans", response_model=list[PlanOut])
async def list_plans() -> list[PlanOut]:
    return [PlanOut(key=k, name=p["name"], price_minor=p["price_minor"], max_sections=p["max_sections"],
                    max_seats=p["max_seats"], ai_monthly=p["ai_monthly"]) for k, p in billing.PLANS.items()]


@router.post("/upgrade", response_model=PaymentInstructions)
async def upgrade(body: UpgradeRequest, auth: AuthContext = Depends(require("settings", "admin"))) -> PaymentInstructions:
    plan = billing.PLANS.get(body.plan)
    if plan is None or body.plan == "enterprise":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose Starter or Growth (Enterprise = contact sales)")
    async with db.tenant_conn(auth.tenant_id) as conn:
        rid = await conn.fetchval(
            """insert into payment_requests (tenant_id, plan, amount_minor, reference)
               values ($1,$2,$3,$4) returning id""",
            auth.tenant_id, body.plan, plan["price_minor"], f"BOS-{auth.tenant_id[:8].upper()}")
    return PaymentInstructions(payment_request_id=str(rid), plan=body.plan, amount_minor=plan["price_minor"],
                               reference=f"BOS-{auth.tenant_id[:8].upper()}", bank=billing.BANK)


@router.post("/payment-requests/{request_id}/confirm", response_model=BillingOut)
async def confirm_payment(request_id: str, auth: AuthContext = Depends(require("settings", "admin"))) -> BillingOut:
    """Owner confirms the bank transfer → activate the plan for 30 days.
    (In production a platform admin verifies the transfer before activation.)"""
    async with db.tenant_conn(auth.tenant_id) as conn:
        pr = await conn.fetchrow("select plan, status from payment_requests where id=$1", request_id)
        if pr is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment request not found")
        if pr["status"] != "pending":
            raise HTTPException(status.HTTP_409_CONFLICT, f"Already {pr['status']}")
        await conn.execute("update payment_requests set status='paid' where id=$1", request_id)
        period_end = datetime.now(timezone.utc) + timedelta(days=30)
        await conn.execute(
            """insert into subscriptions (tenant_id, plan, status, current_period_end, updated_at)
               values ($1,$2,'active',$3, now())
               on conflict (tenant_id) do update set plan=excluded.plan, status='active',
                 current_period_end=excluded.current_period_end, updated_at=now()""",
            auth.tenant_id, pr["plan"], period_end)
    return await get_billing(auth)
