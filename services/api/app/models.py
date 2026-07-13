"""Pydantic request/response schemas (the API contract)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

# Industries the platform re-skins itself for.
INDUSTRIES = [
    "retail",
    "restaurant",
    "pharmacy",
    "wholesale",
    "education",
    "b2b_software",
    "real_estate",
]

# Sections (business capabilities) a tenant can enable.
SECTIONS = ["crm", "pos", "hrms"]


class SignupRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
    industry_type: str
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    sections: list[str] = Field(default_factory=lambda: ["crm"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TenantOut(BaseModel):
    id: str
    name: str
    industry_type: str
    status: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str | None = None


class EntitlementOut(BaseModel):
    section_key: str
    enabled: bool
    limits: dict = Field(default_factory=dict)


class MeResponse(BaseModel):
    user: UserOut
    tenant: TenantOut
    entitlements: list[EntitlementOut]


class TerminologyResponse(BaseModel):
    industry_type: str
    locale: str
    labels: dict[str, str]


# ── Team management ─────────────────────────────────────────────────────────
class TeamUser(BaseModel):
    id: str
    email: str
    name: str
    role: str | None
    status: str


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    role_id: str


class UserUpdate(BaseModel):
    role_id: str | None = None
    status: str | None = Field(default=None, pattern="^(active|disabled)$")


class RoleOut(BaseModel):
    id: str
    name: str
    is_system: bool


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    # permissions as {section: [actions]}
    permissions: dict[str, list[str]] = Field(default_factory=dict)


class EntitlementUpdate(BaseModel):
    enabled: bool


# ── CRM ─────────────────────────────────────────────────────────────────────
LEAD_SOURCES = ["manual", "whatsapp", "facebook", "google", "referral"]
INTERACTION_CHANNELS = ["call", "whatsapp", "email", "note", "bot"]
INTERACTION_OUTCOMES = ["interested", "not_interested", "callback", "busy"]


class StageOut(BaseModel):
    id: str
    name: str
    position: int
    kind: str


class PipelineOut(BaseModel):
    id: str
    name: str
    is_default: bool
    stages: list[StageOut]


class LeadOut(BaseModel):
    id: str
    pipeline_id: str
    stage_id: str
    owner_id: str | None
    name: str
    company: str
    phone: str
    email: str
    source: str
    value_minor: int
    currency: str
    score: int | None
    created_at: datetime
    stage_kind: str | None = None


class LeadCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    company: str = ""
    phone: str = ""
    email: str = ""
    source: str = "manual"
    value_minor: int = 0
    pipeline_id: str | None = None
    stage_id: str | None = None
    force: bool = False  # create even if a possible duplicate is detected


class LeadUpdate(BaseModel):
    stage_id: str | None = None
    name: str | None = None
    company: str | None = None
    phone: str | None = None
    email: str | None = None
    value_minor: int | None = None
    owner_id: str | None = None


class DuplicateMatch(BaseModel):
    id: str
    name: str
    company: str
    reason: str  # 'phone' | 'email' | 'company'


class InteractionOut(BaseModel):
    id: str
    user_id: str | None
    channel: str
    outcome: str | None
    note: str
    next_follow_up_at: datetime | None
    created_at: datetime


class InteractionCreate(BaseModel):
    channel: str = "note"
    outcome: str | None = None
    note: str = ""
    next_follow_up_at: datetime | None = None


class LeadDetail(BaseModel):
    lead: LeadOut
    interactions: list[InteractionOut]


class CrmSummary(BaseModel):
    total_leads: int
    open_leads: int
    won_value_minor: int
    added_this_week: int


class FulfillmentSchema(BaseModel):
    label: str            # industry fulfillment term (e.g. "Courier Dispatch")
    fields: list[dict]


class FulfillmentData(BaseModel):
    data: dict = Field(default_factory=dict)


class InvoiceCreate(BaseModel):
    lead_id: str
    amount_minor: int = Field(ge=0)
    discount_pct: float = Field(default=0, ge=0, le=100)
    notes: str = ""


class InvoiceOut(BaseModel):
    id: str
    lead_id: str
    lead_name: str
    amount_minor: int
    discount_pct: float
    total_minor: int
    notes: str
    status: str
    created_at: datetime
    decided_at: datetime | None


# ── AI ──────────────────────────────────────────────────────────────────────
class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)


class AskResponse(BaseModel):
    answer: str
    sql: str | None = None
    rows: list[dict] = Field(default_factory=list)


# ── Notifications ───────────────────────────────────────────────────────────
class NotificationOut(BaseModel):
    id: str
    title: str
    body: str
    kind: str
    link: str | None
    read: bool
    created_at: datetime


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread: int


# ── Workflows (ECA automations) ─────────────────────────────────────────────
WORKFLOW_TRIGGERS = ["lead.created", "lead.stage_changed", "interaction.logged"]


class WorkflowOut(BaseModel):
    id: str
    name: str
    trigger: str
    conditions: list[dict]
    actions: list[dict]
    enabled: bool
    is_system: bool


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    trigger: str
    conditions: list[dict] = Field(default_factory=list)
    actions: list[dict] = Field(default_factory=list)


class WorkflowUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
