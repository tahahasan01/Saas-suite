"""Pydantic request/response schemas (the API contract)."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

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


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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
