"""The province an employee works in — it picks PESSI vs SESSI, the EOBI base
and the minimum wage (D-45, St03 §6.6).

ONE function, `resolve_work_provinces`, answers it for payroll. On this
branch no work location exists yet, so it falls back to the tenant's FBR
seller province (fbr_settings.seller_province), and to nothing when that is
blank. INTEGRATION: once hrms_locations.province (codes PB, SD, KP, BA, ICT,
GB, AJK) and hrms_employees.location_id land (3F hrorg), resolve from the
employee's location first and keep the FBR province only as the fallback.
The `source` string is written into payslip explains, so a figure always
says where its province came from.
"""
from __future__ import annotations

from typing import Any

PROVINCES = ("PB", "SD", "KP", "BA", "ICT", "GB", "AJK")

_NAMES = {
    "PB": ("punjab", "pb"),
    "SD": ("sindh", "sd"),
    "KP": ("khyber pakhtunkhwa", "khyber pakhtoonkhwa", "kpk", "kp", "nwfp"),
    "BA": ("balochistan", "baluchistan", "ba"),
    "ICT": ("islamabad", "islamabad capital territory", "capital territory", "federal", "ict"),
    "GB": ("gilgit baltistan", "gilgit-baltistan", "gb"),
    "AJK": ("azad jammu and kashmir", "azad jammu & kashmir", "azad kashmir", "ajk"),
}


def province_code(name: str) -> str | None:
    """'Punjab' / 'PUNJAB' / 'PB' → 'PB'; anything unknown → None."""
    key = " ".join(name.replace("_", " ").split()).lower()
    if not key:
        return None
    for code, names in _NAMES.items():
        if key in names:
            return code
    return None


async def resolve_work_provinces(conn: Any, employee_ids: list[str]) -> dict[str, tuple[str | None, str]]:
    """employee id → (province code or None, where it came from)."""
    seller = await conn.fetchval("select seller_province from fbr_settings")
    code = province_code(seller or "")
    source = f"tenant FBR seller province ({seller})" if code else "unknown: no work location or FBR province"
    return {eid: (code, source) for eid in employee_ids}
