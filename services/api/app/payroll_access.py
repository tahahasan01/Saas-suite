"""Who may see payroll identity and pay (D-42, St03 §7.10).

One place for the field guard so it can move onto the generic field guards
of RBAC v2 (3A) in one step: callers ask `sees_pay()` and mask with the
helpers below. Holding `payroll.salary.read` reveals salary, CNIC, IBAN, NTN,
EOBI and social-security numbers; HR without it sees their shape only.
"""
from __future__ import annotations

from typing import Any

from . import iban as iban_mod
from .rbac import holds


async def sees_pay(conn: Any, role_id: str | None) -> bool:
    return await holds(conn, role_id, "payroll.salary.read")


def mask_tail(value: str, keep: int = 1) -> str:
    """Digits and letters become '*' except the last `keep`; separators stay,
    so HR can tell records apart without reading the number."""
    if not value:
        return ""
    head, tail = value[:-keep] if keep else value, value[-keep:] if keep else ""
    return "".join("*" if ch.isalnum() else ch for ch in head) + tail


def mask_iban(value: str) -> str:
    return iban_mod.mask(value)


# The identity fields a payslip snapshot freezes (app/payroll_data.py).
_SNAPSHOT_MASKS = {"cnic": 4, "ntn": 1, "eobi_number": 1, "ss_number": 1}


def snapshot_view(snapshot: dict[str, Any], *, reveal: bool) -> dict[str, Any]:
    """THE one masking function for anything built from a payslip snapshot —
    the JSON payslip, the PDF, the statutory worksheets and the bank file all
    go through it, so no output can leak what another one hides."""
    if reveal:
        return dict(snapshot)
    out = dict(snapshot)
    for key, keep in _SNAPSHOT_MASKS.items():
        out[key] = mask_tail(str(snapshot.get(key) or ""), keep)
    out["iban"] = mask_iban(str(snapshot.get("iban") or ""))
    return out
