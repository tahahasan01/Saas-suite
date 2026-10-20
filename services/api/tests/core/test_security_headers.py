"""Security headers on every API response (S9).

Caddy sets them too (infra/caddy/Caddyfile); the app sets its own so a
misrouted request, or a deployment without the proxy, is still covered.
"""
from __future__ import annotations

EXPECTED = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
}


def _assert_headers(r):
    for name, value in EXPECTED.items():
        assert r.headers.get(name) == value, (name, r.headers.get(name))
    csp = r.headers.get("content-security-policy", "")
    assert "frame-ancestors 'none'" in csp
    assert "default-src 'none'" in csp


async def test_headers_on_a_public_endpoint(client):
    _assert_headers(await client.get("/health"))


async def test_headers_on_an_error(client):
    r = await client.get("/auth/me")  # no session
    assert r.status_code == 401
    _assert_headers(r)


async def test_headers_on_a_rejected_body(client):
    r = await client.post("/auth/login", content=b"x" * (2 * 1024 * 1024),
                          headers={"content-type": "application/json"})
    assert r.status_code == 413
    _assert_headers(r)


async def test_no_hsts_outside_production(client):
    # HSTS over plain-http localhost would only confuse a browser; the
    # production half is in test_production_guard.py.
    assert "strict-transport-security" not in (await client.get("/health")).headers
