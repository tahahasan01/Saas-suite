"""FastAPI entrypoint for the Business OS backend."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import asyncpg

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import db, jobs
from .bodylimit import BodyLimitMiddleware
from .config import settings
from .routers import (
    ai, auth, billing, crm, dashboard, entitlements, fbr, hrms, invoices, notifications, pos, team,
    terminology, workflows,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("api")

if settings.sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.1, environment=settings.node_env)
    log.info("Sentry error tracking enabled")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    if settings.enable_scheduler:
        jobs.start()
    yield
    jobs.stop()
    await db.disconnect()


app = FastAPI(title="Business OS API", version="0.1.0", lifespan=lifespan)

# Added before CORS so CORS stays outermost and a 413 still carries its headers.
app.add_middleware(BodyLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,  # required so the session cookie is sent
    allow_methods=["*"],
    allow_headers=["*"],
    # Paged lists report their full size here; cross-origin fetch() can only
    # read response headers that are listed.
    expose_headers=["X-Total-Count"],
)

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
    return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again."})


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok", "service": "business-os-api"}
