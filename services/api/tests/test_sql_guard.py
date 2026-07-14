"""The AI SQL guard is security-critical — these lock in that it only ever
lets a single read-only SELECT over the allowlisted views through."""
import pytest

from app.ai.sql_guard import UnsafeQuery, sanitize

SAFE = [
    "select count(*) from ai_v_leads",
    "select * from ai_v_leads where stage = 'New' limit 5",
    "select * from ai_v_leads l join ai_v_interactions i on i.lead_name = l.name",
]

UNSAFE = [
    "select * from users",                                  # not an allowed view
    "select * from crm_leads",                              # raw table
    "delete from ai_v_leads",                               # not a SELECT
    "update ai_v_leads set score = 1",                      # mutation
    "select 1; drop table users",                           # multi-statement
    "select * from ai_v_leads -- sneaky",                   # comment
    "select * from ai_v_leads union select * from users",   # union to raw table
    "select pg_sleep(10)",                                  # forbidden fn / no table
    "with x as (select * from users) select * from x",      # CTE
    "",                                                      # empty
]


@pytest.mark.parametrize("sql", SAFE)
def test_allows_safe_selects(sql):
    assert sanitize(sql)


@pytest.mark.parametrize("sql", UNSAFE)
def test_blocks_unsafe(sql):
    with pytest.raises(UnsafeQuery):
        sanitize(sql)


def test_enforces_limit():
    assert "limit" in sanitize("select count(*) from ai_v_leads").lower()


# ── Section scoping ─────────────────────────────────────────────────────────
# The AI answers across every module a tenant enabled — which means the guard,
# not the endpoint, is what stops a POS-only tenant reading CRM data.
from app.ai.sql_guard import VIEWS_BY_SECTION, views_for  # noqa: E402


def test_views_are_scoped_to_enabled_sections():
    assert views_for({"pos"}) == VIEWS_BY_SECTION["pos"]
    assert views_for({"crm", "hrms"}) == VIEWS_BY_SECTION["crm"] | VIEWS_BY_SECTION["hrms"]
    assert views_for(set()) == set()


def test_pos_only_tenant_cannot_reach_crm_views():
    with pytest.raises(UnsafeQuery):
        sanitize("select * from ai_v_leads", allowed=views_for({"pos"}))


def test_crm_only_tenant_cannot_reach_staff_data():
    with pytest.raises(UnsafeQuery):
        sanitize("select * from ai_v_employees", allowed=views_for({"crm"}))


def test_a_join_is_refused_if_either_side_is_out_of_scope():
    """The dangerous shape: a legal view joined to one the tenant doesn't have."""
    with pytest.raises(UnsafeQuery):
        sanitize("select * from ai_v_sales s join ai_v_leads l on l.name = s.cashier",
                 allowed=views_for({"pos"}))


def test_cross_module_join_is_allowed_when_both_sections_are_on():
    """The differentiator: one question spanning sales and staff."""
    sql = sanitize(
        "select s.cashier, sum(s.total) from ai_v_sales s "
        "join ai_v_employees e on e.name = s.cashier group by s.cashier",
        allowed=views_for({"pos", "hrms"}))
    assert "limit" in sql.lower()


def test_every_section_view_is_actually_queryable():
    for section, views in VIEWS_BY_SECTION.items():
        for v in views:
            assert sanitize(f"select * from {v}", allowed=views_for({section}))
