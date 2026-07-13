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
