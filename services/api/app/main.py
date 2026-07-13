"""FastAPI entrypoint for the Business OS backend."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .config import settings
from .routers import (
    ai, auth, billing, crm, entitlements, hrms, invoices, notifications, pos, team,
    terminology, workflows,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    yield
    await db.disconnect()


app = FastAPI(title="Business OS API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,  # required so the session cookie is sent
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(terminology.router)
app.include_router(entitlements.router)
app.include_router(team.router)
app.include_router(crm.router)
app.include_router(ai.router)
app.include_router(notifications.router)
app.include_router(workflows.router)
app.include_router(invoices.router)
app.include_router(pos.router)
app.include_router(hrms.router)
app.include_router(billing.router)


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok", "service": "business-os-api"}
