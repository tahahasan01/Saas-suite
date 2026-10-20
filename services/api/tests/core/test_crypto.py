"""Envelope encryption for credentials stored in the database (S14, TR-SEC-50).

The key ring is passed in explicitly, so these run without a database and
without touching the process-wide settings.
"""
from __future__ import annotations

import base64
import os

import pytest

from app import crypto


def _key() -> str:
    return base64.b64encode(os.urandom(32)).decode()


K1, K2 = _key(), _key()
RING = crypto.KeyRing.parse(f'{{"k1": "{K1}"}}', "k1")
AAD = crypto.aad("11111111-1111-1111-1111-111111111111", "fbr_settings", "token")


def test_round_trip():
    blob = crypto.encrypt("sandbox-token-123", AAD, ring=RING)
    assert crypto.decrypt(blob, AAD, ring=RING) == "sandbox-token-123"


def test_ciphertext_never_contains_the_plaintext_and_is_never_repeated():
    secret = "a-very-recognisable-bearer-token"
    a = crypto.encrypt(secret, AAD, ring=RING)
    b = crypto.encrypt(secret, AAD, ring=RING)
    assert secret.encode() not in a
    assert a != b  # fresh data key and nonce per value
    assert a.startswith(b"v1:k1:")


def test_a_value_copied_to_another_tenant_or_column_does_not_decrypt():
    blob = crypto.encrypt("t", AAD, ring=RING)
    other_tenant = crypto.aad("22222222-2222-2222-2222-222222222222", "fbr_settings", "token")
    other_column = crypto.aad("11111111-1111-1111-1111-111111111111", "fbr_settings", "other")
    for wrong in (other_tenant, other_column):
        with pytest.raises(crypto.DecryptError):
            crypto.decrypt(blob, wrong, ring=RING)


def test_tampering_is_detected():
    blob = bytearray(crypto.encrypt("t", AAD, ring=RING))
    blob[-1] ^= 1
    with pytest.raises(crypto.DecryptError):
        crypto.decrypt(bytes(blob), AAD, ring=RING)


def test_rotation_old_values_still_read_new_values_use_the_active_key():
    old = crypto.encrypt("t", AAD, ring=RING)
    rotated = crypto.KeyRing.parse(f'{{"k1": "{K1}", "k2": "{K2}"}}', "k2")
    assert crypto.decrypt(old, AAD, ring=rotated) == "t"
    assert crypto.key_id(old) == "k1"
    assert crypto.encrypt("t", AAD, ring=rotated).startswith(b"v1:k2:")


def test_an_unknown_key_is_an_error_not_garbage():
    blob = crypto.encrypt("t", AAD, ring=RING)
    only_k2 = crypto.KeyRing.parse(f'{{"k2": "{K2}"}}', "k2")
    with pytest.raises(crypto.DecryptError):
        crypto.decrypt(blob, AAD, ring=only_k2)


@pytest.mark.parametrize("keys, active", [
    ("not json", "k1"),
    ('{"k1": "c2hvcnQ="}', "k1"),            # 5 bytes, not 32
    (f'{{"k1": "{K1}"}}', "k9"),               # active key missing
    (f'{{"bad:id": "{K1}"}}', "bad:id"),       # ':' is the blob separator
])
def test_bad_key_configuration_is_refused(keys, active):
    with pytest.raises(ValueError):
        crypto.KeyRing.parse(keys, active)


def test_the_dev_key_is_flagged_so_production_can_refuse_it():
    assert crypto.KeyRing.parse("", "").is_dev
    assert not RING.is_dev


# ── Fail closed in production (coordinator security review) ────────────────

@pytest.fixture
def production_without_keys(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "node_env", "production")
    monkeypatch.setattr(settings, "bos_data_keys", "")
    monkeypatch.setattr(settings, "bos_data_key_active", "")
    monkeypatch.setattr(crypto, "_ring", None)  # re-read; restored after the test


def test_production_never_falls_back_to_the_dev_key(production_without_keys):
    with pytest.raises(crypto.KeyConfigError):
        crypto.encrypt("t", AAD)
    blob = crypto.encrypt("t", AAD, ring=crypto.KeyRing.parse("", ""))  # a dev-key blob
    with pytest.raises(crypto.KeyConfigError):
        crypto.decrypt(blob, AAD)
