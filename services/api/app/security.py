"""Password hashing (argon2) and session-token generation."""
from __future__ import annotations

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def new_session_token() -> str:
    """The raw token — goes to the cookie and is never stored."""
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    """What actually lands in `sessions.id`.

    A stolen database dump must not be a pile of live sessions. SHA-256 (not
    argon2) is the right tool here: the token is 256 bits of CSPRNG output, so
    there is nothing to brute-force, and this runs on every authenticated
    request — a deliberately slow KDF would be a self-inflicted DoS.
    """
    return hashlib.sha256(token.encode()).hexdigest()


SESSION_COOKIE = "bos_session"
