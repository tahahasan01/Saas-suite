"""NL->SQL safety gate. The LLM may only produce a single read-only SELECT that
touches allowlisted views. This is layer 1 of defense; execution also runs in a
READ ONLY transaction under RLS (see gateway.run_query), so a bypass still can't
write or cross tenants."""
from __future__ import annotations

import re

# Curated views the AI is allowed to query (see migration 0004).
ALLOWED_VIEWS = {"ai_v_leads", "ai_v_interactions"}

_STARTS_SELECT = re.compile(r"^\s*select\b", re.IGNORECASE)
_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|into|"
    r"merge|call|do|set|vacuum|analyze|reindex|comment|listen|notify|lock|"
    r"pg_sleep|pg_read_file|pg_ls_dir|dblink)\b",
    re.IGNORECASE,
)
_TABLE_REF = re.compile(r"\b(?:from|join)\s+([a-zA-Z_][\w.]*)", re.IGNORECASE)
_HAS_LIMIT = re.compile(r"\blimit\s+\d+", re.IGNORECASE)


class UnsafeQuery(Exception):
    pass


def sanitize(sql: str, max_limit: int = 200) -> str:
    """Return a safe SELECT (with an enforced LIMIT) or raise UnsafeQuery."""
    s = sql.strip().rstrip(";").strip()
    if not s:
        raise UnsafeQuery("empty query")
    if ";" in s:
        raise UnsafeQuery("multiple statements are not allowed")
    if "--" in s or "/*" in s:
        raise UnsafeQuery("comments are not allowed")
    if not _STARTS_SELECT.match(s):
        raise UnsafeQuery("only SELECT queries are allowed")
    if _FORBIDDEN.search(s):
        raise UnsafeQuery("query contains a forbidden keyword")

    refs = _TABLE_REF.findall(s)
    if not refs:
        raise UnsafeQuery("query references no table")
    for ref in refs:
        name = ref.split(".")[-1].lower()
        if name not in ALLOWED_VIEWS:
            raise UnsafeQuery(f"table '{ref}' is not queryable")

    if not _HAS_LIMIT.search(s):
        s = f"{s} limit {max_limit}"
    return s
