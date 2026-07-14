"""Pydantic request/response schemas (the API contract)."""
from __future__ import annotations

from datetime import date, datetime

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
    sample_data: bool = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotRequest(BaseModel):
    email: EmailStr


class ResetRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=200)


class VerifyRequest(BaseModel):
    token: str


class InviteRequest(BaseModel):
    email: EmailStr
    role_id: str


class AcceptInviteRequest(BaseModel):
    token: str
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=200)


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


# ── POS ─────────────────────────────────────────────────────────────────────
PAYMENT_METHODS = ["cash", "card", "jazzcash", "easypaisa", "bank"]


class ProductOut(BaseModel):
    id: str
    name: str
    sku: str
    barcode: str
    category: str
    unit: str
    price_minor: int
    cost_minor: int
    stock_qty: float
    low_stock_at: float
    active: bool


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    sku: str = ""
    barcode: str = ""
    category: str = ""
    unit: str = "pcs"
    price_minor: int = Field(default=0, ge=0)
    cost_minor: int = Field(default=0, ge=0)
    stock_qty: float = 0
    low_stock_at: float = 0


class ProductUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    barcode: str | None = None
    category: str | None = None
    unit: str | None = None
    price_minor: int | None = Field(default=None, ge=0)
    cost_minor: int | None = Field(default=None, ge=0)
    stock_qty: float | None = None
    low_stock_at: float | None = None
    active: bool | None = None


class SaleLine(BaseModel):
    product_id: str
    qty: float = Field(gt=0)


class SaleCreate(BaseModel):
    items: list[SaleLine] = Field(min_length=1)
    discount_minor: int = Field(default=0, ge=0)
    paid_minor: int = Field(default=0, ge=0)
    payment_method: str = "cash"


class SaleItemOut(BaseModel):
    name: str
    qty: float
    price_minor: int
    line_total_minor: int


class SaleOut(BaseModel):
    id: str
    subtotal_minor: int
    discount_minor: int
    total_minor: int
    paid_minor: int
    change_minor: int
    payment_method: str
    item_count: int
    created_at: datetime
    items: list[SaleItemOut] = Field(default_factory=list)


class PosSummary(BaseModel):
    products_count: int
    low_stock_count: int
    sales_today_count: int
    sales_today_total_minor: int


class RestockItem(BaseModel):
    product_id: str
    name: str
    unit: str
    stock_qty: float
    daily_velocity: float
    days_left: float | None
    recommend_qty: int
    reason: str


class ForecastItem(BaseModel):
    product_id: str
    name: str
    current_stock: float
    projected_units: int
    recommend_qty: int


class OccasionForecast(BaseModel):
    occasion: str
    event_date: str
    days_until: int
    uplift_pct: int
    items: list[ForecastItem]


class ForecastOut(BaseModel):
    occasions: list[OccasionForecast]


# ── HRMS ────────────────────────────────────────────────────────────────────
LEAVE_TYPES = ["annual", "sick", "casual", "unpaid"]


class EmployeeOut(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    cnic: str
    designation: str
    department: str
    join_date: date | None
    salary_minor: int
    status: str
    present_today: bool = False


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: str = ""
    phone: str = ""
    cnic: str = ""
    designation: str = ""
    department: str = ""
    join_date: date | None = None
    salary_minor: int = Field(default=0, ge=0)


class EmployeeUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    designation: str | None = None
    department: str | None = None
    salary_minor: int | None = Field(default=None, ge=0)
    status: str | None = None


class CheckInRequest(BaseModel):
    employee_id: str
    method: str = "web"
    lat: float | None = None
    lng: float | None = None
    mock_gps: bool = False


class AttendanceOut(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    work_date: date
    check_in: datetime | None
    check_out: datetime | None
    status: str
    method: str
    fraud_flag: str


class LeaveCreate(BaseModel):
    employee_id: str
    leave_type: str = "annual"
    from_date: date
    to_date: date
    reason: str = ""


class LeaveOut(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    leave_type: str
    from_date: date
    to_date: date
    reason: str
    status: str


class HrmsSummary(BaseModel):
    headcount: int
    present_today: int
    on_leave_today: int
    pending_leaves: int


class Payslip(BaseModel):
    employee_id: str
    name: str
    gross_minor: int
    present_days: int
    paid_leave_days: int      # approved annual/sick/casual — not deducted
    unpaid_leave_days: int    # approved 'unpaid' leave — deducted
    absent_days: int          # a working day with no check-in and no leave
    absence_deduction_minor: int
    tax_minor: int
    net_minor: int


class PayrollOut(BaseModel):
    month: str
    working_days: int
    payslips: list[Payslip]


class HolidayOut(BaseModel):
    id: str
    holiday_date: date
    name: str


class HolidayCreate(BaseModel):
    holiday_date: date
    name: str = Field(min_length=1, max_length=120)


# ── Billing ─────────────────────────────────────────────────────────────────
class BillingOut(BaseModel):
    plan: str
    status: str
    days_left: int | None
    current_period_end: datetime | None
    max_sections: int
    max_seats: int
    ai_monthly: int
    seats_used: int
    sections_used: int


class PlanOut(BaseModel):
    key: str
    name: str
    price_minor: int
    max_sections: int
    max_seats: int
    ai_monthly: int


class UpgradeRequest(BaseModel):
    plan: str


class PaymentInstructions(BaseModel):
    payment_request_id: str
    plan: str
    amount_minor: int
    reference: str
    bank: dict


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


# ─── Dashboard overview (cross-module) ──────────────────────────────────────
class TrendPoint(BaseModel):
    day: date
    value: int


class Kpi(BaseModel):
    key: str
    label: str
    value: int
    kind: str                     # 'count' | 'money'
    delta_pct: float | None = None  # vs the preceding equal-length window
    href: str


class Alert(BaseModel):
    text: str
    href: str
    tone: str                     # 'warning' | 'danger'


class ActivityItem(BaseModel):
    action: str
    entity: str
    actor: str | None
    created_at: datetime


class DashboardOverview(BaseModel):
    sections: list[str]
    kpis: list[Kpi]
    revenue_trend: list[TrendPoint]
    leads_trend: list[TrendPoint]
    alerts: list[Alert]
    activity: list[ActivityItem]
