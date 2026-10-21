"""The province an employee works in — it picks PESSI vs SESSI, the EOBI base
and the minimum wage (D-45, St03 §6.6).

ONE function, `resolve_work_provinces`, answers it for payroll: the
province of the employee's work location (hrms_locations.province, 0065)
first, then the tenant's FBR seller province, then nothing. The `source`
string is written into payslip explains, so a figure always says where its
province came from.
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
    out: dict[str, tuple[str | None, str]] = {eid: (code, source) for eid in employee_ids}
    for r in await conn.fetch(
            """select e.id, loc.name, loc.province from hrms_employees e
                 join hrms_locations loc on loc.id = e.location_id
                where e.id = any($1::uuid[]) and loc.province is not null""", employee_ids):
        out[str(r["id"])] = (r["province"], f"work location {r['name']} ({r['province']})")
    return out
