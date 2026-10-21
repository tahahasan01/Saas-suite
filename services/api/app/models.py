"""Pydantic request/response schemas (the API contract)."""
from __future__ import annotations

from datetime import date, datetime, time

from typing import Any, Literal, get_args
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

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


class LocaleOut(BaseModel):
    """How to render for this caller (12-trd §5.2 `locale`)."""
    locale: Literal["en", "ur"]
    dir: Literal["ltr", "rtl"]
    timezone: str
    currency: str


class MeBranch(BaseModel):
    id: str
    code: str
    name: str
    is_default: bool


class MeModule(BaseModel):
    key: str
    state: Literal["enabled", "disabled"]
    application: bool


class MeNavChild(BaseModel):
    href: str
    label_key: str


class MeNavItem(BaseModel):
    """A sidebar entry the caller may see; the web owns labels and icons."""
    key: str
    module: str
    href: str
    label_key: str
    icon: str
    group: str
    children: list[MeNavChild] = Field(default_factory=list)


class TerminologyRef(BaseModel):
    """Which label set is current: refetch /terminology when the ETag moves."""
    etag: str
    industry_type: str
    locale: str


class MeResponse(BaseModel):
    user: UserOut
    tenant: TenantOut
    # Deprecated (12-trd §5.2): read `modules`. Kept for one release.
    entitlements: list[EntitlementOut]
    # Permission key -> scope (D-04). The web gates controls on these keys;
    # the API re-checks every request regardless.
    permissions: dict[str, Literal["own", "team", "branch", "all"]]
    # Every module with its state (D-01), and the nav the server computed
    # from manifests ∩ enabled modules ∩ held keys (D-04, D-50).
    modules: list[MeModule] = Field(default_factory=list)
    nav: list[MeNavItem] = Field(default_factory=list)
    flags: dict[str, bool] = Field(default_factory=dict)
    terminology: TerminologyRef | None = None
    locale: LocaleOut
    # True when this login belongs to an employee: the app shows self-service.
    employee_portal: bool = False
    # The branches this request works in (D-03: X-Branch-Ids narrowed to the
    # user's own), default first; and the tenant's branding, shaped like
    # GET /org/branding (D-12). (p3-orgdata)
    branches: list[MeBranch] = Field(default_factory=list)
    branding: dict[str, Any] | None = None


class TerminologyResponse(BaseModel):
    industry_type: str
    locale: str
    labels: dict[str, str]


# ── Team management ─────────────────────────────────────────────────────────
class RoleRef(BaseModel):
    id: str
    name: str


class TeamUser(BaseModel):
    id: str
    email: str
    name: str
    role: str | None                 # the primary role (users.role_id)
    status: str
    roles: list[RoleRef] = Field(default_factory=list)   # every role held (RBAC v2)


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    role_id: str


UserStatus = Literal["active", "disabled"]
USER_STATUSES = list(get_args(UserStatus))

# Audit trail and record timeline (D-07, migration 0044).
ActorKind = Literal["user", "job", "ai", "import", "system", "platform_admin", "webhook", "device"]
ACTOR_KINDS = list(get_args(ActorKind))
TimelineKind = Literal["note", "field_change", "stage_change", "won", "lost", "restored",
                       "activity_done", "call", "merge", "system", "attachment",
                       "approved", "rejected"]
TIMELINE_KINDS = list(get_args(TimelineKind))


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class UserUpdate(BaseModel):
    # Omitted = unchanged; an explicit null removes the user's role.
    role_id: str | None = None
    status: UserStatus | None = None


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
# Enum-like values: each Literal is the API's 422 and, through the list derived
# from it, the database's check constraint (0042; tests/core/test_enum_checks).
# Lead source stays free text: CSV imports carry the source the file names.
LEAD_SOURCES = ["manual", "whatsapp", "facebook", "google", "referral"]
InteractionChannel = Literal["call", "whatsapp", "email", "note", "bot"]
InteractionOutcome = Literal["interested", "not_interested", "callback", "busy"]
INTERACTION_CHANNELS = list(get_args(InteractionChannel))
INTERACTION_OUTCOMES = list(get_args(InteractionOutcome))
STAGE_KINDS = ["active", "won", "lost"]   # legacy column, kept one release (0062)
InvoiceStatus = Literal["pending", "approved", "rejected"]
INVOICE_STATUSES = list(get_args(InvoiceStatus))
LeadStatus = Literal["open", "won", "lost"]
LEAD_STATUSES = list(get_args(LeadStatus))
# Activities (D-32, 0063). Polymorphic: 'contact' arrives with the contacts module.
ActivityEntity = Literal["lead", "contact"]
ACTIVITY_ENTITIES = list(get_args(ActivityEntity))
ActivityIcon = Literal["call", "whatsapp", "meeting", "visit", "todo", "quote", "payment"]
ACTIVITY_ICONS = list(get_args(ActivityIcon))
ACTIVITY_TYPE_CODES = ACTIVITY_ICONS        # seeded types: code == icon
ActivityState = Literal["overdue", "today", "planned", "done", "cancelled"]
ACTIVITY_STATES = list(get_args(ActivityState))


class StageOut(BaseModel):
    id: str
    name: str
    position: int
    kind: str
    is_won: bool = False
    fold: bool = False
    rotting_days: int | None = None
    default_probability: int | None = None
    requirements: str = ""


class PipelineOut(BaseModel):
    id: str
    name: str
    is_default: bool
    stages: list[StageOut]


class PipelineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class PipelineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    is_default: bool | None = None


class StageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    is_won: bool = False
    fold: bool = False
    rotting_days: int | None = Field(default=None, ge=1, le=365)
    default_probability: int | None = Field(default=None, ge=0, le=100)
    requirements: str = Field(default="", max_length=500)


class StageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    is_won: bool | None = None
    fold: bool | None = None
    rotting_days: int | None = Field(default=None, ge=1, le=365)
    default_probability: int | None = Field(default=None, ge=0, le=100)
    requirements: str | None = Field(default=None, max_length=500)


class StageOrder(BaseModel):
    stage_ids: list[str] = Field(min_length=1, max_length=50)


class LostReasonOut(BaseModel):
    id: str
    name: str
    active: bool
    position: int


class LostReasonCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class LostReasonUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    position: int | None = Field(default=None, ge=0, le=1000)


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
    status: LeadStatus = "open"
    lost_reason_id: str | None = None
    lost_reason: str | None = None
    lost_note: str | None = None
    won_at: datetime | None = None
    lost_at: datetime | None = None
    probability: int | None = None
    probability_is_manual: bool = False
    weighted_value_minor: int = 0
    expected_close_date: date | None = None
    priority: int = 0
    stage_entered_at: datetime | None = None
    # Worst state among the lead's open activities, and the earliest due day.
    activity_state: Literal["overdue", "today", "planned"] | None = None
    next_activity_date: date | None = None


class LeadCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    company: str = ""
    phone: str = ""
    email: str = ""
    source: str = "manual"
    value_minor: int = 0
    pipeline_id: str | None = None
    stage_id: str | None = None
    priority: int = Field(default=0, ge=0, le=3)
    expected_close_date: date | None = None
    force: bool = False  # create even if a possible duplicate is detected


class LeadUpdate(BaseModel):
    stage_id: str | None = None
    name: str | None = None
    company: str | None = None
    phone: str | None = None
    email: str | None = None
    value_minor: int | None = None
    owner_id: str | None = None
    # Setting a probability makes it manual; probability_auto=true hands it
    # back to the stage.
    probability: int | None = Field(default=None, ge=0, le=100)
    probability_auto: bool | None = None
    priority: int | None = Field(default=None, ge=0, le=3)
    expected_close_date: date | None = None


class LeadLost(BaseModel):
    lost_reason_id: str | None = None
    lost_note: str | None = Field(default=None, max_length=2000)


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
    channel: InteractionChannel = "note"
    outcome: InteractionOutcome | None = None
    note: str = ""
    next_follow_up_at: datetime | None = None


class TimelineChange(BaseModel):
    field: str
    label: str
    old: object = None
    new: object = None
    old_label: str | None = None
    new_label: str | None = None
    masked: bool = False


class TimelineEventOut(BaseModel):
    id: str
    kind: str
    actor_id: str | None
    actor_name: str | None
    body: str | None
    changes: list[TimelineChange]
    payload: dict | None
    occurred_at: datetime


class TimelinePage(BaseModel):
    items: list[TimelineEventOut]
    next_cursor: str | None


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)

    @field_validator("body")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("A note can't be empty")
        return v.strip()


class ActivityTypeOut(BaseModel):
    id: str
    name: str
    code: str | None
    icon: ActivityIcon
    default_days: int
    position: int
    active: bool


class ActivityTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    icon: ActivityIcon = "todo"
    default_days: int = Field(default=0, ge=0, le=365)


class ActivityTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    icon: ActivityIcon | None = None
    default_days: int | None = Field(default=None, ge=0, le=365)
    position: int | None = Field(default=None, ge=0, le=1000)


class ActivityOut(BaseModel):
    id: str
    entity_type: ActivityEntity
    entity_id: str
    entity_name: str | None
    type_id: str
    type_name: str
    type_icon: str
    summary: str
    note: str
    due_date: date
    due_at: datetime | None
    assigned_to: str | None
    assigned_name: str | None
    automated: bool
    state: ActivityState
    done_at: datetime | None
    outcome: str | None
    feedback: str
    created_at: datetime


class ActivityCreate(BaseModel):
    entity_type: ActivityEntity = "lead"
    entity_id: str
    type_id: str
    summary: str = Field(default="", max_length=200)
    note: str = Field(default="", max_length=4000)
    due_date: date
    due_at: datetime | None = None
    assigned_to: str | None = None


class ActivityUpdate(BaseModel):
    type_id: str | None = None
    summary: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=4000)
    due_date: date | None = None
    due_at: datetime | None = None
    assigned_to: str | None = None


class ActivityNext(BaseModel):
    type_id: str
    due_date: date
    summary: str = Field(default="", max_length=200)


class ActivityDone(BaseModel):
    outcome: InteractionOutcome | None = None
    feedback: str = Field(default="", max_length=4000)
    next: ActivityNext | None = None


class ActivitySnooze(BaseModel):
    days: int = Field(ge=1, le=60)


class ActivitySummary(BaseModel):
    overdue: int
    today: int
    planned: int


class LeadDetail(BaseModel):
    lead: LeadOut
    timeline: list[TimelineEventOut]
    activities: list[ActivityOut]


class FunnelRow(BaseModel):
    stage_id: str
    stage: str
    is_won: bool
    reached: int
    value_minor: int
    conversion_pct: int | None


class LostReasonRow(BaseModel):
    reason: str
    count: int
    value_minor: int


class SourceRow(BaseModel):
    source: str
    leads: int
    open: int
    won: int
    lost: int
    won_value_minor: int
    win_rate_pct: int | None


class FunnelReport(BaseModel):
    rows: list[FunnelRow]


class LostReasonsReport(BaseModel):
    rows: list[LostReasonRow]


class SourcesReport(BaseModel):
    rows: list[SourceRow]


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
    # Who is billed (required, 0061). Given only a lead, the lead's contact is
    # billed; a lead that isn't qualified yet is a 422.
    contact_id: UUID | None = None
    lead_id: UUID | None = None
    amount_minor: int = Field(ge=0)
    discount_pct: float = Field(default=0, ge=0, le=100)
    notes: str = ""


class InvoiceOut(BaseModel):
    id: str
    lead_id: str | None
    lead_name: str | None
    contact_id: str | None   # null only on requests raised before 0061 whose lead has no contact
    contact_name: str | None
    bill_to: str             # the contact's name, else the lead's
    amount_minor: int
    discount_pct: float
    total_minor: int
    notes: str
    status: str
    created_at: datetime
    decided_at: datetime | None


# ── POS ─────────────────────────────────────────────────────────────────────
# Matches PAYMENT_METHODS in packages/types.
PaymentMethod = Literal["cash", "card", "jazzcash", "easypaisa", "bank"]
PAYMENT_METHODS = list(get_args(PaymentMethod))
DRAWER_STATUSES = ["open", "closed"]
PO_STATUSES = ["ordered", "received", "cancelled"]
FBR_STATUSES = ["pending", "sending", "submitted", "failed", "unknown"]   # 0026; unknown from 0035
FbrEnvironment = Literal["sandbox", "production"]
FBR_ENVIRONMENTS = list(get_args(FbrEnvironment))


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
    # Generated by the till when the cart opens; resending the same cart
    # returns the original sale instead of recording a second one (D-81).
    client_uuid: UUID | None = None
    items: list[SaleLine] = Field(min_length=1)
    discount_minor: int = Field(default=0, ge=0)
    paid_minor: int = Field(default=0, ge=0)
    payment_method: PaymentMethod = "cash"
    contact_id: UUID | None = None   # the customer; None for a walk-in (St02 P0)


class SaleQuoteRequest(BaseModel):
    items: list[SaleLine] = Field(min_length=1)
    discount_minor: int = Field(default=0, ge=0)
    payment_method: PaymentMethod = "cash"


class SaleQuote(BaseModel):
    subtotal_minor: int
    discount_minor: int
    tax_minor: int
    total_minor: int          # the exact invoice value (what FBR is told)
    rounding_minor: int = 0   # cash rounding; due - total
    amount_due_minor: int = 0 # what the customer pays


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
    rounding_minor: int = 0         # cash rounding; amount_due - total
    amount_due_minor: int = 0       # what the customer paid against
    # Present once FBR has issued a number; None while a submission is queued.
    fbr_invoice_number: str | None = None
    fbr_status: str | None = None       # 'submitted' | 'pending' | None (FBR off)
    contact_id: str | None = None       # the customer; None for a walk-in


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


class RefundableLine(ReturnableLine):
    """A returnable line plus the two figures a refund is computed from
    (pricing.refund_for), so the Returns screen previews what will actually be
    paid out rather than list price x qty (audit I8)."""
    paid_minor: int        # what the customer paid for the line: after discount, with tax
    refunded_minor: int    # already given back on earlier returns


class SaleLookup(SaleDetail):
    returnable: list[RefundableLine] = Field(default_factory=list)  # type: ignore[assignment]  # narrows the base field
    # Never refund more than this in total: what was paid (cash-rounded) less
    # earlier refunds. create_return caps at the same figure.
    refundable_minor: int = 0


class ReturnLine(BaseModel):
    sale_item_id: str
    qty: float = Field(gt=0)


class ReturnCreate(BaseModel):
    items: list[ReturnLine] = Field(min_length=1)
    reason: str = ""
    restock: bool = True   # damaged goods come back to the shop but not the shelf

    @field_validator("items")
    @classmethod
    def _each_line_once(cls, items: list[ReturnLine]) -> list[ReturnLine]:
        # Every line is checked against what was returned *before* this
        # request, so the same line twice would slip past that check.
        ids = [i.sale_item_id for i in items]
        if len(ids) != len(set(ids)):
            raise ValueError("List each item once, with the total quantity being returned")
        return items


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
    # pk_regions code behind seller_province (0055); seller_province is its fbr_name.
    seller_region_code: str | None = None


class FbrSettingsUpdate(BaseModel):
    enabled: bool | None = None
    environment: FbrEnvironment | None = None
    seller_ntn_cnic: str | None = None
    seller_business_name: str | None = None
    seller_province: str | None = None
    seller_address: str | None = None
    prices_include_tax: bool | None = None
    token: str | None = None
    # Preferred over seller_province: a pk_regions code (0055).
    seller_region_code: str | None = Field(default=None, pattern=r"^[A-Z]{2,3}$")


class FbrInvoiceOut(BaseModel):
    sale_id: str
    status: str   # pending | submitted | unknown | failed
    fbr_invoice_number: str | None
    error_code: str
    error: str
    attempts: int
    created_at: datetime
    id: str | None = None
    return_id: str | None = None   # set for a return's Debit Note


class FbrResolve(BaseModel):
    """An owner's answer for a filing in `unknown`, after checking IRIS."""
    model_config = ConfigDict(extra="forbid")

    filed: bool                                  # true: FBR has it; false: send it again
    fbr_invoice_number: str | None = Field(default=None, max_length=100)

    @field_validator("fbr_invoice_number")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return (v or "").strip() or None


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
# Exactly the types balances know (annual/sick/casual have quotas, unpaid has
# none). An unknown type used to be stored, then crash the approval.
LeaveType = Literal["annual", "sick", "casual", "unpaid"]
# 'wfh' is not leave — the employee is working, so it is never deducted.
RequestType = Literal["leave", "wfh"]
LEAVE_TYPES = list(get_args(LeaveType))
REQUEST_TYPES = list(get_args(RequestType))
LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"]   # cancelled: 0068
EmployeeStatus = Literal["active", "inactive"]
EMPLOYEE_STATUSES = list(get_args(EmployeeStatus))
# half_day and absent are derived from a shift's worked-minute thresholds
# (0045); 'leave' is legacy — approved leave is read from the requests.
ATTENDANCE_STATUSES = ["present", "late", "half_day", "absent", "leave"]
# What a caller may claim; 'self' is written only by the employee's own portal punch.
CheckInMethod = Literal["web", "mobile", "biometric", "qr"]
# 0066: 'kiosk', 'auto' (the auto check-out job) and 'correction' (an approved
# correction request) are written by the server, never claimed by a caller.
ATTENDANCE_METHODS = [*get_args(CheckInMethod), "self", "kiosk", "auto", "correction"]
FRAUD_FLAGS = ["", "mock_gps", "vpn", "face_mismatch"]
PunchKind = Literal["in", "out"]
PUNCH_KINDS = list(get_args(PunchKind))
EmploymentType = Literal["permanent", "contract", "probation", "daily_wage", "intern"]   # 0065
EMPLOYMENT_TYPES = list(get_args(EmploymentType))


class EmployeeOut(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    cnic: str                 # masked unless the caller holds payroll.salary.read
    designation: str
    department: str
    join_date: date | None
    salary_minor: int | None  # None unless the caller holds payroll.salary.read (D-42)
    status: str
    present_today: bool = False
    has_login: bool = False   # linked to a self-service portal user
    pay_masked: bool = False  # True when salary and CNIC were withheld from this caller


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: str = ""
    phone: str = ""
    cnic: str = ""
    designation: str = ""
    department: str = ""
    join_date: date | None = None
    salary_minor: int = Field(default=0, ge=0)
    # Org fields (0065); the same rules as PATCH /hrms/employees/{id}/job.
    code: str | None = Field(default=None, max_length=40)
    department_id: UUID | None = None
    job_title_id: UUID | None = None
    location_id: UUID | None = None
    manager_id: UUID | None = None
    employment_type: EmploymentType = "permanent"
    probation_end: date | None = None


class EmployeeUpdate(BaseModel):
    name: str | None = None
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = None
    designation: str | None = None
    department: str | None = None
    salary_minor: int | None = Field(default=None, ge=0)
    status: EmployeeStatus | None = None


class CheckInRequest(BaseModel):
    employee_id: str
    method: CheckInMethod = "web"
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
    # Derived from the punches and the shift (D-43). Zero without a shift
    # except late_min, which is measured from tenants.late_after then.
    late_min: int = 0
    early_min: int = 0
    worked_min: int = 0
    shift_id: str | None = None
    locked: bool = False
    # The day is over with a check-in still open: its open interval counted
    # 0 minutes. HR should correct it.
    missing_checkout: bool = False
    # 0066: closed by the auto check-out job (no overtime, 0 minutes for the
    # open interval), fixed by an approved correction, and the server's
    # geofence / network verdict on the last check-in.
    auto_closed: bool = False
    overtime_min: int = 0
    corrected: bool = False
    geo_status: str | None = None
    ip_status: str | None = None


class ShiftCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    # Local times in the tenant's timezone; end at or before start = overnight.
    start_time: time = time(9, 0)
    end_time: time = time(18, 0)
    grace_in_min: int = Field(default=15, ge=0, le=240)
    grace_out_min: int = Field(default=10, ge=0, le=240)
    half_day_below_min: int = Field(default=240, ge=0, le=1440)
    absent_below_min: int = Field(default=120, ge=0, le=1440)

    @model_validator(mode="after")
    def _consistent(self):
        if self.end_time == self.start_time:
            raise ValueError("A shift can't end when it starts")
        if self.absent_below_min > self.half_day_below_min:
            raise ValueError("absent_below_min can't exceed half_day_below_min")
        return self


class ShiftOut(ShiftCreate):
    id: str
    overnight: bool
    active: bool
    # 0066 policy (PATCH /hrms/shifts/{id}/policy).
    auto_checkout: str = "off"
    auto_checkout_after_min: int = 600
    overtime_after_min: int = 30


class ShiftAssign(BaseModel):
    employee_id: str
    date_from: date
    date_to: date | None = None


class ShiftAssignmentOut(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    shift_id: str
    shift_name: str
    date_from: date
    date_to: date | None


class LeaveCreate(BaseModel):
    employee_id: str
    request_type: RequestType = "leave"
    # A leave type's code (the tenant's own since 0068) or its id; unknown -> 422.
    leave_type: str = Field(default="annual", max_length=30)
    leave_type_id: UUID | None = None
    from_date: date
    to_date: date
    # Half days (0068): one day, morning or afternoon -> from_half = to_half;
    # longer, starting after lunch -> from_half 'pm', back after lunch -> to_half 'am'.
    from_half: Literal["am", "pm"] | None = None
    to_half: Literal["am", "pm"] | None = None
    reason: str = Field(default="", max_length=1000)


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
    # Leave v2 (0068)
    leave_type_id: str | None = None
    leave_type_name: str = ""
    paid: bool = True
    from_half: str | None = None
    to_half: str | None = None
    duration_days: float | None = None   # working days, half days as 0.5
    approval_step: str | None = None     # manager | hr | done


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
    half_days: int = 0        # derived half days (shift thresholds) — half a day deducted
    absence_deduction_minor: int
    tax_minor: int
    net_minor: int
    # Each slip names the tax table it was computed under, so /me/payslips can
    # show the "rates pending verification" banner too (St03 §7).
    tax_year: str = ""
    tax_rates_verified: bool = True


class PayrollOut(BaseModel):
    month: str
    working_days: int
    payslips: list[Payslip]
    tax_year: str = ""                 # e.g. "TY2027" — chosen by the pay date
    tax_rates_verified: bool = True    # False → show "rates pending verification"


class HolidayOut(BaseModel):
    id: str
    holiday_date: date
    name: str
    # 0067: the calendar it belongs to (federal, a province, the company).
    calendar_id: str | None = None
    calendar_name: str = ""
    kind: str = "public"
    half_day: bool = False


class HolidayCreate(BaseModel):
    holiday_date: date
    name: str = Field(min_length=1, max_length=120)
    calendar_id: UUID | None = None          # default: the federal calendar
    kind: Literal["public", "optional", "company"] = "public"
    half_day: bool = False


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
WorkflowTrigger = Literal["lead.created", "lead.stage_changed", "interaction.logged",
                          "lead.won", "lead.lost", "lead.restored",
                          "activity.done", "activity.overdue", "contact.created"]
WORKFLOW_TRIGGERS = list(get_args(WorkflowTrigger))

# ── Worker jobs (0043; platform tables, read by app/jobs.py) ────────────────
JobStatus = Literal["idle", "running"]
JOB_STATUSES = list(get_args(JobStatus))
JobRunStatus = Literal["running", "done", "failed", "timeout"]
JOB_RUN_STATUSES = list(get_args(JobRunStatus))


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
    trigger: WorkflowTrigger
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
    """One leave type's balance in the current leave year, from the ledger
    (0068): quota = granted + accrued + carried in ± adjustments."""
    leave_type: str
    quota: float
    used: float      # approved working days this leave year (half days 0.5)
    remaining: float
    leave_type_id: str | None = None
    name: str = ""
    pending: float = 0
    cycle_start: date | None = None
    cycle_end: date | None = None


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


# ─── Contacts (D-30, D-33; migration 0059) ───────────────────────────────────
ContactKind = Literal["person", "company"]
CONTACT_KINDS = list(get_args(ContactKind))
# Roles are labels on one contact, not separate records (St02 §6.2).
ContactRole = Literal["customer", "supplier", "patient", "student", "parent", "partner"]
CONTACT_ROLES = list(get_args(ContactRole))
AddressKind = Literal["billing", "shipping", "other"]
ADDRESS_KINDS = list(get_args(AddressKind))
TagColor = Literal["slate", "teal", "amber", "rose", "violet", "sky", "lime"]
TAG_COLORS = list(get_args(TagColor))
TaggableEntity = Literal["contact", "lead"]
TAGGABLE_ENTITIES = list(get_args(TaggableEntity))
DuplicateReason = Literal["phone", "email", "ntn"]


class TagOut(BaseModel):
    id: str
    name: str
    color: str


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: TagColor = "slate"


class TagUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=40)
    color: TagColor | None = None


class ContactCreate(BaseModel):
    kind: ContactKind = "person"
    name: str = Field(min_length=1, max_length=160)
    company_id: UUID | None = None
    company_name: str = Field(default="", max_length=160)
    job_title: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=254)
    ntn: str = Field(default="", max_length=20)
    strn: str = Field(default="", max_length=20)
    city: str = Field(default="", max_length=80)
    roles: list[ContactRole] = Field(default_factory=list)
    source: str = Field(default="", max_length=40)
    notes: str = Field(default="", max_length=4000)
    owner_id: UUID | None = None
    tag_ids: list[UUID] = Field(default_factory=list, max_length=20)
    force: bool = False  # create even when a likely duplicate exists


class ContactUpdate(BaseModel):
    # Unknown fields are a 422, not a silent no-op (same reason as ProductUpdate).
    model_config = ConfigDict(extra="forbid")
    kind: ContactKind | None = None
    name: str | None = Field(default=None, min_length=1, max_length=160)
    # Omitted = unchanged; an explicit null unlinks the company.
    company_id: UUID | None = None
    company_name: str | None = Field(default=None, max_length=160)
    job_title: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=254)
    ntn: str | None = Field(default=None, max_length=20)
    strn: str | None = Field(default=None, max_length=20)
    city: str | None = Field(default=None, max_length=80)
    roles: list[ContactRole] | None = None
    source: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=4000)
    owner_id: UUID | None = None
    tag_ids: list[UUID] | None = Field(default=None, max_length=20)


class ContactOut(BaseModel):
    id: str
    kind: str
    name: str
    company_id: str | None
    company_name: str            # the linked company's name, else the free text
    job_title: str
    phone: str                   # as typed
    phone_e164: str | None       # the matching key; None when it can't be placed
    email: str
    ntn: str
    strn: str
    effective_ntn: str           # a person under a company reads the company's (St02 §6.2)
    city: str
    roles: list[str]
    source: str
    notes: str
    owner_id: str | None
    tags: list[TagOut] = Field(default_factory=list)
    archived_at: datetime | None
    merged_into_id: str | None
    created_at: datetime
    updated_at: datetime


class ContactBrief(BaseModel):
    id: str
    kind: str
    name: str
    phone: str
    phone_e164: str | None
    email: str
    company_name: str
    archived: bool


class ContactDuplicate(BaseModel):
    id: str
    name: str
    kind: str
    phone_e164: str | None
    email: str
    ntn: str
    archived: bool
    reason: DuplicateReason


class ContactDuplicates(BaseModel):
    duplicates: list[ContactDuplicate]
    # Keys held by more than the shared threshold: never used to match.
    shared_keys: list[str] = Field(default_factory=list)


class ContactLookup(BaseModel):
    phone_e164: str | None
    shared: bool                 # held by more than the threshold: pick, never auto-attach
    matches: list[ContactBrief]


class AddressCreate(BaseModel):
    kind: AddressKind = "billing"
    line1: str = Field(min_length=1, max_length=200)
    line2: str = Field(default="", max_length=200)
    city: str = Field(default="", max_length=80)
    province: str = Field(default="", max_length=40)
    postal_code: str = Field(default="", max_length=12)
    is_default: bool = False


class AddressUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: AddressKind | None = None
    line1: str | None = Field(default=None, min_length=1, max_length=200)
    line2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=80)
    province: str | None = Field(default=None, max_length=40)
    postal_code: str | None = Field(default=None, max_length=12)
    is_default: bool | None = None


class AddressOut(BaseModel):
    id: str
    kind: str
    line1: str
    line2: str
    city: str
    province: str
    postal_code: str
    is_default: bool


class ContactStats(BaseModel):
    open_deals: int
    won_value_minor: int
    sales_count: int
    lifetime_spend_minor: int
    last_visit_at: datetime | None
    # Pending or approved invoice requests (there is no payments model yet).
    invoiced_minor: int


class ContactDeal(BaseModel):
    id: str
    name: str
    stage: str
    stage_kind: str
    value_minor: int
    created_at: datetime


class ContactSale(BaseModel):
    id: str
    total_minor: int
    item_count: int
    payment_method: str
    created_at: datetime


class ContactInvoice(BaseModel):
    id: str
    total_minor: int
    status: str
    created_at: datetime


class ContactDetail(BaseModel):
    contact: ContactOut
    company: ContactBrief | None
    people: list[ContactBrief]
    addresses: list[AddressOut]
    stats: ContactStats
    deals: list[ContactDeal]
    sales: list[ContactSale]
    invoices: list[ContactInvoice]


class ContactNoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


# Leads → contacts (migration 0060, docs §7.1).
ReviewReason = Literal["shared_phone", "name_mismatch"]
REVIEW_REASONS = list(get_args(ReviewReason))
ReviewStatus = Literal["open", "resolved", "dismissed"]
REVIEW_STATUSES = list(get_args(ReviewStatus))


class QualifyRequest(BaseModel):
    """Link the lead to an existing contact, or create one from the lead."""
    mode: Literal["link", "create"]
    contact_id: UUID | None = None   # mode=link
    company_id: UUID | None = None   # mode=create: put the new person under this company
    create_company: bool = False     # mode=create: find or create a company from the lead's company name
    force: bool = False              # mode=create: even if a contact holds the same phone/email


class LeadContact(BaseModel):
    lead_id: str
    contact: ContactOut


class BackfillReport(BaseModel):
    leads_seen: int
    contacts_created: int
    leads_linked: int
    queued: int
    invalid_phones: int        # leads whose phone couldn't be placed; contacts keep the raw text
    invoices_linked: int = 0


class MergeRequest(BaseModel):
    winner_id: UUID
    # Strings, parsed by the endpoint, so a malformed id is a plain 422 like
    # any other bad id rather than a schema error.
    loser_ids: list[str] = Field(max_length=10)
    # field -> the merged contact whose value to keep (e.g. {"ntn": "<id>"}).
    field_choices: dict[str, UUID] = Field(default_factory=dict)


class MergeResult(BaseModel):
    winner: ContactOut
    merged_ids: list[str]
    moved: dict[str, int]      # rows moved per "table.column"


class MergePreviewRequest(BaseModel):
    ids: list[str] = Field(min_length=2, max_length=10)


class MergeCounts(BaseModel):
    leads: int
    sales: int
    invoices: int
    people: int


class MergePreview(BaseModel):
    contacts: list[ContactOut]
    differing_fields: list[str]
    counts: dict[str, MergeCounts]


class ReviewItem(BaseModel):
    id: str
    lead_id: str
    lead_name: str
    lead_phone: str
    lead_email: str
    reason: str
    match_key: str
    candidates: list[ContactBrief]
    created_at: datetime


class TimelineItem(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    kind: str
    body: str | None
    changes: dict | None
    actor_id: str | None
    actor_name: str | None
    occurred_at: datetime


# ─── Org data: regions, sequences, files, tax, branding (3A, 0055–0058) ─────
# Request/response models live in app/org_models.py; the enum Literals are
# here, next to the others test_enum_checks compares with the database.
RegionCode = Literal["PB", "SD", "KP", "BA", "ICT", "GB", "AJK"]
REGION_CODES: list[str] = list(get_args(RegionCode))
RegionKind = Literal["province", "territory"]
REGION_KINDS: list[str] = list(get_args(RegionKind))
SequenceReset = Literal["never", "fiscal_year", "calendar_year", "month"]
SEQUENCE_RESETS: list[str] = list(get_args(SequenceReset))
FileVisibility = Literal["private", "public"]
FILE_VISIBILITIES: list[str] = list(get_args(FileVisibility))
FileMime = Literal["image/png", "image/jpeg", "image/webp", "application/pdf", "text/csv",
                   "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
FILE_MIMES: list[str] = list(get_args(FileMime))
TaxKind = Literal["gst", "pst", "further", "extra", "fed", "wht"]
TAX_KINDS: list[str] = list(get_args(TaxKind))
TaxAppliesTo = Literal["sale", "purchase", "both"]
TAX_APPLIES_TO: list[str] = list(get_args(TaxAppliesTo))
BrandingLayout = Literal["classic", "compact", "bold"]
BRANDING_LAYOUTS: list[str] = list(get_args(BrandingLayout))


# ─── Modules and RBAC v2 (migrations 0052–0054, D-01, D-02, D-04) ───────────
ModuleState = Literal["enabled", "disabled"]
MODULE_STATES = list(get_args(ModuleState))
ModuleReason = Literal["user", "dependency", "auto"]
MODULE_REASONS = list(get_args(ModuleReason))
PurgeStatus = Literal["pending", "cancelled", "done", "failed"]
PURGE_STATUSES = list(get_args(PurgeStatus))
GrantScope = Literal["own", "team", "branch", "all"]
GRANT_SCOPES = list(get_args(GrantScope))


class ModuleOut(BaseModel):
    key: str
    label: str
    description: str
    application: bool
    always_on: bool
    state: ModuleState
    reason: ModuleReason | None
    depends: list[str]
    auto_enable: list[str]
    purgeable: bool
    pending_purge_at: datetime | None = None


class EnablePlanOut(BaseModel):
    module: str
    to_enable: list[str]
    violations: list[str]
    applied: bool


class DisablePlanOut(BaseModel):
    module: str
    to_disable: list[str]
    blocked_by: list[str]
    applied: bool


class PurgeRequest(BaseModel):
    # The Owner types "DELETE <module>" to confirm.
    confirm: str = Field(max_length=80)


class PurgeOut(BaseModel):
    module: str
    status: PurgeStatus
    run_after: datetime


class GrantIn(BaseModel):
    permission_key: str = Field(min_length=1, max_length=120)
    scope: GrantScope = "all"


class RoleV2Create(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=300)
    grants: list[GrantIn] = Field(default_factory=list, max_length=500)


class RoleV2Update(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=300)


class RoleCopy(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class GrantsPut(BaseModel):
    grants: list[GrantIn] = Field(max_length=500)


class RoleIdsPut(BaseModel):
    role_ids: list[str] = Field(max_length=50)


class RoleSummary(BaseModel):
    id: str
    name: str
    description: str
    is_system: bool
    template_key: str | None
    user_count: int


class RoleDetail(RoleSummary):
    grants: list[GrantIn]
    inherits: list[str]


class CatalogKey(BaseModel):
    key: str
    resource: str
    action: str
    scoped: bool                     # own/team/branch apply; otherwise only 'all'
    legacy: list[str]                # the (section, action) it maps from


class CatalogModule(BaseModel):
    module: str
    label: str
    keys: list[CatalogKey]


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    lead_user_id: str | None = None


class TeamOut(BaseModel):
    id: str
    name: str
    lead_user_id: str | None
    member_ids: list[str]


class TeamMembersPut(BaseModel):
    user_ids: list[str] = Field(max_length=500)


# ─── HR org structure (3F, 0065; St03 §6.2) ──────────────────────────────────
# Province codes as pk_regions holds them (integration adds the FK).
Province = Literal["PB", "SD", "KP", "BA", "ICT", "GB", "AJK"]
PROVINCES = list(get_args(Province))
LocationKind = Literal["office", "store", "warehouse", "factory", "remote"]
LOCATION_KINDS = list(get_args(LocationKind))
# off: not checked · record: checked and flagged · require: refused unless it passes.
GeoMode = Literal["off", "record", "require"]
GEO_MODES = list(get_args(GeoMode))
DocumentKind = Literal["cnic", "contract", "certificate", "medical", "license", "passport", "other"]
DOCUMENT_KINDS = list(get_args(DocumentKind))


def _networks(v: list[str] | None) -> list[str] | None:
    """Normalised CIDRs ("198.51.100.7" -> "198.51.100.7/32"); 422 on junk."""
    import ipaddress
    if v is None:
        return None
    out = []
    for c in v:
        try:
            out.append(str(ipaddress.ip_network(c.strip(), strict=False)))
        except ValueError:
            raise ValueError(f"{c!r} is not an IP address or network") from None
    return out


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: UUID | None = None
    head_employee_id: UUID | None = None


class DepartmentUpdate(BaseModel):
    """An explicit null clears parent or head."""
    name: str | None = Field(default=None, min_length=1, max_length=120)
    parent_id: UUID | None = None
    head_employee_id: UUID | None = None
    active: bool | None = None


class DepartmentOut(BaseModel):
    id: str
    name: str
    parent_id: str | None
    head_employee_id: str | None
    active: bool
    headcount: int = 0


class JobTitleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    department_id: UUID | None = None


class JobTitleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    department_id: UUID | None = None
    active: bool | None = None


class JobTitleOut(BaseModel):
    id: str
    name: str
    department_id: str | None
    active: bool


class LocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: LocationKind = "office"
    address: str = Field(default="", max_length=400)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    radius_m: int = Field(default=150, ge=10, le=5000)
    allowed_cidrs: list[str] = Field(default_factory=list, max_length=50)
    province: Province | None = None
    geo_mode: GeoMode = "record"
    ip_mode: GeoMode = "off"

    _cidrs = field_validator("allowed_cidrs")(lambda cls, v: _networks(v))

    @model_validator(mode="after")
    def _consistent(self):
        check_location(self.lat, self.lng, self.geo_mode, self.ip_mode, self.allowed_cidrs)
        return self


def check_location(lat, lng, geo_mode, ip_mode, cidrs) -> None:
    """The rules a location must keep, on create and on the merged update."""
    if (lat is None) != (lng is None):
        raise ValueError("Give both latitude and longitude, or neither")
    if geo_mode == "require" and lat is None:
        raise ValueError("A required geofence needs the location's latitude and longitude")
    if ip_mode == "require" and not cidrs:
        raise ValueError("Requiring the office network needs at least one allowed network")


class LocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    kind: LocationKind | None = None
    address: str | None = Field(default=None, max_length=400)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    radius_m: int | None = Field(default=None, ge=10, le=5000)
    allowed_cidrs: list[str] | None = Field(default=None, max_length=50)
    province: Province | None = None
    geo_mode: GeoMode | None = None
    ip_mode: GeoMode | None = None
    active: bool | None = None

    _cidrs = field_validator("allowed_cidrs")(lambda cls, v: _networks(v))


class LocationOut(BaseModel):
    id: str
    name: str
    kind: str
    address: str
    lat: float | None
    lng: float | None
    radius_m: int
    allowed_cidrs: list[str]
    province: str | None
    geo_mode: str
    ip_mode: str
    active: bool
    kiosks: int = 0


class EmployeeJobUpdate(BaseModel):
    """Org fields; an explicit null clears a link."""
    code: str | None = Field(default=None, max_length=40)
    department_id: UUID | None = None
    job_title_id: UUID | None = None
    location_id: UUID | None = None
    manager_id: UUID | None = None
    employment_type: EmploymentType | None = None
    probation_end: date | None = None


class EmployeeProfile(EmployeeOut):
    code: str | None = None
    department_id: str | None = None
    job_title_id: str | None = None
    location_id: str | None = None
    location_name: str | None = None
    province: str | None = None
    manager_id: str | None = None
    manager_name: str | None = None
    employment_type: str = "permanent"
    probation_end: date | None = None
    has_kiosk_pin: bool = False
    documents_expiring: int = 0     # expired or due within 30 days


class DocumentCreate(BaseModel):
    kind: DocumentKind = "other"
    title: str = Field(min_length=1, max_length=160)
    number: str = Field(default="", max_length=80)
    issued_on: date | None = None
    expires_on: date | None = None
    file_id: UUID | None = None
    note: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def _dates(self):
        if self.issued_on and self.expires_on and self.expires_on < self.issued_on:
            raise ValueError("A document can't expire before it was issued")
        return self


class DocumentOut(BaseModel):
    id: str
    employee_id: str
    employee_name: str = ""
    kind: str
    title: str
    number: str
    issued_on: date | None
    expires_on: date | None
    file_id: str | None
    note: str
    days_left: int | None = None    # negative once expired


# ─── Attendance v2: geofence, kiosks, auto check-out, corrections (3F, 0066) ─
GeoStatus = Literal["inside", "outside", "no_fix", "not_required"]
GEO_STATUSES = list(get_args(GeoStatus))
IpStatus = Literal["allowed", "outside", "not_required"]
IP_STATUSES = list(get_args(IpStatus))
AutoCheckout = Literal["off", "shift_end", "max_hours"]
AUTO_CHECKOUT_POLICIES = list(get_args(AutoCheckout))
CorrectionStatus = Literal["pending", "approved", "rejected", "cancelled"]
CORRECTION_STATUSES = list(get_args(CorrectionStatus))


class ShiftPolicyUpdate(BaseModel):
    auto_checkout: AutoCheckout | None = None
    auto_checkout_after_min: int | None = Field(default=None, ge=30, le=1440)
    overtime_after_min: int | None = Field(default=None, ge=0, le=1440)


class PunchRequest(BaseModel):
    """What the browser's Geolocation API reported; all optional — a punch
    without a fix is recorded as `no_fix` (TR-NFR-32)."""
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, ge=0, le=100_000)
    mock_gps: bool = False      # the client's suspicion: a risk flag, never a pass


class PunchOut(BaseModel):
    kind: str                   # in | out
    attendance: AttendanceOut
    geo_status: str
    ip_status: str


class CorrectionCreate(BaseModel):
    work_date: date
    requested_in: datetime | None = None
    requested_out: datetime | None = None
    reason: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def _times(self):
        if self.requested_in is None and self.requested_out is None:
            raise ValueError("Give the check-in time, the check-out time, or both")
        if self.requested_in and self.requested_out and self.requested_out <= self.requested_in:
            raise ValueError("The check-out must be after the check-in")
        if not self.reason.strip():
            raise ValueError("Say why the day needs correcting")
        return self


class CorrectionOut(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    work_date: date
    requested_in: datetime | None
    requested_out: datetime | None
    reason: str
    status: str
    decided_by: str | None
    decided_at: datetime | None
    decision_note: str
    created_at: datetime


class Decision(BaseModel):
    note: str = Field(default="", max_length=500)


class KioskCreate(BaseModel):
    location_id: UUID
    name: str = Field(min_length=1, max_length=80)


class KioskOut(BaseModel):
    id: str
    location_id: str
    location_name: str
    name: str
    created_at: datetime
    last_seen_at: datetime | None
    revoked_at: datetime | None
    token: str | None = None    # only in the create response; stored as a hash


class KioskPinSet(BaseModel):
    pin: str = Field(pattern=r"^\d{4,6}$")


class KioskPunchRequest(BaseModel):
    employee_id: UUID
    pin: str = Field(min_length=1, max_length=12)


class KioskEmployee(BaseModel):
    id: str
    name: str
    has_pin: bool


class KioskLocation(BaseModel):
    id: str
    name: str


class KioskBootstrap(BaseModel):
    location: KioskLocation
    kiosk_name: str
    employees: list[KioskEmployee]


class KioskPunchOut(BaseModel):
    kind: str
    name: str
    at: datetime
    worked_today_min: int


# ─── Holiday calendars and blackout days (3F, 0067) ──────────────────────────
HolidayScope = Literal["federal", "province", "company"]
HOLIDAY_SCOPES = list(get_args(HolidayScope))
HolidayKind = Literal["public", "optional", "company"]
HOLIDAY_KINDS = list(get_args(HolidayKind))


class HolidayCalendarCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    scope: Literal["province", "company"] = "company"   # one federal calendar exists already
    province: Province | None = None

    @model_validator(mode="after")
    def _province(self):
        if (self.scope == "province") != (self.province is not None):
            raise ValueError("A province calendar needs a province; other calendars have none")
        return self


class HolidayCalendarOut(BaseModel):
    id: str
    name: str
    scope: str
    province: str | None
    holidays: int = 0


class BlackoutCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    date_from: date
    date_to: date
    location_id: UUID | None = None
    department_id: UUID | None = None

    @model_validator(mode="after")
    def _range(self):
        if self.date_to < self.date_from:
            raise ValueError("The blackout can't end before it starts")
        return self


class BlackoutOut(BaseModel):
    id: str
    name: str
    date_from: date
    date_to: date
    location_id: str | None
    department_id: str | None


class ApprovalsOut(BaseModel):
    """A manager's inbox: pending requests from their direct reports."""
    corrections: list[CorrectionOut]
    leave: list[LeaveOut]


# ─── Leave v2: types, ledger, approval chain (3F, 0068; D-44) ─────────────────
LeaveCountsAs = Literal["leave", "wfh"]
LEAVE_COUNTS_AS = list(get_args(LeaveCountsAs))
LeaveApproval = Literal["none", "manager", "hr", "manager_then_hr"]
LEAVE_APPROVALS = list(get_args(LeaveApproval))
LeaveGrantMode = Literal["annual_upfront", "monthly_accrual", "none"]
LEAVE_GRANT_MODES = list(get_args(LeaveGrantMode))
LeaveCarry = Literal["none", "all", "capped"]
LEAVE_CARRY_MODES = list(get_args(LeaveCarry))
LedgerEntry = Literal["grant", "accrual", "carry_in", "carry_expire", "taken", "reversal", "adjust"]
LEDGER_ENTRIES = list(get_args(LedgerEntry))
Half = Literal["am", "pm"]
HALVES = list(get_args(Half))
LeaveStep = Literal["manager", "hr", "done"]
LEAVE_STEPS = list(get_args(LeaveStep))
APPROVAL_STEPS = ["manager", "hr"]
APPROVAL_DECISIONS = ["approved", "rejected"]


class LeaveTypeBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = Field(default="#0f766e", pattern=r"^#[0-9a-fA-F]{6}$")
    paid: bool = True
    requires_balance: bool = True
    counts_as: LeaveCountsAs = "leave"
    allow_half_day: bool = True
    approval: LeaveApproval = "manager_then_hr"
    grant_mode: LeaveGrantMode = "annual_upfront"
    days_per_year: float = Field(default=0, ge=0, le=366)
    accrual_start_after_days: int = Field(default=0, ge=0, le=3650)
    prorate_joiners: bool = True
    cycle_start_month: int = Field(default=1, ge=1, le=12)
    carry_forward: LeaveCarry = "none"
    carry_cap_days: float = Field(default=0, ge=0, le=366)
    carry_expires_after_months: int | None = Field(default=None, ge=1, le=12)
    max_balance_days: float | None = Field(default=None, ge=0, le=999)
    allow_negative_days: float = Field(default=0, ge=0, le=366)
    max_consecutive_days: int | None = Field(default=None, ge=1, le=366)
    include_holidays: bool = False
    statutory_note: str = Field(default="", max_length=400)
    active: bool = True


class LeaveTypeCreate(LeaveTypeBase):
    code: str = Field(pattern=r"^[a-z][a-z0-9_]{0,29}$")


class LeaveTypeUpdate(BaseModel):
    """Any LeaveTypeBase field; the code never changes (requests keep it)."""
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    paid: bool | None = None
    requires_balance: bool | None = None
    counts_as: LeaveCountsAs | None = None
    allow_half_day: bool | None = None
    approval: LeaveApproval | None = None
    grant_mode: LeaveGrantMode | None = None
    days_per_year: float | None = Field(default=None, ge=0, le=366)
    accrual_start_after_days: int | None = Field(default=None, ge=0, le=3650)
    prorate_joiners: bool | None = None
    cycle_start_month: int | None = Field(default=None, ge=1, le=12)
    carry_forward: LeaveCarry | None = None
    carry_cap_days: float | None = Field(default=None, ge=0, le=366)
    carry_expires_after_months: int | None = Field(default=None, ge=1, le=12)
    max_balance_days: float | None = Field(default=None, ge=0, le=999)
    allow_negative_days: float | None = Field(default=None, ge=0, le=366)
    max_consecutive_days: int | None = Field(default=None, ge=1, le=366)
    include_holidays: bool | None = None
    statutory_note: str | None = Field(default=None, max_length=400)
    active: bool | None = None


class LeaveTypeOut(LeaveTypeBase):
    id: str
    code: str


class LedgerEntryOut(BaseModel):
    id: str
    leave_type_id: str
    leave_type: str
    cycle_start: date
    entry: str
    days: float
    period_key: str | None
    ref_request_id: str | None
    note: str
    created_at: datetime


class LedgerAdjust(BaseModel):
    employee_id: UUID
    leave_type_id: UUID
    days: float = Field(ge=-366, le=366)
    note: str = Field(min_length=1, max_length=300)

    @model_validator(mode="after")
    def _nonzero(self):
        if self.days == 0:
            raise ValueError("An adjustment needs a number of days")
        if round(self.days * 2) != self.days * 2:
            raise ValueError("Adjust in whole or half days")
        return self


# ─── Payroll, Phase 3 (3F) ───────────────────────────────────────────────────
# Request/response models live in app/payroll_models.py; the enum-like values
# are here so tests/core/test_enum_checks.py finds them with the rest.
CompensationReason = Literal["joining", "increment", "promotion", "correction", "adjustment"]
COMPENSATION_REASONS = list(get_args(CompensationReason))
PaymentMode = Literal["bank", "cash", "cheque"]
PAYMENT_MODES = list(get_args(PaymentMode))
ComponentKind = Literal["earning", "deduction"]
COMPONENT_KINDS = list(get_args(ComponentKind))
ComponentCalc = Literal["fixed", "percent", "formula"]
COMPONENT_CALCS = list(get_args(ComponentCalc))
PayslipLineKind = Literal["earning", "deduction", "employer_contribution", "info"]
PAYSLIP_LINE_KINDS = list(get_args(PayslipLineKind))
RunKind = Literal["regular", "adjustment"]
RUN_KINDS = list(get_args(RunKind))
RunPurpose = Literal["payroll", "correction", "recompute_tax_year"]
RUN_PURPOSES = list(get_args(RunPurpose))
RunStatus = Literal["draft", "calculating", "review", "approved", "paid", "locked", "cancelled", "failed"]
RUN_STATUSES = list(get_args(RunStatus))
OneOffStatus = Literal["pending", "applied", "void"]
ONE_OFF_STATUSES = list(get_args(OneOffStatus))
AdvanceStatus = Literal["active", "closed", "void"]
ADVANCE_STATUSES = list(get_args(AdvanceStatus))
StatutoryAuthority = Literal["federal", "punjab", "sindh", "kp", "balochistan"]
STATUTORY_AUTHORITIES = list(get_args(StatutoryAuthority))
StatutoryBaseKind = Literal["fixed_base", "min_wage", "actual_wage", "actual_wage_capped"]
STATUTORY_BASE_KINDS = list(get_args(StatutoryBaseKind))
