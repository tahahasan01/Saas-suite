"""Seed a staging environment: a demo tenant wired to the FBR/PRAL sandbox (07 I9).

Run on the staging host after migrations (the deploy workflow does this):
    python -m scripts.seed_staging          (from services/api)

Idempotent: it logs in as the demo owner, and signs the tenant up (with sample
data) only when that fails. It goes through the API's own endpoints, in-process,
so signup, RBAC, the audit trail and however FBR tokens are stored all behave as
they do for a real customer.

Environment (GitHub "staging" environment secrets, see .github/README.md):
    STAGING_OWNER_EMAIL, STAGING_OWNER_PASSWORD   required
    FBR_SANDBOX_TOKEN                             PRAL sandbox bearer token; without it FBR stays off
    FBR_SANDBOX_NTN, FBR_SANDBOX_BUSINESS_NAME,   the seller identity registered with the sandbox
    FBR_SANDBOX_PROVINCE, FBR_SANDBOX_ADDRESS

Refuses to run when NODE_ENV=production: production tenants are real businesses.
"""
from __future__ import annotations

import asyncio
import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

import httpx

from app import db
from app.config import settings
from app.main import app
from app.security import SESSION_COOKIE

SECTIONS = ["crm", "pos", "hrms"]


@dataclass(frozen=True)
class SeedResult:
    tenant_id: str
    created: bool
    fbr: Literal["sandbox", "configured", "off"]  # configured = sandbox details saved, not switched on


async def _sign_in(env: Mapping[str, str], client: httpx.AsyncClient) -> tuple[str, bool]:
    email = env.get("STAGING_OWNER_EMAIL", "")
    password = env.get("STAGING_OWNER_PASSWORD", "")
    if not email or not password:
        raise SystemExit("STAGING_OWNER_EMAIL and STAGING_OWNER_PASSWORD must be set")
    r = await client.post("/auth/login", json={"email": email, "password": password})
    created = False
    if r.status_code == 401:
        r = await client.post("/auth/signup", json={
            "company_name": "Staging Demo Traders", "industry_type": "retail",
            "name": "Staging Owner", "email": email, "password": password,
            "sections": SECTIONS, "sample_data": True,
        })
        created = True
    r.raise_for_status()
    client.cookies.set(SESSION_COOKIE, r.cookies[SESSION_COOKIE])
    me = (await client.get("/auth/me")).raise_for_status().json()
    return str(me["tenant"]["id"]), created


async def _wire_fbr(env: Mapping[str, str], client: httpx.AsyncClient) -> Literal["sandbox", "configured", "off"]:
    token = env.get("FBR_SANDBOX_TOKEN", "")
    if not token:
        return "off"
    body: dict[str, object] = {
        "environment": "sandbox",  # never production from here, whatever the token is
        "token": token,
        "seller_ntn_cnic": env.get("FBR_SANDBOX_NTN", ""),
        "seller_business_name": env.get("FBR_SANDBOX_BUSINESS_NAME", ""),
        "seller_province": env.get("FBR_SANDBOX_PROVINCE", ""),
        "seller_address": env.get("FBR_SANDBOX_ADDRESS", ""),
    }
    # Sample products carry no HS code and FBR refuses lines without one, so the
    # demo catalog gets a placeholder code the sandbox accepts.
    hs_code = env.get("FBR_SANDBOX_HS_CODE", "0101.2100")
    products = (await client.get("/pos/products", params={"limit": 500})).raise_for_status().json()
    for p in products:
        if not str(p.get("hs_code") or "").strip():
            (await client.patch(f"/pos/products/{p['id']}", json={"hs_code": hs_code})).raise_for_status()

    on = await client.put("/fbr/settings", json={**body, "enabled": True})
    if on.status_code == 200:
        return "sandbox"
    # 422: seller details missing or a product without an HS code. Save what we
    # have so an engineer can finish it in Settings → FBR.
    print(f"[seed_staging] FBR not switched on: {on.json().get('detail')}")
    (await client.put("/fbr/settings", json=body)).raise_for_status()
    return "configured"


async def seed(env: Mapping[str, str], client: httpx.AsyncClient) -> SeedResult:
    tenant_id, created = await _sign_in(env, client)
    return SeedResult(tenant_id=tenant_id, created=created, fbr=await _wire_fbr(env, client))


async def _run() -> None:
    await db.connect()
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://staging-seed") as client:
            result = await seed(os.environ, client)
    finally:
        await db.disconnect()
    print(f"[seed_staging] tenant {result.tenant_id} ({'created' if result.created else 'existing'}), FBR: {result.fbr}")


def main() -> None:
    if settings.is_prod:
        raise SystemExit("seed_staging refuses to run in production (NODE_ENV=production)")
    asyncio.run(_run())


if __name__ == "__main__":
    main()
