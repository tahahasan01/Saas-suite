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


async def _begin(email, ip, n) -> list[int]:
    """n login attempts as the endpoint makes them: 0 = let through to the password check."""
    from fastapi import HTTPException

    out = []
    for _ in range(n):
        try:
            await ratelimit.begin_login(email, ip)
            out.append(0)
        except HTTPException as e:
            out.append(e.status_code)
    return out


async def test_each_further_lock_doubles_up_to_an_hour(client):
    email, ip = f"ghost+{uuid.uuid4().hex[:8]}@example.com", "198.51.100.1"
    waits = []
    for _ in range(4):
        assert await _begin(email, ip, 6) == [0] * 5 + [423]
        waits.append(await ratelimit.locked_for(email, ip))
        await store.delete(await ratelimit._attempt_key(email, ip))      # this lock ran out
    expected = [900, 1800, 3600, 3600]                                  # doubling, capped at an hour
    assert all(e - 60 < w <= e for w, e in zip(waits, expected)), waits


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


async def test_an_attacker_cannot_lock_the_real_user_out(client, crm_tenant, monkeypatch):
    """The hard lock is per (account, client IP): wrong passwords typed from
    one address lock that address out of the account, not its owner."""
    monkeypatch.setattr(settings, "trusted_proxy_cidrs", "127.0.0.1/32")
    email = (await client.get("/auth/me")).json()["user"]["email"]
    attacker = {"X-Forwarded-For": "198.51.100.66"}
    codes = [(await client.post("/auth/login", json={"email": email, "password": "guess"},
                                headers=attacker)).status_code for _ in range(6)]
    assert codes == [401] * 5 + [423]
    r = await client.post("/auth/login", json={"email": email, "password": "Sup3rSecret!23"},
                          headers={"X-Forwarded-For": "203.0.113.5"})
    assert r.status_code == 200


async def test_guesses_from_many_ips_are_bounded_per_account(client, monkeypatch):
    """Past a per-account ceiling, attempts from anywhere are slowed to one
    per ACCOUNT_SLOW_S — a slow-down (429), never a lock on the owner."""
    monkeypatch.setattr(ratelimit, "ACCOUNT_SLOW_AFTER", 8)
    email = f"target+{uuid.uuid4().hex[:8]}@example.com"
    first = [(await _begin(email, f"198.51.100.{i}", 1))[0] for i in range(8)]
    assert first == [0] * 8
    later = [(await _begin(email, f"203.0.113.{i}", 1))[0] for i in range(4)]
    assert later == [0, 429, 429, 429]          # one attempt per slow window, from any IP


async def test_parallel_attempts_cannot_race_past_the_lock(client, crm_tenant, monkeypatch):
    """The attempt is reserved (atomic INCR) before the password is checked,
    so a burst of parallel guesses gets at most the allowed number checked."""
    import asyncio

    from app.routers import auth

    checked = []

    def spy(stored_hash, password):
        checked.append(1)
        return False

    monkeypatch.setattr(auth, "verify_password", spy)
    email = (await client.get("/auth/me")).json()["user"]["email"]   # a real account: its hash gets checked
    rs = await asyncio.gather(*(_login(client, email, f"guess-{i}") for i in range(20)))
    codes = [r.status_code for r in rs]
    assert len(checked) <= ratelimit.LOGIN_FAILS_PER_ACCOUNT
    assert codes.count(401) == len(checked)
    assert set(codes) - {401} <= {423, 429}


# ── The in-process fallback under pressure ──────────────────────────────────
async def test_flooding_the_fallback_cannot_evict_a_lock(client, monkeypatch):
    monkeypatch.setattr(store, "_down_until", __import__("time").monotonic() + 600)   # Redis "down"
    monkeypatch.setattr(store, "_MEMORY_MAX_KEYS", 50)
    monkeypatch.setattr(store, "_MEMORY_MAX_PROTECTED", 60)
    email, ip = f"locked+{uuid.uuid4().hex[:8]}@example.com", "198.51.100.9"
    assert await _begin(email, ip, 6) == [0] * 5 + [423]
    for i in range(500):                                   # junk: alert de-dup, spike counters …
        await store.claim_once(f"alert:junk{i}", 600)
    assert await _begin(email, ip, 1) == [423]
    # Junk in the protected partition (rate-limit buckets) can't push it out
    # either: once full, the store refuses new security keys and the
    # limiter fails closed.
    for i in range(500):
        await ratelimit.hit(f"ip:10.9.{i // 250}.{i % 250}:/auth/verify", 5, 900)
    assert await _begin(email, ip, 1) == [423]
    assert await _begin(f"new+{uuid.uuid4().hex[:6]}@example.com", "198.51.100.10", 1) == [429]


async def test_decr_gives_one_back_and_never_goes_below_zero():
    from app import store
    name = "test:decr:" + __import__("uuid").uuid4().hex
    assert await store.incr(name, 60) == 1
    assert await store.incr(name, 60) == 2
    assert await store.decr(name) == 1
    assert await store.decr(name) == 0
    assert await store.decr(name) == 0
    assert await store.get(name) == 0
