"""Request/response models for payroll (Phase 3, 3F). Enum-like values are
Literals in app/models.py, next to the database CHECKs they mirror."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from .models import CompensationReason, PaymentMode


# ── Compensation (D-42) ─────────────────────────────────────────────────────
class CompensationCreate(BaseModel):
    effective_from: date
    base_minor: int = Field(ge=0, le=10**12)     # monthly gross basis, paisa
    reason: CompensationReason = "increment"
    note: str = Field(default="", max_length=300)
    structure_id: str | None = None


class CompensationOut(BaseModel):
    id: str
    employee_id: str
    effective_from: date
    base_minor: int
    reason: str
    note: str
    structure_id: str | None = None
    structure_name: str | None = None
    created_at: datetime


# ── Payroll identity ────────────────────────────────────────────────────────
class PayrollDetailsUpdate(BaseModel):
    bank_name: str | None = Field(default=None, max_length=80)
    iban: str | None = Field(default=None, max_length=40)
    ntn: str | None = Field(default=None, max_length=20, pattern=r"^[0-9\- ]*$")
    eobi_number: str | None = Field(default=None, max_length=30)
    ss_number: str | None = Field(default=None, max_length=30)
    payment_mode: PaymentMode | None = None
    eobi_applicable: bool | None = None
    ss_applicable: bool | None = None
    statutory_note: str | None = Field(default=None, max_length=300)
    # Explicitly clearing an override back to "automatic" (null) needs a flag,
    # since a missing field means "leave as it is".
    eobi_auto: bool = False
    ss_auto: bool = False


class PayrollDetailsOut(BaseModel):
    employee_id: str
    bank_name: str
    iban: str            # masked unless the caller holds payroll.salary.read
    iban_valid: bool
    ntn: str
    eobi_number: str
    ss_number: str
    payment_mode: str
    eobi_applicable: bool | None
    ss_applicable: bool | None
    statutory_note: str
    masked: bool
    current_base_minor: int | None   # None when masked
    work_province: str | None = None
    work_province_source: str = ""
