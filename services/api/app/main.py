"""FastAPI entrypoint for the Business OS backend."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import asyncpg

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import db, obs, startup_guard
from .bodylimit import BodyLimitMiddleware
from .config import settings
from .context import REQUEST_ID_HEADER, RequestContextMiddleware
from .secheaders import SecurityHeadersMiddleware
from .routers import (
    ai, auth, billing, crm, dashboard, entitlements, fbr, hrms, invoices, meta, notifications, pos,
    team, terminology, workflows,
)
from .routers import activities as activities_router, crm_pipelines, crm_reports  # crm v2 (3B)
from .routers import contacts as contacts_router
from .routers import files, org, profile, sequences, tax  # org data (3A, p3-orgdata)
from .routers import platform, roles
from .routers import hrms_attendance, hrms_holidays, hrms_kiosk, hrms_leave, hrms_org
from .routers import payroll as payroll_routes  # Phase 3 payroll (3F)
from .routers import payroll_runs as payroll_run_routes
from .routers import payroll_settings as payroll_settings_routes
from .routers import pos_catalog

# JSON logs with request/tenant context and PII redaction; Sentry if SENTRY_DSN (app/obs.py).
obs.setup_logging("api")
obs.init_sentry("api")
log = logging.getLogger("api")

# Production exits here on default/known secrets (S10) — before anything listens.
startup_guard.enforce(settings)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # No scheduler here: jobs run in the worker process (`python -m app.worker`, D-08).
    await db.connect()
    yield
    await db.disconnect()


# The schema and Swagger UI are a map of every endpoint: dev only (S11).
_docs: dict[str, str | None] = (
    {"docs_url": None, "redoc_url": None, "openapi_url": None} if settings.is_prod
    else {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"})
app = FastAPI(title="Business OS API", version="0.1.0", lifespan=lifespan,
              docs_url=_docs["docs_url"], redoc_url=_docs["redoc_url"], openapi_url=_docs["openapi_url"])

# Added before CORS so CORS stays outermost and a 413 still carries its headers.
app.add_middleware(BodyLimitMiddleware)
# Outside the body limit so a 413 carries the headers too; inside CORS (S9).
app.add_middleware(SecurityHeadersMiddleware)
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
app.include_router(crm_pipelines.router)
app.include_router(crm_reports.router)
app.include_router(activities_router.router)
app.include_router(contacts_router.router)
# Org data (3A, p3-orgdata)
app.include_router(org.router)
app.include_router(sequences.router)
app.include_router(files.router)
app.include_router(tax.router)
app.include_router(profile.router)
app.include_router(platform.router)
app.include_router(roles.router)
# HR org, attendance v2, kiosk, leave v2 and holidays (3F, 0065–0068).
app.include_router(hrms_org.router)
app.include_router(hrms_attendance.router)
app.include_router(hrms_attendance.portal)
app.include_router(hrms_kiosk.router)
app.include_router(hrms_kiosk.device)
app.include_router(hrms_holidays.router)
app.include_router(hrms_leave.router)
app.include_router(hrms_leave.portal)
app.include_router(payroll_routes.router)
app.include_router(payroll_run_routes.router)
app.include_router(payroll_run_routes.portal)
app.include_router(payroll_run_routes.public)
app.include_router(payroll_settings_routes.router)
app.include_router(pos_catalog.router)   # catalog v2 and stock (3C, 0075)


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
