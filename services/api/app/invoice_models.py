"""Request and response models for invoices v2 (3E). The enum Literals live
in app/models.py, next to the others the database CHECKs are compared with."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .models import InvoicePaymentMethod


class InvoiceLineIn(BaseModel):
    description: str = Field(min_length=1, max_length=300)
    qty: Decimal = Field(gt=0, le=Decimal("999999999"), decimal_places=3)
    unit_price_minor: int = Field(ge=0, le=10**13)
    line_discount_minor: int = Field(default=0, ge=0, le=10**13)
    tax_code: str | None = Field(default=None, max_length=40)
    product_id: UUID | None = None


class InvoiceCreate(BaseModel):
    """A draft; `submit` sends it straight for approval."""
    contact_id: UUID | None = None
    lead_id: UUID | None = None      # given alone, the lead's contact is billed
    due_date: date | None = None
    tax_inclusive: bool = False
    discount_minor: int = Field(default=0, ge=0, le=10**13)
    notes: str = Field(default="", max_length=4000)
    lines: list[InvoiceLineIn] = Field(min_length=1, max_length=200)
    submit: bool = False


class InvoiceUpdate(BaseModel):
    """Draft or awaiting approval only; `lines` replaces them all."""
    model_config = ConfigDict(extra="forbid")
    contact_id: UUID | None = None
    due_date: date | None = None
    tax_inclusive: bool | None = None
    discount_minor: int | None = Field(default=None, ge=0, le=10**13)
    notes: str | None = Field(default=None, max_length=4000)
    lines: list[InvoiceLineIn] | None = Field(default=None, min_length=1, max_length=200)


class Reason(BaseModel):
    reason: str = Field(default="", max_length=500)


class PaymentIn(BaseModel):
    method: InvoicePaymentMethod
    amount_minor: int = Field(gt=0, le=10**13)
    paid_on: date
    reference: str = Field(default="", max_length=120)


class CreditNoteIn(BaseModel):
    """No amount = credit the whole invoice, line by line (tax included)."""
    reason: str = Field(min_length=1, max_length=500)
    amount_minor: int | None = Field(default=None, gt=0, le=10**13)


class InvoiceLineOut(BaseModel):
    id: str
    position: int
    description: str
    qty: float
    unit_price_minor: int
    line_discount_minor: int
    share_minor: int
    tax_code: str | None
    tax_rate_pct: float
    net_excl_minor: int
    tax_minor: int
    total_minor: int
    product_id: str | None


class PaymentOut(BaseModel):
    id: str
    method: str
    amount_minor: int
    paid_on: date
    reference: str
    created_at: datetime


class InvoiceSummary(BaseModel):
    id: str
    kind: str
    number: str | None
    legacy_ref: str | None
    status: str
    contact_id: str | None
    contact_name: str | None
    lead_id: str | None
    lead_name: str | None
    issue_date: date | None
    due_date: date | None
    total_minor: int
    paid_minor: int
    credited_minor: int
    balance_minor: int
    overdue: bool
    created_at: datetime


class InvoiceDetail(InvoiceSummary):
    credit_of_id: str | None
    tax_inclusive: bool
    subtotal_minor: int
    line_discount_minor: int
    discount_minor: int
    tax_minor: int
    bill_to: dict[str, str]
    notes: str
    reason: str
    lines: list[InvoiceLineOut]
    payments: list[PaymentOut]
    credit_notes: list[InvoiceSummary]
    unverified_rates: bool
    last_sent_at: datetime | None = None    # last emailed to the customer (0125)


class InvoiceSend(BaseModel):
    """No address: the billed contact's email."""
    model_config = ConfigDict(extra="forbid")
    to: str | None = Field(default=None, max_length=200)


class InvoiceSent(BaseModel):
    to: str
