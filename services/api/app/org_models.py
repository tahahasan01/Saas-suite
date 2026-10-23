"""Request/response models for org data: company, branches, regions,
sequences, files, tax rates and branding (3A, migrations 0055–0058).

Kept out of models.py so parallel work doesn't collide there; the enum
Literals they use are in models.py with the others.
"""
from __future__ import annotations

import re
from datetime import date

from pydantic import BaseModel, Field, field_validator
from pydantic_core import PydanticCustomError

from .models import (
    REGION_CODES,
    BrandingLayout,
    FileMime,
    RegionCode,
    RegionKind,
    SequenceReset,
    TaxAppliesTo,
    TaxKind,
)

_NTN = re.compile(r"^(\d{7}(-\d)?|\d{13})$")
_STRN = re.compile(r"^(\d{13}|\d{7}(-\d)?)$")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _bad(message: str) -> PydanticCustomError:
    """A 422 whose message is just the words (no "Value error, " prefix)."""
    return PydanticCustomError("value_error", message)


def _blank_to_none(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


# ── Regions ─────────────────────────────────────────────────────────────────
class RegionOut(BaseModel):
    code: RegionCode
    name: str
    name_ur: str
    fbr_name: str
    kind: RegionKind
    pst_authority: str


# ── Company ─────────────────────────────────────────────────────────────────
class CompanyOut(BaseModel):
    name: str
    legal_name: str
    ntn: str | None
    strn: str | None
    address: str
    city: str
    phone: str
    email: str
    region_code: RegionCode | None
    timezone: str
    fy_start_month: int
    logo_file_id: str | None = None


class CompanyUpdate(BaseModel):
    """Every field optional; an empty string clears NTN, STRN and province."""
    name: str | None = Field(default=None, max_length=120)
    legal_name: str | None = Field(default=None, max_length=200)
    ntn: str | None = None
    strn: str | None = None
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=200)
    region_code: str | None = None
    timezone: str | None = Field(default=None, max_length=64)
    fy_start_month: int | None = Field(default=None, ge=1, le=12)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise _bad("Company name can't be empty")
        return v.strip() if v is not None else None

    @field_validator("ntn")
    @classmethod
    def _ntn(cls, v: str | None) -> str | None:
        if v is not None and v.strip() and not _NTN.match(v.strip()):
            raise _bad("NTN is 7 digits (optionally -check digit), or a 13-digit CNIC")
        return v

    @field_validator("strn")
    @classmethod
    def _strn(cls, v: str | None) -> str | None:
        if v is not None and v.strip() and not _STRN.match(v.strip()):
            raise _bad("STRN is 13 digits")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str | None) -> str | None:
        if v is not None and v.strip() and not _EMAIL.match(v.strip()):
            raise _bad("Enter a valid email address")
        return v

    @field_validator("region_code")
    @classmethod
    def _region(cls, v: str | None) -> str | None:
        if v is not None and v.strip() and v.strip() not in REGION_CODES:
            raise _bad("Unknown province")
        return v


# ── Branches ────────────────────────────────────────────────────────────────
class BranchOut(BaseModel):
    id: str
    code: str
    name: str
    address: str
    phone: str
    region_code: RegionCode | None
    timezone: str | None
    fbr_pos_id: str | None
    receipt_header: str | None
    is_default: bool
    active: bool


class BranchCreate(BaseModel):
    """A new branch or warehouse (stock per branch, 0091)."""
    code: str = Field(pattern=r"^[A-Z0-9]{2,8}$")
    name: str = Field(min_length=1, max_length=120)
    address: str = Field(default="", max_length=500)
    phone: str = Field(default="", max_length=40)
    region_code: RegionCode | None = None


class BranchUpdate(BaseModel):
    code: str | None = Field(default=None, pattern=r"^[A-Z0-9]{2,8}$")
    name: str | None = Field(default=None, min_length=1, max_length=120)
    address: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=40)
    region_code: RegionCode | None = None
    timezone: str | None = Field(default=None, max_length=64)
    fbr_pos_id: str | None = Field(default=None, max_length=40)
    receipt_header: str | None = Field(default=None, max_length=500)
    active: bool | None = None


class BranchBrief(BaseModel):
    """What /auth/me carries: enough to label and pick a branch."""
    id: str
    code: str
    name: str
    is_default: bool


# ── Sequences ───────────────────────────────────────────────────────────────
class SequenceOut(BaseModel):
    id: str
    code: str
    name: str
    branch_id: str | None
    register_id: str | None
    pattern: str
    padding: int
    reset: SequenceReset
    gapless: bool
    period_key: str          # the current period at today's date
    next_value: int          # what the next document in that period gets
    preview: str             # the next number, rendered


class SequenceUpdate(BaseModel):
    next_value: int = Field(ge=1, le=10**12)
    period_key: str | None = Field(default=None, max_length=16)


# ── Files ───────────────────────────────────────────────────────────────────
class FileOut(BaseModel):
    id: str
    mime: FileMime
    size_bytes: int
    sha256: str
    original_name: str


# ── Tax ─────────────────────────────────────────────────────────────────────
class TaxRateOut(BaseModel):
    id: str
    code: str
    kind: TaxKind
    name: str
    region_code: RegionCode | None
    rate_pct: float
    applies_to: TaxAppliesTo
    included_in_price: bool | None
    effective_from: date
    effective_to: date | None
    verified: bool
    source_ref: str


class TaxCategoryOut(BaseModel):
    code: str
    name: str
    description: str
    rate_codes: list[str]


class TaxRatesOut(BaseModel):
    on: date
    rates: list[TaxRateOut]
    # True while any rate in force on `on` is still unverified: the UI warns.
    unverified_in_use: bool


# ── Branding ────────────────────────────────────────────────────────────────
class BrandingOut(BaseModel):
    logo_file_id: str | None
    primary_color: str | None
    accent_color: str | None
    receipt_header: str
    receipt_footer: str
    invoice_header: str
    invoice_footer: str
    payslip_header: str
    receipt_width_mm: int
    layout: BrandingLayout
    version: int
    # Server-derived theme tokens (D-12): the colour scale and readable text colours.
    tokens: dict[str, str]


class BrandingUpdate(BaseModel):
    logo_file_id: str | None = None
    clear_logo: bool = False
    primary_color: str | None = None
    accent_color: str | None = None
    receipt_header: str | None = Field(default=None, max_length=500)
    receipt_footer: str | None = Field(default=None, max_length=500)
    invoice_header: str | None = Field(default=None, max_length=1000)
    invoice_footer: str | None = Field(default=None, max_length=1000)
    payslip_header: str | None = Field(default=None, max_length=500)
    receipt_width_mm: int | None = None
    layout: BrandingLayout | None = None

    @field_validator("primary_color", "accent_color")
    @classmethod
    def _hex(cls, v: str | None) -> str | None:
        if v is not None and v != "" and not _HEX.match(v):
            raise _bad("Use a hex colour like #0f766e")
        return v.lower() if v else v

    @field_validator("receipt_width_mm")
    @classmethod
    def _width(cls, v: int | None) -> int | None:
        if v is not None and v not in (58, 80):
            raise _bad("Receipt paper is 58 or 80 mm")
        return v


# ── My profile ──────────────────────────────────────────────────────────────
class ProfileOut(BaseModel):
    id: str
    name: str
    email: str
    locale: str


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    locale: str | None = Field(default=None, pattern=r"^(en|ur)$")

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise _bad("Name can't be empty")
        return v.strip() if v is not None else None


__all__ = [
    "BranchBrief", "BranchOut", "BranchUpdate", "BrandingOut", "BrandingUpdate", "CompanyOut",
    "CompanyUpdate", "FileOut", "ProfileOut", "ProfileUpdate", "RegionOut", "SequenceOut",
    "SequenceUpdate", "TaxCategoryOut", "TaxRateOut", "TaxRatesOut", "_blank_to_none",
]
