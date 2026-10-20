"""FastAPI entrypoint for the Business OS backend."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import asyncpg

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import db, obs
from .bodylimit import BodyLimitMiddleware
from .config import settings
from .context import REQUEST_ID_HEADER, RequestContextMiddleware
from .routers import (
    ai, auth, billing, crm, dashboard, entitlements, fbr, hrms, invoices, meta, notifications, pos,
    team, terminology, workflows,
)

# JSON logs with request/tenant context and PII redaction; Sentry if SENTRY_DSN (app/obs.py).
obs.setup_logging("api")
obs.init_sentry("api")
log = logging.getLogger("api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # No scheduler here: jobs run in the worker process (`python -m app.worker`, D-08).
    await db.connect()
    yield
    await db.disconnect()


app = FastAPI(title="Business OS API", version="0.1.0", lifespan=lifespan)

# Added before CORS so CORS stays outermost and a 413 still carries its headers.
app.add_middleware(BodyLimitMiddleware)
# Access log, error-spike counting and log context, inside the request context.
app.add_middleware(obs.AccessLogMiddleware)
# A request id and actor context per request, for the audit trail (D-07).
app.add_middleware(RequestContextMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,  # required so the session cookie is sent
    allow_methods=["*"],
    allow_headers=["*"],
    # Paged lists report their full size here; cross-origin fetch() can only
    # read response headers that are listed.
    expose_headers=["X-Total-Count", REQUEST_ID_HEADER],
)

app.include_router(meta.router)
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(terminology.router)
app.include_router(entitlements.router)
app.include_router(team.router)
app.include_router(crm.router)
app.include_router(ai.router)
app.include_router(notifications.router)
app.include_router(workflows.router)
app.include_router(invoices.router)
app.include_router(pos.router)
app.include_router(fbr.router)
app.include_router(hrms.router)
app.include_router(hrms.portal)
app.include_router(billing.router)


@app.exception_handler(asyncpg.DataError)
async def invalid_value_handler(request: Request, exc: asyncpg.DataError) -> JSONResponse:
    # A malformed id or value reaching the database (e.g. "not-a-uuid" in a
    # path) is the caller's mistake, not a server error.
    return JSONResponse(status_code=422, content={"detail": "Invalid identifier or value."})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Log the full trace server-side; never leak internals to the client.
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    # This response is built outside the request middleware, so it adds the id itself.
    rid = getattr(request.state, "request_id", None)
    return JSONResponse(status_code=500,
                        content={"detail": "Something went wrong. Please try again.", "request_id": rid},
                        headers={"X-Request-ID": rid} if rid else None)
