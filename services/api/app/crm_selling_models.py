"""Request and response models for CRM selling (wave D): deal lines and the
selling settings. Enum Literals live in app/models.py, next to the others
the database CHECKs are compared with."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import (
    CampaignStatus,
    CustomFieldEntity,
    CustomFieldKind,
    ContactKind,
    ContactRole,
    ConsentStatus,
    MessageChannel,
    QuoteStatus,
    RecipientStatus,
    SkipReason,
    TargetMetric,
    WebFormField,
)


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
    campaign_daily_cap: int = 500
    quote_require_signature: bool = False


class CrmSettingsIn(BaseModel):
    """Only the fields sent change."""
    model_config = ConfigDict(extra="forbid")
    max_discount_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    campaign_daily_cap: int | None = Field(default=None, ge=0, le=100000)
    quote_require_signature: bool | None = None


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
    signed: bool = False                 # a drawn signature came with the acceptance (0131)


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
    last_emailed_at: datetime | None = None


QuotePublicStatus = Literal["open", "accepted", "declined", "expired"]


class QuotePublic(QuoteTotals):
    """What the customer sees: the document and the business's own details,
    nothing else (no ids, no notes, no list prices)."""
    status: QuotePublicStatus
    business: dict[str, str]
    signature_required: bool = False


class QuoteAccept(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    content_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    # A drawn signature as the canvas exports it: "data:image/png;base64,…" (checked in app/quotes.py).
    signature: str | None = Field(default=None, max_length=270_000)

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
    consent_label: str = Field(default="", max_length=200)   # the marketing tick's wording; empty: not asked


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
    consent_label: str | None = Field(default=None, max_length=200)
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
    consent_label: str = ""


class WebFormPublic(BaseModel):
    """What a visitor's browser gets: the form, never its routing."""
    title: str
    intro: str
    fields: list[WebFormField]
    business_name: str
    ticket: str
    consent_label: str | None = None    # shown beside the marketing tick, when the form asks


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
    consent: bool = False              # the marketing tick (ignored when the form doesn't ask)


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


# ── Consent, segments, templates, campaigns (0124) ──────────────────────────
class ConsentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    channel: MessageChannel
    status: ConsentStatus
    source: str = Field(default="", max_length=120)


class ConsentOut(BaseModel):
    channel: MessageChannel
    status: ConsentStatus
    source: str
    updated_at: datetime


class SegmentFilter(BaseModel):
    """The only things a segment can filter on (compiled to parameterised SQL)."""
    model_config = ConfigDict(extra="forbid")
    tag_ids: list[UUID] = Field(default_factory=list, max_length=20)
    kind: ContactKind | None = None
    roles: list[ContactRole] = Field(default_factory=list, max_length=6)
    city: str | None = Field(default=None, max_length=80)
    has_email: bool | None = None
    # Contact custom field values, all of which must match (checked against the definitions on save).
    custom: dict[str, Any] = Field(default_factory=dict, max_length=10)


class SegmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    filter: SegmentFilter = Field(default_factory=SegmentFilter)


class SegmentOut(BaseModel):
    id: str
    name: str
    filter: SegmentFilter
    created_at: datetime


class SegmentPreview(BaseModel):
    total: int
    reachable: int
    skipped: dict[str, int]
    sample: list[PersonOut]


class TemplateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    channel: MessageChannel = "email"
    subject: str = Field(default="", max_length=200)
    body: str = Field(min_length=1, max_length=10000)


class TemplateOut(BaseModel):
    id: str
    name: str
    channel: MessageChannel
    subject: str
    body: str
    created_at: datetime


class CampaignIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    channel: MessageChannel = "email"
    segment_id: UUID
    template_id: UUID


class CampaignOut(BaseModel):
    id: str
    name: str
    channel: MessageChannel
    segment_id: str
    template_id: str
    status: CampaignStatus
    queued_count: int
    skipped_count: int
    sent_at: datetime | None
    created_at: datetime


class RecipientOut(BaseModel):
    contact_id: str
    name: str
    address: str
    status: RecipientStatus
    skip_reason: SkipReason | None


class UnsubscribePage(BaseModel):
    business_name: str
    channel: MessageChannel
    done: bool


# ── Custom fields (0127) ────────────────────────────────────────────────────
class CustomFieldIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entity: CustomFieldEntity
    label: str = Field(min_length=1, max_length=80)
    kind: CustomFieldKind
    options: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("options")
    @classmethod
    def _choices(cls, v: list[str]) -> list[str]:
        out = list(dict.fromkeys(o.strip() for o in v if o.strip()))
        if any(len(o) > 80 for o in out):
            raise ValueError("A choice can be at most 80 characters")
        return out


class CustomFieldPatch(BaseModel):
    """The kind can't change under existing values: retire the field and add another."""
    model_config = ConfigDict(extra="forbid")
    label: str | None = Field(default=None, min_length=1, max_length=80)
    options: list[str] | None = Field(default=None, max_length=50)
    position: int | None = Field(default=None, ge=0, le=1000)
    archived: bool | None = None


class CustomFieldOut(BaseModel):
    id: str
    entity: CustomFieldEntity
    key: str
    label: str
    kind: CustomFieldKind
    options: list[str]
    position: int
    archived: bool


class QuoteEmail(BaseModel):
    """No address: the deal's contact's email."""
    model_config = ConfigDict(extra="forbid")
    to: str | None = Field(default=None, max_length=200)


class QuoteEmailed(BaseModel):
    to: str


# ── Assignment rules (0130) ─────────────────────────────────────────────────
class AssignmentRuleIn(BaseModel):
    """Leads whose source and/or city match go, in turn, to these pool members."""
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    source: str | None = Field(default=None, max_length=60)
    city: str | None = Field(default=None, max_length=80)
    user_ids: list[UUID] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def _trimmed(self) -> AssignmentRuleIn:
        # "Needs a source or a city" is checked by the endpoint, after the ids.
        self.source = (self.source or "").strip() or None
        self.city = (self.city or "").strip() or None
        return self


class AssignmentRulesPut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rules: list[AssignmentRuleIn] = Field(max_length=50)


class AssignmentRuleOut(BaseModel):
    id: str
    position: int
    name: str
    source: str | None
    city: str | None
    user_ids: list[str]



class ConsentConfirmPage(BaseModel):
    """What the confirmation page shows: who is asking, and whether it's done."""
    business_name: str
    done: bool
