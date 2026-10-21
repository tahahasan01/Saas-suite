"""Phone and email keys for matching people (St02 P0, D-30).

One normaliser shared by contacts, POS lookup and, in Phase 4, WhatsApp, so
"0300-1234567", "+92 300 1234567" and "3001234567" all land on the same
E.164 key. Numbers are signals, never identities: the caller decides what a
key shared by several people means (D-30: families and shops share numbers).

Pakistani numbering, as far as matching needs it:
  * mobiles are 3XX followed by 7 digits (10-digit national number);
  * landlines are a city code (21 Karachi, 42 Lahore, 51 Islamabad, 992
    Abbottabad, ...) plus the subscriber, 9 or 10 digits in all; a landline
    typed without its city code can't be placed, so it gets no key;
  * 0800 numbers are toll-free (8 digits after the 0).
Anything that isn't one of those returns None and the caller keeps the raw text.
"""
from __future__ import annotations

import re
import unicodedata

_SEPARATORS = frozenset(" -./()\t")
_MOBILE = re.compile(r"3\d{9}")
_LANDLINE = re.compile(r"[24-9]\d{8,9}")  # 3 is the mobile range
_TOLL_FREE = re.compile(r"800\d{5}")


def _digits(raw: str) -> tuple[bool, str] | None:
    """(had a leading '+', the digits) or None when the text holds anything
    other than digits and the usual separators. Any script's decimal digits
    count: an Urdu keyboard types ٠٣٠٠..."""
    text = raw.strip()
    plus = text.startswith("+")
    if plus:
        text = text[1:]
    out = []
    for ch in text:
        if ch in _SEPARATORS:
            continue
        value = unicodedata.decimal(ch, None)
        if value is None:
            return None
        out.append(str(value))
    return plus, "".join(out)


def _national(nsn: str) -> str | None:
    """+92 key for a Pakistani national significant number, if it is one."""
    if _MOBILE.fullmatch(nsn) or _LANDLINE.fullmatch(nsn) or _TOLL_FREE.fullmatch(nsn):
        return "+92" + nsn
    return None


def normalize_phone(raw: str | None) -> str | None:
    """E.164 (`+923001234567`) for a number typed any common way, else None."""
    if not raw:
        return None
    parsed = _digits(raw)
    if parsed is None:
        return None
    plus, digits = parsed
    if not plus and digits.startswith("00"):
        plus, digits = True, digits[2:]
    if plus:
        if digits.startswith("92"):
            rest = digits[2:]
            # "+92 (0) 300 ..." writes the trunk zero after the country code.
            return _national(rest[1:] if rest.startswith("0") else rest)
        # Another country: keep its code; E.164 allows 8 to 15 digits.
        if 8 <= len(digits) <= 15 and digits[0] != "0":
            return "+" + digits
        return None
    if digits.startswith("0"):
        return _national(digits[1:])
    # "923001234567": the country code without a plus. Only when what follows
    # is a whole Pakistani number, so a bare national number starting 92...
    # (Kohat is 922) still reads as national below.
    if digits.startswith("92") and len(digits) in (11, 12):
        key = _national(digits[2:])
        if key:
            return key
    return _national(digits)


def is_mobile(e164: str | None) -> bool:
    """A Pakistani mobile: the numbers WhatsApp and SMS can reach."""
    return e164 is not None and e164.startswith("+923") and len(e164) == 13


def normalize_email(raw: str | None) -> str | None:
    """Lower-cased, trimmed address, or None when it isn't one."""
    if not raw:
        return None
    email = raw.strip().lower()
    local, at, domain = email.partition("@")
    if not at or not local or not domain or "@" in domain or " " in email:
        return None
    return email
