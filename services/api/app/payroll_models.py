"""Request/response models for payroll (Phase 3, 3F). Enum-like values are
Literals in app/models.py, next to the database CHECKs they mirror."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field

from .models import (
    ComponentCalc,
    ComponentKind,
    CompensationReason,
    PaymentMode,
    PayrollOut,
    Payslip,
    RunKind,
)


# ── Runs (D-40) ─────────────────────────────────────────────────────────────
class RunCreate(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    pay_date: date | None = None        # default: the month's last day
    kind: RunKind = "regular"
    employee_ids: list[str] | None = Field(default=None, max_length=5000)
    note: str = Field(default="", max_length=300)


class RecomputeCreate(BaseModel):
    """The one-time "recompute this tax year" run (St03 risk 2)."""
    tax_year: str = Field(pattern=r"^TY\d{4}$")
    through_month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")   # last month paid under the old slabs
    pay_date: date | None = None
    note: str = Field(default="", max_length=300)


class RunAction(BaseModel):
    note: str = Field(default="", max_length=300)


class RunEventOut(BaseModel):
    from_status: str | None
    to_status: str
    actor_name: str | None
    note: str
    at: datetime


class PayslipSummary(BaseModel):
    id: str
    employee_id: str
    name: str
    gross_minor: int
    deductions_minor: int
    tax_minor: int
    net_minor: int
    employer_cost_minor: int
    tax_verified: bool
    statutory_verified: bool
    warnings: list[str] = Field(default_factory=list)
    error: str = ""


class RunOut(BaseModel):
    id: str
    number: str
    kind: str
    purpose: str
    period_start: date
    period_end: date
    pay_date: date
    tax_year: str
    status: str
    progress_done: int
    progress_total: int
    totals: dict[str, Any]
    error: str
    note: str
    cancel_reason: str
    adjusts_run_id: str | None
    created_at: datetime
    calculated_at: datetime | None
    approved_at: datetime | None
    paid_at: datetime | None
    locked_at: datetime | None


class RunDetail(RunOut):
    payslips: list[PayslipSummary]
    events: list[RunEventOut]
    rates_verified: bool
    unverified: list[str]


class PayslipDetail(PayslipSummary):
    run_id: str
    run_number: str
    run_kind: str
    run_status: str
    period_start: date
    period_end: date
    pay_date: date
    tax_year: str
    snapshot: dict[str, Any]
    period_days: int
    employed_days: int
    working_days: int
    present_days: int
    paid_leave_days: int
    unpaid_leave_days: int
    wfh_days: int
    absent_days: int
    half_days: int
    taxable_minor: int
    taxable_ytd_minor: int
    tax_ytd_minor: int
    projected_annual_taxable_minor: int
    annual_tax_minor: int
    notes: list[str] = Field(default_factory=list)
    lines: list["LineOut"] = Field(default_factory=list)


class PayslipLink(BaseModel):
    url: str
    expires_at: datetime


# ── Lines and the preview ───────────────────────────────────────────────────
class LineOut(BaseModel):
    code: str
    name: str
    kind: str
    amount_minor: int
    taxable: bool = False
    explain: dict[str, Any] = Field(default_factory=dict)


class PreviewPayslip(Payslip):
    """The legacy preview payslip plus the full calculation."""
    period_days: int = 0
    employed_days: int = 0
    deductions_minor: int = 0
    employer_cost_minor: int = 0
    statutory_verified: bool = True
    warnings: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    error: str | None = None
    lines: list[LineOut] = Field(default_factory=list)


class PreviewOut(PayrollOut):
    payslips: list[PreviewPayslip]   # type: ignore[assignment]  # a richer payslip, same fields first
    # False while any tax table, statutory rate or minimum wage in use is
    # unverified; `unverified` says which (D-45: the banner lists them).
    rates_verified: bool = True
    unverified: list[str] = Field(default_factory=list)


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


# ── Components and structures ───────────────────────────────────────────────
CODE = r"^[A-Z][A-Z0-9_]{0,23}$"


class ComponentIn(BaseModel):
    code: str = Field(pattern=CODE)
    name: str = Field(min_length=1, max_length=80)
    kind: ComponentKind = "earning"
    calc: ComponentCalc = "fixed"
    amount_minor: int = Field(default=0, ge=0, le=10**12)
    percent: float | None = Field(default=None, ge=0, le=1000)
    percent_of: str = Field(default="BASE", pattern=CODE)
    formula: str = Field(default="", max_length=500)
    taxable: bool = True
    prorate: bool = True
    sort: int = 0


class ComponentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    calc: ComponentCalc | None = None
    amount_minor: int | None = Field(default=None, ge=0, le=10**12)
    percent: float | None = Field(default=None, ge=0, le=1000)
    percent_of: str | None = Field(default=None, pattern=CODE)
    formula: str | None = Field(default=None, max_length=500)
    taxable: bool | None = None
    prorate: bool | None = None
    sort: int | None = None
    active: bool | None = None


class ComponentOut(ComponentIn):
    id: str
    active: bool


class StructureIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    component_ids: list[str] = Field(default_factory=list, max_length=40)
    active: bool = True


class StructureOut(BaseModel):
    id: str
    name: str
    active: bool
    components: list[ComponentOut]
    order: list[str]           # evaluation order (dependencies first)


# ── One-offs and advances ───────────────────────────────────────────────────
class OneOffIn(BaseModel):
    employee_id: str
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    code: str = Field(default="ONE_OFF", pattern=CODE)
    name: str = Field(min_length=1, max_length=80)
    kind: ComponentKind = "earning"
    amount_minor: int = Field(gt=0, le=10**12)
    taxable: bool = True
    note: str = Field(default="", max_length=300)


class OneOffOut(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    month: str
    code: str
    name: str
    kind: str
    amount_minor: int
    taxable: bool
    note: str
    status: str
    run_id: str | None


class AdvanceIn(BaseModel):
    employee_id: str
    principal_minor: int = Field(gt=0, le=10**12)
    installment_minor: int = Field(gt=0, le=10**12)
    start_month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    note: str = Field(default="", max_length=300)


class AdvanceOut(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    principal_minor: int
    installment_minor: int
    recovered_minor: int
    outstanding_minor: int
    start_month: str
    status: str
    note: str


# ── Statutory (D-45) ────────────────────────────────────────────────────────
class StatutoryRateOut(BaseModel):
    province: str | None
    effective_from: date
    base_kind: str
    base_minor: int | None
    employee_rate: float
    employer_rate: float
    coverage_wage_ceiling_minor: int | None
    source_ref: str
    verified: bool


class StatutorySchemeOut(BaseModel):
    code: str
    name: str
    authority: str
    province: str | None
    available: bool
    enabled: bool
    registration_no: str
    effective_from: date | None
    rates: list[StatutoryRateOut]


class MinimumWageOut(BaseModel):
    province: str
    effective_from: date
    monthly_minor: int
    source_ref: str
    verified: bool


class StatutoryOut(BaseModel):
    schemes: list[StatutorySchemeOut]
    minimum_wages: list[MinimumWageOut]
    rates_verified: bool


class RegistrationIn(BaseModel):
    enabled: bool = True
    registration_no: str = Field(default="", max_length=40)
    effective_from: date | None = None


PayslipDetail.model_rebuild()   # it names LineOut, defined further down
