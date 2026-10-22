"""Request and response models for CRM selling (wave D): deal lines and the
selling settings. Enum Literals live in app/models.py, next to the others
the database CHECKs are compared with."""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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


class CrmSettingsOut(BaseModel):
    max_discount_pct: float | None = None


class CrmSettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_discount_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
