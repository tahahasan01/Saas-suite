"""Rate limits and login lockout (gate S7; 12-trd TR-SEC-25/48/49).

Counters live in Redis (shared by every API process) with an in-process
fallback. X-Forwarded-For is believed only from the configured proxy. The
auth endpoints that take a secret — reset, verify, accept-invite — are
limited per IP, and failed logins lock the account with a growing back-off,
identically for addresses that have no account.
"""
from __future__ import annotations

import uuid

import pytest
from starlette.requests import Request

from app import ratelimit, store
from app.config import settings


def _req(peer: str, xff: str | None = None) -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers,
                    "client": (peer, 1234), "query_string": b""})


# ── Client IP ───────────────────────────────────────────────────────────────
def test_forwarded_for_is_ignored_unless_the_peer_is_a_trusted_proxy(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_cidrs", "")
    assert ratelimit.client_ip(_req("203.0.113.9", "1.2.3.4")) == "203.0.113.9"
    monkeypatch.setattr(settings, "trusted_proxy_cidrs", "10.0.0.0/8")
    assert ratelimit.client_ip(_req("203.0.113.9", "1.2.3.4")) == "203.0.113.9"   # not our proxy


def test_behind_the_proxy_the_client_is_the_rightmost_untrusted_hop(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_cidrs", "10.0.0.0/8, 172.16.0.0/12")
    # The client wrote "6.6.6.6" itself; the proxy appended the address it saw.
    assert ratelimit.client_ip(_req("10.0.0.2", "6.6.6.6, 198.51.100.7")) == "198.51.100.7"
    assert ratelimit.client_ip(_req("10.0.0.2", "198.51.100.7, 172.17.0.3")) == "198.51.100.7"
    assert ratelimit.client_ip(_req("10.0.0.2")) == "10.0.0.2"


async def test_a_spoofed_forwarded_for_does_not_buy_a_fresh_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_cidrs", "")
    codes = [(await client.post("/auth/verify", json={"token": "x"},
                                headers={"X-Forwarded-For": f"9.9.9.{i}"})).status_code for i in range(6)]
    assert codes == [400] * 5 + [429]


# ── Limits on the token endpoints ───────────────────────────────────────────
@pytest.mark.parametrize("path,body", [
    ("/auth/reset", {"token": "nope", "password": "Whatever123!"}),
    ("/auth/verify", {"token": "nope"}),
    ("/auth/accept-invite", {"token": "nope", "name": "X", "password": "Whatever123!"}),
])
async def test_token_endpoints_are_limited_per_ip(client, path, body):
    codes = [(await client.post(path, json=body)).status_code for _ in range(6)]
    assert codes == [400] * 5 + [429]
    r = await client.post(path, json=body)
    assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0


async def test_counters_are_shared_through_redis(client):
    if not await store.ping():
        pytest.skip("no Redis on REDIS_URL")
    await client.post("/auth/verify", json={"token": "x"})
    import redis.asyncio as aioredis

    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        keys = [k async for k in r.scan_iter(match=store.key("rl:ip:*:/auth/verify:*"))]
    finally:
        await r.aclose()
    assert len(keys) == 1


async def test_limits_still_hold_when_redis_is_down(client, monkeypatch):
    class Down:
        def pipeline(self, **kw):
            raise ConnectionError("redis down")

        async def get(self, k):
            raise ConnectionError("redis down")

        async def ttl(self, k):
            raise ConnectionError("redis down")

    monkeypatch.setattr(store, "_redis", lambda: Down())
    codes = [(await client.post("/auth/verify", json={"token": "x"})).status_code for _ in range(6)]
    assert codes == [400] * 5 + [429]   # in-process fallback: limited, not open


# ── Login lockout ───────────────────────────────────────────────────────────
async def _login(client, email, password):
    return await client.post("/auth/login", json={"email": email, "password": password})


async def test_five_failures_lock_the_account_even_against_the_right_password(client, crm_tenant):
    email = (await client.get("/auth/me")).json()["user"]["email"]
    codes = [(await _login(client, email, "wrong-password")).status_code for _ in range(5)]
    assert codes == [401] * 5
    r = await _login(client, email, "Sup3rSecret!23")
    assert r.status_code == 423
    assert 800 < int(r.headers["Retry-After"]) <= 900


async def test_an_unknown_address_locks_the_same_way(client):
    """Same codes, same order, same wait: lockout reveals nothing about
    whether the address has an account."""
    email = f"ghost+{uuid.uuid4().hex[:8]}@example.com"
    codes = [(await _login(client, email, "wrong-password")).status_code for _ in range(6)]
    assert codes == [401] * 5 + [423]


async def test_each_further_lock_doubles(client):
    email = f"ghost+{uuid.uuid4().hex[:8]}@example.com"
    first = await ratelimit.login_failed(email, "198.51.100.1")
    for _ in range(4):
        first = await ratelimit.login_failed(email, "198.51.100.1") or first
    await store.delete(f"lock:until:{ratelimit._account(email)}")       # the first lock ran out
    second = 0
    for _ in range(5):
        second = await ratelimit.login_failed(email, "198.51.100.1") or second
    assert (first, second) == (900, 1800)
    assert 1700 < await ratelimit.locked_for(email) <= 1800


async def test_a_successful_reset_lifts_the_lock(client, crm_tenant, monkeypatch):
    from app import email as mail

    email = (await client.get("/auth/me")).json()["user"]["email"]
    for _ in range(5):
        await _login(client, email, "wrong-password")
    assert (await _login(client, email, "Sup3rSecret!23")).status_code == 423
    links: list[str] = []

    async def capture(to, subject, body):
        links.append(body)

    monkeypatch.setattr(mail, "_send", capture)
    await client.post("/auth/forgot", json={"email": email})
    token = links[-1].split("token=")[1].split()[0]
    assert (await client.post("/auth/reset", json={"token": token, "password": "N3w-Passw0rd!"})).status_code == 204
    assert (await _login(client, email, "N3w-Passw0rd!")).status_code == 200


async def test_a_successful_login_clears_earlier_failures(client, crm_tenant):
    email = (await client.get("/auth/me")).json()["user"]["email"]
    for _ in range(4):
        await _login(client, email, "wrong-password")
    assert (await _login(client, email, "Sup3rSecret!23")).status_code == 200
    for _ in range(4):
        await _login(client, email, "wrong-password")
    assert (await _login(client, email, "Sup3rSecret!23")).status_code == 200


async def test_many_failures_from_one_ip_throttle_it(client, monkeypatch):
    monkeypatch.setattr(ratelimit, "LOGIN_FAILS_PER_IP", 3)
    for i in range(3):
        await ratelimit.login_failed(f"a{i}+{uuid.uuid4().hex[:6]}@example.com", "127.0.0.1")
    r = await _login(client, f"fresh+{uuid.uuid4().hex[:6]}@example.com", "whatever-pass")
    assert r.status_code == 429
