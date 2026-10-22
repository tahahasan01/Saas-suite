"""Request and response models for CRM selling (wave D): deal lines and the
selling settings. Enum Literals live in app/models.py, next to the others
the database CHECKs are compared with."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import QuoteStatus, TargetMetric, WebFormField


class DealLineIn(BaseModel):
    """The shape of an invoice line, so a deal's lines carry over unchanged.
    With a product, the server snapshots its unit and catalog price and marks
    a different price as typed by hand."""
    model_config = ConfigDict(extra="forbid")
    description: str = Field(min_length=1, max_length=300)
    qty: Decimal = Field(gt=0, le=Decimal("999999999"), decimal_places=3)
    unit_price_minor: int = Field(ge=0, le=10**13)
    line_discount_minor: int = Field(default=0, ge=0, le=10**13)
    tax_code: str | None = Field(default=None, max_length=40)
    product_id: UUID | None = None


class DealLinesPut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lines: list[DealLineIn] = Field(max_length=200)
    tax_inclusive: bool = False


class DealLineOut(BaseModel):
    id: str
    position: int
    product_id: str | None
    description: str
    unit: str
    qty: float
    unit_price_minor: int
    list_price_minor: int | None
    price_overridden: bool
    line_discount_minor: int
    tax_code: str | None
    tax_rate_pct: float
    gross_minor: int
    net_excl_minor: int
    tax_minor: int
    total_minor: int


class DealLines(BaseModel):
    lead_id: str
    tax_inclusive: bool
    lines: list[DealLineOut]
    subtotal_minor: int          # sum of gross
    line_discount_minor: int
    net_minor: int               # pre-tax: what the deal is worth in the pipeline
    tax_minor: int
    total_minor: int             # what the customer would pay


class DealProductOut(BaseModel):
    """What the line editor's picker needs from the catalog."""
    id: str
    name: str
    unit: str
    price_minor: int


class CrmSettingsOut(BaseModel):
    max_discount_pct: float | None = None


class CrmSettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_discount_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)


# ── Quotes (0121) ───────────────────────────────────────────────────────────
class QuoteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    valid_until: date | None = None      # default: 15 days from the business date
    terms: str = Field(default="", max_length=4000)


class QuoteLineOut(BaseModel):
    description: str
    unit: str
    qty: float
    unit_price_minor: int
    line_discount_minor: int
    tax_rate_pct: float
    net_excl_minor: int
    tax_minor: int
    total_minor: int


class QuoteTotals(BaseModel):
    number: str
    valid_until: date
    terms: str
    customer_name: str
    tax_inclusive: bool
    lines: list[QuoteLineOut]
    subtotal_minor: int
    line_discount_minor: int
    net_minor: int
    tax_minor: int
    total_minor: int
    content_hash: str
    accepted_name: str | None = None
    accepted_at: datetime | None = None


class QuoteOut(QuoteTotals):
    """What staff see. `link` is the page path while the quote is open."""
    id: str
    lead_id: str
    status: QuoteStatus
    expired: bool
    link: str | None
    created_at: datetime
    first_viewed_at: datetime | None
    view_count: int
    accepted_ip: str | None
    declined_at: datetime | None
    decline_reason: str | None
    invoice_id: str | None


QuotePublicStatus = Literal["open", "accepted", "declined", "expired"]


class QuotePublic(QuoteTotals):
    """What the customer sees: the document and the business's own details,
    nothing else (no ids, no notes, no list prices)."""
    status: QuotePublicStatus
    business: dict[str, str]


class QuoteAccept(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    content_hash: str = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("name")
    @classmethod
    def _named(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Type your name to accept")
        return v.strip()


class QuoteDecline(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(default="", max_length=1000)


class QuoteInvoiced(BaseModel):
    invoice_id: str


# ── Web forms and assignment (0122) ─────────────────────────────────────────
DEFAULT_FORM_FIELDS: tuple[WebFormField, ...] = ("phone", "email", "message")


class WebFormIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    title: str = Field(default="", max_length=160)
    intro: str = Field(default="", max_length=1000)
    thank_you: str = Field(default="", max_length=500)
    fields: list[WebFormField] = Field(default_factory=lambda: list(DEFAULT_FORM_FIELDS), max_length=5)
    pipeline_id: UUID | None = None
    stage_id: UUID | None = None
    source: str = Field(default="web form", min_length=1, max_length=60)
    owner_id: UUID | None = None
    daily_cap: int = Field(default=200, ge=1, le=10000)


class WebFormPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=120)
    title: str | None = Field(default=None, max_length=160)
    intro: str | None = Field(default=None, max_length=1000)
    thank_you: str | None = Field(default=None, max_length=500)
    fields: list[WebFormField] | None = Field(default=None, max_length=5)
    pipeline_id: UUID | None = None
    stage_id: UUID | None = None
    source: str | None = Field(default=None, min_length=1, max_length=60)
    owner_id: UUID | None = None
    daily_cap: int | None = Field(default=None, ge=1, le=10000)
    active: bool | None = None


class WebFormOut(BaseModel):
    id: str
    public_id: str
    link: str
    name: str
    title: str
    intro: str
    thank_you: str
    fields: list[WebFormField]
    pipeline_id: str | None
    stage_id: str | None
    source: str
    owner_id: str | None
    daily_cap: int
    active: bool
    leads_today: int
    created_at: datetime


class WebFormPublic(BaseModel):
    """What a visitor's browser gets: the form, never its routing."""
    title: str
    intro: str
    fields: list[WebFormField]
    business_name: str
    ticket: str


class WebFormValues(BaseModel):
    """What a visitor may send. Unknown keys are dropped, not refused: a page
    can't learn anything from the answer. `website` is the honeypot."""
    model_config = ConfigDict(extra="ignore")
    name: str = Field(max_length=120)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=200)
    company: str = Field(default="", max_length=160)
    city: str = Field(default="", max_length=80)
    message: str = Field(default="", max_length=2000)
    website: str = Field(default="", max_length=500)
    utm_source: str = Field(default="", max_length=100)
    utm_medium: str = Field(default="", max_length=100)
    utm_campaign: str = Field(default="", max_length=100)


class WebFormSubmit(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ticket: str = Field(max_length=200)
    values: WebFormValues


class WebFormAnswer(BaseModel):
    message: str


class PoolMemberIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: UUID
    active: bool = True
    daily_cap: int | None = Field(default=None, ge=1, le=1000)


class PoolPut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    members: list[PoolMemberIn] = Field(max_length=200)


class PoolMemberOut(BaseModel):
    user_id: str
    name: str
    active: bool
    daily_cap: int | None
    assigned_today: int


class PersonOut(BaseModel):
    id: str
    name: str


# ── Targets and forecast (0123) ─────────────────────────────────────────────
MONTH = r"^\d{4}-(0[1-9]|1[0-2])$"


class TargetIn(BaseModel):
    """Set (or replace) the target for a month, person (none: the company) and measure."""
    model_config = ConfigDict(extra="forbid")
    month: str = Field(pattern=MONTH)
    metric: TargetMetric
    amount_minor: int = Field(gt=0, le=10**13)
    user_id: UUID | None = None


class TargetOut(BaseModel):
    id: str
    month: str
    user_id: str | None
    user_name: str | None
    metric: TargetMetric
    amount_minor: int
    achieved_minor: int
    percent: int
    pace_minor: int          # where an even pace would be by today


class TargetsOut(BaseModel):
    month: str
    targets: list[TargetOut]


class TargetCopy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    from_month: str = Field(pattern=MONTH)
    to_month: str = Field(pattern=MONTH)


class Copied(BaseModel):
    copied: int


class ForecastDeal(BaseModel):
    id: str
    name: str
    owner_id: str | None
    value_minor: int
    probability: int | None
    weighted_minor: int
    expected_close_date: date | None


class ForecastBucket(BaseModel):
    month: str | None = None
    won_minor: int = 0
    weighted_minor: int = 0
    best_case_minor: int = 0
    open_count: int = 0
    deals: list[ForecastDeal] = Field(default_factory=list)


class SalesForecastOut(BaseModel):
    months: list[ForecastBucket]
    overdue: ForecastBucket       # open deals whose close date has passed
    no_date: ForecastBucket       # open deals with no close date
