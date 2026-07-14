"""Pydantic request/response schemas (the API contract)."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# FBR's reference UoM list; this is the value for discrete countable goods.
FBR_DEFAULT_UOM = "Numbers, pieces, units"

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
    # FBR line-item requirements. `unit` stays the shop-floor label; `fbr_uom`
    # must be a value from FBR's own reference list.
    hs_code: str = ""
    tax_rate: float = 0
    fbr_uom: str = FBR_DEFAULT_UOM


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
    hs_code: str = ""
    tax_rate: float = Field(default=0, ge=0, le=100)
    fbr_uom: str = FBR_DEFAULT_UOM


class ProductUpdate(BaseModel):
    # extra='forbid' so a typo'd or unknown field is a 422 rather than a silent
    # no-op: a tax_rate that looks saved but was dropped is how a retailer files
    # zero-rated invoices without knowing it.
    model_config = ConfigDict(extra="forbid")

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
    hs_code: str | None = None
    tax_rate: float | None = Field(default=None, ge=0, le=100)
    fbr_uom: str | None = None


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
    tax_minor: int = 0
    # Present once FBR has issued a number; None while a submission is queued.
    fbr_invoice_number: str | None = None
    fbr_status: str | None = None       # 'submitted' | 'pending' | None (FBR off)


class SaleDetail(SaleOut):
    """A sale plus what is still returnable on each line."""
    returnable: list["ReturnableLine"] = Field(default_factory=list)


class ReturnableLine(BaseModel):
    sale_item_id: str
    product_id: str | None
    name: str
    qty_sold: float
    qty_returned: float
    qty_returnable: float
    price_minor: int


class ReturnLine(BaseModel):
    sale_item_id: str
    qty: float = Field(gt=0)


class ReturnCreate(BaseModel):
    items: list[ReturnLine] = Field(min_length=1)
    reason: str = ""
    restock: bool = True   # damaged goods come back to the shop but not the shelf


class ReturnItemOut(BaseModel):
    name: str
    qty: float
    line_refund_minor: int


class ReturnOut(BaseModel):
    id: str
    sale_id: str
    reason: str
    refund_minor: int
    tax_minor: int
    created_at: datetime
    items: list[ReturnItemOut] = Field(default_factory=list)
    fbr_invoice_number: str | None = None
    fbr_status: str | None = None


# ─── FBR Digital Invoicing ──────────────────────────────────────────────────
class FbrSettingsOut(BaseModel):
    enabled: bool
    environment: str
    seller_ntn_cnic: str
    seller_business_name: str
    seller_province: str
    seller_address: str
    prices_include_tax: bool
    # The bearer token is never returned — only whether one is set.
    token_set: bool


class FbrSettingsUpdate(BaseModel):
    enabled: bool | None = None
    environment: str | None = None
    seller_ntn_cnic: str | None = None
    seller_business_name: str | None = None
    seller_province: str | None = None
    seller_address: str | None = None
    prices_include_tax: bool | None = None
    token: str | None = None


class FbrInvoiceOut(BaseModel):
    sale_id: str
    status: str
    fbr_invoice_number: str | None
    error_code: str
    error: str
    attempts: int
    created_at: datetime


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
REQUEST_TYPES = ["leave", "wfh"]


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
    # 'wfh' is not leave — the employee is working, so it is never deducted.
    request_type: str = "leave"
    leave_type: str = "annual"
    from_date: date
    to_date: date
    reason: str = ""


class LeaveOut(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    request_type: str
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
    wfh_days: int             # approved work-from-home — worked, never deducted
    absent_days: int          # a working day with no check-in, leave or WFH
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


class StageSlice(BaseModel):
    """One pipeline stage's standing total. Value and count both, because a stage
    holding one large deal and a stage holding twenty small ones are different
    situations and a single number hides which you're in."""
    name: str
    kind: str          # 'active' | 'won'  ('lost' is excluded from pipeline)
    count: int
    value: int         # minor units (paisa), as everywhere else


class DashboardOverview(BaseModel):
    sections: list[str]
    kpis: list[Kpi]
    revenue_trend: list[TrendPoint]
    leads_trend: list[TrendPoint]
    pipeline: list[StageSlice]
    alerts: list[Alert]
    activity: list[ActivityItem]


# ─── CSV import ──────────────────────────────────────────────────────────────
class ImportRowError(BaseModel):
    row: int          # 1-based line number in the file, header included
    error: str


class ImportResult(BaseModel):
    created: int
    skipped_duplicates: int
    errors: list[ImportRowError] = Field(default_factory=list)


# ─── Leave policy & balances ─────────────────────────────────────────────────
class LeavePolicyOut(BaseModel):
    annual_days: int
    sick_days: int
    casual_days: int


class LeavePolicyUpdate(BaseModel):
    annual_days: int | None = Field(default=None, ge=0, le=365)
    sick_days: int | None = Field(default=None, ge=0, le=365)
    casual_days: int | None = Field(default=None, ge=0, le=365)


class LeaveBalance(BaseModel):
    leave_type: str
    quota: int
    used: int        # approved working days this calendar year
    remaining: int


# ─── Cash drawer ─────────────────────────────────────────────────────────────
class DrawerOpen(BaseModel):
    opening_float_minor: int = Field(default=0, ge=0)


class DrawerClose(BaseModel):
    counted_minor: int = Field(ge=0)
    notes: str = ""


class MethodTotal(BaseModel):
    payment_method: str
    count: int
    total_minor: int


class DrawerOut(BaseModel):
    id: str
    status: str
    opened_at: datetime
    opened_by: str | None
    opening_float_minor: int
    # Live while open; frozen at close.
    expected_minor: int
    cash_sales_minor: int
    cash_refunds_minor: int
    sales_by_method: list[MethodTotal] = Field(default_factory=list)
    closed_at: datetime | None = None
    counted_minor: int | None = None
    variance_minor: int | None = None   # counted − expected: + over, − short
    notes: str = ""


# ─── Suppliers & purchase orders ─────────────────────────────────────────────
class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    phone: str = ""
    email: str = ""
    notes: str = ""


class SupplierOut(BaseModel):
    id: str
    name: str
    phone: str
    email: str
    notes: str


class PoLineCreate(BaseModel):
    product_id: str
    qty: float = Field(gt=0)
    cost_minor: int = Field(default=0, ge=0)   # per unit


class PoCreate(BaseModel):
    supplier_id: str | None = None
    items: list[PoLineCreate] = Field(min_length=1)
    notes: str = ""


class PoLineOut(BaseModel):
    id: str
    product_id: str | None
    name: str
    qty: float
    cost_minor: int
    received_qty: float


class PoOut(BaseModel):
    id: str
    supplier_id: str | None
    supplier_name: str | None
    status: str
    notes: str
    created_at: datetime
    received_at: datetime | None
    total_cost_minor: int
    items: list[PoLineOut] = Field(default_factory=list)


class PoReceiveLine(BaseModel):
    po_item_id: str
    qty: float = Field(gt=0)


class PoReceive(BaseModel):
    items: list[PoReceiveLine] = Field(min_length=1)


# ─── Attendance week matrix ──────────────────────────────────────────────────
class WeekRow(BaseModel):
    id: str
    name: str
    # One per day: present | late | leave | wfh | holiday | off | pending | absent | none
    cells: list[str]


class WeekOut(BaseModel):
    days: list[date]
    employees: list[WeekRow]
