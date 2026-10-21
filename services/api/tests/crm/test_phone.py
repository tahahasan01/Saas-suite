"""The Pakistani phone normaliser (St02 P0): one module shared by contacts,
POS lookup and (Phase 4) WhatsApp, so a number typed any way a shop types it
lands on the same E.164 key."""
from __future__ import annotations

import re

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.phone import is_mobile, normalize_email, normalize_phone

CASES = [
    # mobiles, every way they get typed
    ("03001234567", "+923001234567"),
    ("0300-1234567", "+923001234567"),
    ("0300 123 4567", "+923001234567"),
    ("+92 300 1234567", "+923001234567"),
    ("+92-300-1234567", "+923001234567"),
    ("+92 (0) 300 1234567", "+923001234567"),
    ("923001234567", "+923001234567"),
    ("00923001234567", "+923001234567"),
    ("3001234567", "+923001234567"),
    ("0333.111.2233", "+923331112233"),
    ("(0345) 1234567", "+923451234567"),
    ("  03211234567  ", "+923211234567"),
    ("٠٣٠٠١٢٣٤٥٦٧", "+923001234567"),          # Arabic-Indic digits from an Urdu keyboard
    # landlines with the city code
    ("021-34567890", "+922134567890"),          # Karachi, 8-digit subscriber
    ("042 35761234", "+924235761234"),          # Lahore
    ("051-2345678", "+92512345678"),            # Islamabad, 7-digit subscriber
    ("+92 51 2345678", "+92512345678"),
    ("(091) 5701234", "+92915701234"),          # Peshawar
    ("0992-123456", "+92992123456"),            # Abbottabad, 3-digit code
    ("0800-12345", "+9280012345"),              # toll-free
    # other countries keep their own code
    ("+44 20 7946 0958", "+442079460958"),
    ("00971501234567", "+971501234567"),
    # not a number we can place
    ("", None),
    ("   ", None),
    ("n/a", None),
    ("12345", None),                           # too short
    ("5761234", None),                         # landline without a city code
    ("0300123456", None),                      # mobile one digit short
    ("030012345678", None),                    # one digit long
    ("+92 300 12345678", None),
    ("+1", None),
    ("0000000000", None),
]


@pytest.mark.parametrize("raw,expected", CASES)
def test_known_inputs(raw, expected):
    assert normalize_phone(raw) == expected


def test_none_is_none():
    assert normalize_phone(None) is None


def test_mobile_detection():
    assert is_mobile("+923001234567")
    assert not is_mobile("+922134567890")
    assert not is_mobile("+442079460958")
    assert not is_mobile(None)


@pytest.mark.parametrize("raw,expected", [
    ("Bilal@Khan.PK ", "bilal@khan.pk"),
    ("  a@b.co", "a@b.co"),
    ("", None),
    ("not-an-email", None),
    (None, None),
])
def test_email_normalisation(raw, expected):
    assert normalize_email(raw) == expected


# ── Properties ──────────────────────────────────────────────────────────────
E164 = re.compile(r"^\+[1-9]\d{7,14}$")
subscriber = st.text(alphabet="0123456789", min_size=7, max_size=7)
operator = st.sampled_from(["300", "301", "311", "321", "333", "345", "355"])


@settings(max_examples=300)
@given(st.text(max_size=40))
def test_any_text_yields_e164_or_none_and_never_raises(raw):
    out = normalize_phone(raw)
    assert out is None or E164.match(out)


@settings(max_examples=300)
@given(st.text(max_size=40))
def test_idempotent(raw):
    out = normalize_phone(raw)
    if out is not None:
        assert normalize_phone(out) == out


@settings(max_examples=200)
@given(operator, subscriber, st.sampled_from(["0{o}{s}", "+92{o}{s}", "0092{o}{s}", "92{o}{s}",
                                              "{o}{s}", "0{o}-{s}", "+92 {o} {s}", "(0{o}) {s}"]))
def test_every_spelling_of_a_mobile_meets_on_one_key(op, sub, fmt):
    assert normalize_phone(fmt.format(o=op, s=sub)) == f"+92{op}{sub}"
