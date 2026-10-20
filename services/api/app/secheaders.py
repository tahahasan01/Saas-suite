"""Security headers on every API response (S9).

The API serves JSON (and the odd PDF) — never a page that should run script or
be framed — so the policy is "nothing": default-src 'none' and
frame-ancestors 'none'. Caddy adds the same set at the edge; this copy covers a
request that reaches the app another way. HSTS only in production: it is
meaningless over the plain-http dev server.

The dev-only Swagger pages (/docs, /redoc) load their UI from a CDN, so they
are left without the CSP; production does not serve them at all.
"""
from __future__ import annotations

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import settings

_BASE = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
]
_CSP = (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'")
_HSTS = (b"strict-transport-security", b"max-age=63072000; includeSubDomains")
_DOCS = ("/docs", "/redoc")


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.extra = _BASE + ([_HSTS] if settings.is_prod else [])

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        add = self.extra if scope["path"].startswith(_DOCS) else self.extra + [_CSP]

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                present = {k.lower() for k, _ in message.get("headers", [])}
                message["headers"] = list(message.get("headers", [])) + [
                    (k, v) for k, v in add if k not in present]
            await send(message)

        await self.app(scope, receive, send_with_headers)
