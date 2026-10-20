"""Envelope encryption for credentials kept in the database (S14, TR-SEC-50).

A database dump — a backup, a support copy, a leaked replica — must not hand
out tenants' FBR tokens and other third-party credentials. Each value gets its
own random data key (AES-256-GCM); the data key is itself encrypted ("wrapped")
with a master key that lives only in the environment (BOS_DATA_KEYS), never in
the database or its backups. The value's AAD binds it to one tenant, table and
column, so a ciphertext pasted into another row does not decrypt.

Stored blob (bytea):
    b"v1:" + key_id + b":" + wrap_nonce(12) + wrapped_dek(48) + nonce(12) + ciphertext+tag

Rotation: add a new key to BOS_DATA_KEYS, make it BOS_DATA_KEY_ACTIVE, then run
`python -m scripts.encrypt_credentials --rekey`; old keys keep decrypting until
removed (docs: infra/README.md, "Secrets").
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
from dataclasses import dataclass

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

VERSION = b"v1"
_NONCE = 12
_WRAPPED = 32 + 16          # data key + GCM tag
_KEY_ID = re.compile(r"^[A-Za-z0-9_-]{1,32}$")

# Used only when no key is configured outside production, so dev and tests
# work out of the box. It is public (it is in this file), which is exactly why
# the startup guard refuses to boot production with it.
DEV_KEY_ID = "dev"
_DEV_KEY = hashlib.sha256(b"business-os dev-only data key - not a secret").digest()


class DecryptError(Exception):
    """Wrong key, wrong row/tenant (AAD), unknown key id, or a tampered blob."""


class KeyConfigError(RuntimeError):
    """No usable master key: production never falls back to the dev key."""


@dataclass(frozen=True)
class KeyRing:
    keys: dict[str, bytes]
    active: str

    @property
    def is_dev(self) -> bool:
        return self.keys.get(self.active) == _DEV_KEY

    @classmethod
    def parse(cls, raw: str, active: str) -> "KeyRing":
        """`raw` is JSON {key_id: base64(32 bytes)}; empty means the dev key."""
        if not raw.strip():
            return cls({DEV_KEY_ID: _DEV_KEY}, DEV_KEY_ID)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise ValueError("BOS_DATA_KEYS must be JSON: {\"key_id\": \"<base64 32 bytes>\"}") from e
        if not isinstance(data, dict) or not data:
            raise ValueError("BOS_DATA_KEYS must name at least one key")
        keys: dict[str, bytes] = {}
        for kid, b64 in data.items():
            if not _KEY_ID.match(str(kid)):
                raise ValueError(f"key id {kid!r}: letters, digits, _ or - only (max 32)")
            try:
                key = base64.b64decode(str(b64), validate=True)
            except ValueError as e:
                raise ValueError(f"key {kid!r} is not base64") from e
            if len(key) != 32:
                raise ValueError(f"key {kid!r} must be 32 bytes (AES-256), got {len(key)}")
            keys[kid] = key
        active = active or (next(iter(keys)) if len(keys) == 1 else "")
        if active not in keys:
            raise ValueError("BOS_DATA_KEY_ACTIVE must name one of the keys in BOS_DATA_KEYS")
        return cls(keys, active)


_ring: KeyRing | None = None


def default_ring() -> KeyRing:
    """The process key ring, from settings (parsed once).

    Fails closed: in production a missing BOS_DATA_KEYS raises instead of
    quietly using the public dev key — "encrypting" with a published key would
    be plaintext with extra steps. The startup guard refuses to boot first;
    this covers any path that runs without it (scripts, a future worker)."""
    global _ring
    if _ring is None:
        from .config import settings
        ring = KeyRing.parse(settings.bos_data_keys, settings.bos_data_key_active)
        if ring.is_dev and settings.is_prod:
            raise KeyConfigError("BOS_DATA_KEYS is not set; refusing to use the dev key in production")
        _ring = ring
    return _ring


def aad(tenant_id, table: str, column: str) -> bytes:
    return f"{tenant_id}|{table}|{column}".encode()


def encrypt(plaintext: str, aad: bytes, *, ring: KeyRing | None = None) -> bytes:
    ring = ring or default_ring()
    kid = ring.active
    dek = AESGCM.generate_key(bit_length=256)
    wrap_nonce, nonce = os.urandom(_NONCE), os.urandom(_NONCE)
    wrapped = AESGCM(ring.keys[kid]).encrypt(wrap_nonce, dek, b"dek|" + kid.encode())
    body = AESGCM(dek).encrypt(nonce, plaintext.encode(), aad)
    return VERSION + b":" + kid.encode() + b":" + wrap_nonce + wrapped + nonce + body


def key_id(blob: bytes) -> str:
    """Which master key wrapped this value (for rekeying)."""
    return _split(blob)[0]


def _split(blob: bytes) -> tuple[str, bytes]:
    try:
        version, kid, rest = bytes(blob).split(b":", 2)
    except ValueError as e:
        raise DecryptError("not an encrypted value") from e
    if version != VERSION:
        raise DecryptError(f"unknown format {version!r}")
    return kid.decode(), rest


def decrypt(blob: bytes, aad: bytes, *, ring: KeyRing | None = None) -> str:
    ring = ring or default_ring()
    kid, rest = _split(blob)
    kek = ring.keys.get(kid)
    if kek is None:
        raise DecryptError(f"key {kid!r} is not in BOS_DATA_KEYS")
    if len(rest) < _NONCE + _WRAPPED + _NONCE + 16:
        raise DecryptError("truncated value")
    wrap_nonce, wrapped = rest[:_NONCE], rest[_NONCE:_NONCE + _WRAPPED]
    nonce, body = rest[_NONCE + _WRAPPED:_NONCE * 2 + _WRAPPED], rest[_NONCE * 2 + _WRAPPED:]
    try:
        dek = AESGCM(kek).decrypt(wrap_nonce, wrapped, b"dek|" + kid.encode())
        return AESGCM(dek).decrypt(nonce, body, aad).decode()
    except InvalidTag as e:
        raise DecryptError("value does not decrypt for this row (wrong key, row or tampered)") from e
