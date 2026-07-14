"""Sessions must be unusable straight out of a database dump.

The original bug: the raw cookie token was stored as `sessions.id`, so read
access to the table was account takeover for every logged-in user.
"""
from __future__ import annotations

import hashlib

from app.security import hash_session_token, new_session_token


def test_stored_value_is_not_the_token():
    token = new_session_token()
    assert hash_session_token(token) != token


def test_hash_is_sha256_of_the_token():
    token = new_session_token()
    assert hash_session_token(token) == hashlib.sha256(token.encode()).hexdigest()


def test_hash_is_deterministic_so_lookup_works():
    token = new_session_token()
    assert hash_session_token(token) == hash_session_token(token)


def test_distinct_tokens_hash_differently():
    assert hash_session_token(new_session_token()) != hash_session_token(new_session_token())


def test_tokens_are_unguessable():
    tokens = {new_session_token() for _ in range(200)}
    assert len(tokens) == 200          # no collisions from the CSPRNG
    assert all(len(t) >= 32 for t in tokens)
