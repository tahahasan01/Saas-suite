"""The web types its `can()` checks against PERMISSION_KEYS in packages/types.
If that list drifts from the API registry, a control can be gated on a key the
server never sends (always hidden) or a new key can't be used at all."""
from __future__ import annotations

import re
from pathlib import Path

from app import rbac

TYPES = Path(__file__).resolve().parents[4] / "packages" / "types" / "src" / "index.ts"


def _ts_keys(source: str) -> list[str]:
    block = re.search(r"export const PERMISSION_KEYS = \[(.*?)\] as const;", source, re.S)
    assert block, "PERMISSION_KEYS not found in packages/types"
    return re.findall(r'"([a-z_.]+)"', block.group(1))


def test_web_permission_keys_match_the_api_registry():
    ts = _ts_keys(TYPES.read_text(encoding="utf-8"))
    assert len(ts) == len(set(ts)), "duplicate key in packages/types"
    assert set(ts) == set(rbac.PERMISSIONS), (
        f"only in API: {sorted(set(rbac.PERMISSIONS) - set(ts))}; "
        f"only in web: {sorted(set(ts) - set(rbac.PERMISSIONS))}")
