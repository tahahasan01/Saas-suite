"""The API image installs requirements.lock with --require-hashes (gate I1).

A dependency added to requirements.txt but not re-locked would make the
image build fail far from the change; this catches it at test time.
Fix: `sh services/api/scripts/lock_deps.sh`.
"""
from __future__ import annotations

import re
from pathlib import Path

API = Path(__file__).resolve().parents[2]
_NAME = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)")


def _norm(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _requirements() -> set[str]:
    names = set()
    for line in (API / "requirements.txt").read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line and not line.startswith("-"):
            names.add(_norm(_NAME.match(line).group(1)))
    return names


def _locked() -> dict[str, list[str]]:
    """name -> its --hash lines."""
    pins: dict[str, list[str]] = {}
    current = None
    for line in (API / "requirements.lock").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([A-Za-z0-9][A-Za-z0-9._-]*)==\S+", line)
        if m:
            current = _norm(m.group(1))
            pins[current] = []
        elif current and "--hash=sha256:" in line:
            pins[current].append(line.strip())
    return pins


def test_every_requirement_is_locked():
    missing = _requirements() - set(_locked())
    assert not missing, f"not in requirements.lock (run scripts/lock_deps.sh): {sorted(missing)}"


def test_every_locked_package_is_exact_and_hashed():
    locked = _locked()
    assert locked
    unhashed = [name for name, hashes in locked.items() if not hashes]
    assert not unhashed, unhashed


def test_test_tools_stay_out_of_the_runtime_set():
    assert not {"pytest", "pytest-asyncio", "hypothesis", "pip-tools"} & set(_locked())
