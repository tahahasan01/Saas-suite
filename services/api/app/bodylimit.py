"""A ceiling on request bodies (07 S12).

Without one, a single 50 MB JSON post is read into memory and parsed by
whichever worker it reaches. JSON endpoints need well under 1 MiB; CSV imports
carry up to csv_io.MAX_ROWS rows, so they get more.

Pure ASGI rather than BaseHTTPMiddleware so it can count a chunked body (no
Content-Length) as it streams in, and stop reading the moment it's over.
"""
from __future__ import annotations

import json

MIB = 1024 * 1024
DEFAULT_LIMIT = 1 * MIB
IMPORT_LIMIT = 5 * MIB
_IMPORT_PATHS = ("/crm/leads/import", "/pos/products/import")


def limit_for(path: str) -> int:
    return IMPORT_LIMIT if path.endswith(_IMPORT_PATHS) else DEFAULT_LIMIT


class BodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        limit = limit_for(scope["path"])

        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            return await _reject(send, limit)

        seen = 0
        started = False
        rejected = False

        async def counted_receive():
            # Over the limit: answer 413 ourselves and tell the app the client
            # left. Raising instead doesn't work — FastAPI turns any error
            # while reading the body into its own 400.
            nonlocal seen, rejected
            if rejected:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > limit:
                    rejected = True
                    if not started:
                        await _reject(send, limit)
                    return {"type": "http.disconnect"}
            return message

        async def tracked_send(message):
            nonlocal started
            if rejected:
                return  # the 413 is already out; drop whatever the app says
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        await self.app(scope, counted_receive, tracked_send)


async def _reject(send, limit: int) -> None:
    body = json.dumps({"detail": f"Request body too large (limit {limit // MIB} MB)."}).encode()
    await send({"type": "http.response.start", "status": 413,
                "headers": [(b"content-type", b"application/json"),
                            (b"content-length", str(len(body)).encode())]})
    await send({"type": "http.response.body", "body": body})
