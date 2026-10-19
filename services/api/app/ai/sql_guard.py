"""NL->SQL safety gate. The LLM may only produce a single read-only query that
touches allowlisted views. This is layer 1 of defense; execution also runs in a
READ ONLY transaction under RLS (see gateway.run_query), so a bypass still can't
write. The database grants (migration 0025) are the layer that keeps secret
platform tables out of reach even if this gate is wrong.

The gate parses the SQL (sqlglot, Postgres dialect) instead of pattern-matching
it: a regex only saw identifiers after FROM/JOIN, so comma joins, quoted names
and functions such as set_config() walked straight through (audit P0-1). Here
every table reference and every function call in the tree is checked, and the
query that runs is re-rendered from the checked tree — never the model's text.
"""
from __future__ import annotations

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError

# Curated views per section (migrations 0004, 0020). The allowlist is built from
# the tenant's enabled sections, so a POS-only tenant's AI can never reach a CRM
# view even if the model writes one into a query.
VIEWS_BY_SECTION = {
    "crm": {"ai_v_leads", "ai_v_interactions"},
    "pos": {"ai_v_sales", "ai_v_sale_items", "ai_v_products", "ai_v_returns"},
    "hrms": {"ai_v_employees", "ai_v_attendance", "ai_v_leave"},
}

# Every view that exists. Used only as the default for callers that do not scope.
ALLOWED_VIEWS = set().union(*VIEWS_BY_SECTION.values())

# Functions are default-deny. Typed sqlglot classes cover the standard SQL a
# reporting question needs; anything sqlglot doesn't know parses as Anonymous
# and must be named here explicitly (set_config, current_setting, query_to_xml,
# pg_* and dblink are therefore refused without having to be listed).
_ALLOWED_FUNCS: tuple[type[exp.Expression], ...] = (
    exp.Count, exp.Sum, exp.Avg, exp.Min, exp.Max,
    exp.Coalesce, exp.Nullif, exp.Greatest, exp.Least, exp.Round, exp.Abs,
    exp.Floor, exp.Ceil, exp.Cast, exp.TryCast, exp.Extract,
    exp.DateTrunc, exp.TimestampTrunc, exp.TimeToStr, exp.CurrentDate,
    exp.CurrentTimestamp, exp.Lower, exp.Upper, exp.Length, exp.Trim,
    exp.Concat, exp.Substring, exp.Left, exp.Right, exp.ArrayAgg,
    exp.GroupConcat, exp.If, exp.Case,
)
_ALLOWED_ANONYMOUS = {"age", "date_part", "split_part", "initcap", "string_agg"}

# Statement shapes that may never appear anywhere in the tree.
_FORBIDDEN_NODES: tuple[type[exp.Expression], ...] = (
    exp.Insert, exp.Update, exp.Delete, exp.Merge, exp.Create, exp.Drop,
    exp.Alter, exp.Command, exp.Into, exp.Lock, exp.Set,
)


def views_for(sections) -> set[str]:
    return set().union(*(VIEWS_BY_SECTION.get(s, set()) for s in sections)) if sections else set()


class UnsafeQuery(Exception):
    pass


def _check_functions(tree: exp.Expression) -> None:
    for fn in tree.find_all(exp.Func):
        if isinstance(fn, exp.Anonymous):
            if fn.name.lower() not in _ALLOWED_ANONYMOUS:
                raise UnsafeQuery(f"function '{fn.name}' is not allowed")
        elif not isinstance(fn, _ALLOWED_FUNCS):
            raise UnsafeQuery(f"function '{fn.sql_name()}' is not allowed")


def _check_table(table: exp.Table, allowed: set[str], visible_ctes: set[str]) -> None:
    name = table.name.lower()
    if table.db and table.db.lower() != "public":
        raise UnsafeQuery(f"table '{table.sql()}' is not queryable")
    if name in visible_ctes and not table.db:
        return
    if name not in allowed:
        raise UnsafeQuery(f"table '{table.sql()}' is not queryable")


def _check_tables(tree: exp.Expression, allowed: set[str]) -> None:
    """A CTE name only excuses a reference that SQL scoping lets see it. To keep
    that rule simple and checkable: WITH is allowed only at the top level, never
    RECURSIVE, and a CTE body sees only the CTEs defined before it (a
    non-recursive CTE cannot see itself, so `with users as (select * from
    users)` reads the real table)."""
    withs = list(tree.find_all(exp.With))
    top = tree.args.get("with_")
    if any(w is not top for w in withs):
        raise UnsafeQuery("WITH is only allowed at the top of the query")
    if top is not None and top.args.get("recursive"):
        raise UnsafeQuery("recursive queries are not allowed")
    ctes = list(top.expressions) if top is not None else []

    seen: set[str] = set()
    for cte in ctes:
        for table in cte.this.find_all(exp.Table):
            _check_table(table, allowed, seen)
        seen.add(cte.alias_or_name.lower())

    tables = list(tree.find_all(exp.Table))
    if not tables:
        raise UnsafeQuery("query references no table")
    for table in tables:
        if table.find_ancestor(exp.CTE) is None:
            _check_table(table, allowed, seen)
    if not any(t.name.lower() in allowed for t in tables):
        raise UnsafeQuery("query references no allowed view")


def sanitize(sql: str, max_limit: int = 200, allowed: set[str] | None = None) -> str:
    """Return a safe query (with an enforced LIMIT) or raise UnsafeQuery.

    `allowed` scopes the query to the views a tenant's enabled sections grant.
    """
    allowed = ALLOWED_VIEWS if allowed is None else allowed
    s = sql.strip().rstrip(";").strip()
    if not s:
        raise UnsafeQuery("empty query")
    if "--" in s or "/*" in s:
        raise UnsafeQuery("comments are not allowed")

    try:
        statements = [st for st in sqlglot.parse(s, read="postgres") if st is not None]
    except ParseError as e:
        raise UnsafeQuery("query could not be parsed") from e
    if len(statements) != 1:
        raise UnsafeQuery("exactly one statement is allowed")
    tree = statements[0]

    if not isinstance(tree, exp.Query):
        raise UnsafeQuery("only SELECT queries are allowed")
    for node in tree.walk():
        if isinstance(node, _FORBIDDEN_NODES):
            raise UnsafeQuery("query contains a forbidden statement")

    _check_tables(tree, allowed)
    _check_functions(tree)

    if not tree.args.get("limit"):
        tree = tree.limit(max_limit)
    return tree.sql(dialect="postgres")
