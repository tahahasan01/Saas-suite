"""Pakistani IBAN validation for payroll bank details and the bank file
(St03 §6.5 "Bank payout", checklist 3F). A PK IBAN is 24 characters: PK, two
check digits, a 4-letter bank code and a 16-digit account number, and it
passes the ISO 13616 mod-97 check."""
from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app import iban

GOOD = "PK36SCBL0000001123456702"


def test_a_valid_iban_passes_and_is_normalised():
    assert iban.validate(GOOD) == GOOD
    # People paste them with spaces and in lower case.
    assert iban.validate("pk36 scbl 0000 0011 2345 6702") == GOOD


@pytest.mark.parametrize("value, reason", [
    ("", "missing"),
    ("PK36SCBL000000112345670", "length"),        # 23 characters
    ("PK36SCBL00000011234567021", "length"),      # 25 characters
    ("GB82WEST12345698765432", "country"),
    ("PK36SC1L0000001123456702", "format"),       # bank code must be letters
    ("PK36SCBL00000011234567A2", "format"),       # account must be digits
    ("PK37SCBL0000001123456702", "checksum"),
    ("PK36SCBL0000001123456703", "checksum"),
])
def test_invalid_ibans_say_why(value, reason):
    with pytest.raises(iban.InvalidIban) as e:
        iban.validate(value)
    assert e.value.reason == reason
    assert iban.problem(value) == reason


def test_problem_is_none_for_a_good_iban():
    assert iban.problem(GOOD) is None


def test_mask_keeps_the_country_and_last_four():
    assert iban.mask(GOOD) == "PK** **** **** **** **** 6702"
    assert iban.mask("") == ""


@given(st.text(max_size=40))
def test_validate_never_raises_anything_but_invalid_iban(value):
    try:
        out = iban.validate(value)
    except iban.InvalidIban:
        return
    assert len(out) == 24 and out.startswith("PK")


@given(st.text(alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ", min_size=4, max_size=4),
       st.text(alphabet="0123456789", min_size=16, max_size=16))
def test_check_digits_computed_by_us_always_validate(bank, account):
    assert iban.validate(iban.with_check_digits(bank, account)).endswith(account)
