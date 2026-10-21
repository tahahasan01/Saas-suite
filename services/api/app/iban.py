"""Pakistani IBAN validation (ISO 13616, mod-97) for payroll bank details and
the bank file (St03 §6.5 "Bank payout").

A PK IBAN is 24 characters: ``PK``, two check digits, a 4-letter bank code
and a 16-digit account number. We validate the shape and the checksum; we
can't tell whether the account exists, so the bank file still names the
employee next to each IBAN for a human to eyeball.
"""
from __future__ import annotations

import re
from typing import Literal

Reason = Literal["missing", "length", "country", "format", "checksum"]

_SHAPE = re.compile(r"^PK\d{2}[A-Z]{4}\d{16}$")


class InvalidIban(ValueError):
    def __init__(self, reason: Reason) -> None:
        super().__init__(f"Not a valid Pakistani IBAN ({reason})")
        self.reason: Reason = reason


def normalise(value: str) -> str:
    return "".join(value.split()).upper()


def _mod97(s: str) -> int:
    rearranged = s[4:] + s[:4]
    # Letters become two-digit numbers (A=10 … Z=35); digits stay as they are.
    return int("".join(str(int(ch, 36)) for ch in rearranged)) % 97


def validate(value: str) -> str:
    """The normalised IBAN, or InvalidIban saying what is wrong."""
    s = normalise(value)
    if not s:
        raise InvalidIban("missing")
    # A foreign IBAN is a different length too; "not Pakistani" says more.
    if not s.startswith("PK"):
        raise InvalidIban("country")
    if len(s) != 24:
        raise InvalidIban("length")
    if not _SHAPE.match(s) or not s.isascii():
        raise InvalidIban("format")
    if _mod97(s) != 1:
        raise InvalidIban("checksum")
    return s


def problem(value: str) -> Reason | None:
    """What is wrong with `value`, or None when it is a valid PK IBAN."""
    try:
        validate(value)
    except InvalidIban as e:
        return e.reason
    return None


def with_check_digits(bank: str, account: str) -> str:
    """Build a PK IBAN with correct check digits (tests and sample data)."""
    body = f"{bank.upper()}{account}PK00"
    check = 98 - int("".join(str(int(ch, 36)) for ch in body)) % 97
    return f"PK{check:02d}{bank.upper()}{account}"


def mask(value: str) -> str:
    """Country and the last four only, grouped the way banks print them."""
    s = normalise(value)
    if not s:
        return ""
    hidden = s[:2] + "*" * (len(s) - 6) + s[-4:]
    return " ".join(hidden[i:i + 4] for i in range(0, len(hidden), 4))
