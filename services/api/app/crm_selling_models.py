"""Request and response models for CRM selling (wave D): deal lines and the
selling settings. Enum Literals live in app/models.py, next to the others
the database CHECKs are compared with."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import QuoteStatus


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
