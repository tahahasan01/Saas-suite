"""Limits must degrade when a trial lapses.

The original bug: `status='trialing'` was trusted forever, so an expired trial
kept full Growth limits indefinitely and nothing ever downgraded it.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.billing import PLANS, effective_limits, trial_expired


def _sub(status: str, trial_ends_at=None, plan: str = "growth") -> dict:
    # effective_limits only subscripts the record, so a dict stands in for
    # asyncpg.Record without needing a database.
    return {"status": status, "trial_ends_at": trial_ends_at, "plan": plan}


def _in(days: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


def test_no_subscription_falls_back_to_starter():
    assert effective_limits(None) == PLANS["starter"]


def test_live_trial_gets_growth():
    assert effective_limits(_sub("trialing", _in(3))) == PLANS["growth"]


def test_expired_trial_drops_to_starter():
    assert effective_limits(_sub("trialing", _in(-1))) == PLANS["starter"]


def test_trial_without_an_end_date_is_not_treated_as_expired():
    assert effective_limits(_sub("trialing", None)) == PLANS["growth"]


def test_active_subscription_gets_its_own_plan():
    assert effective_limits(_sub("active", plan="starter")) == PLANS["starter"]
    assert effective_limits(_sub("active", plan="growth")) == PLANS["growth"]


def test_past_due_and_canceled_fall_back_to_starter():
    assert effective_limits(_sub("past_due", plan="growth")) == PLANS["starter"]
    assert effective_limits(_sub("canceled", plan="growth")) == PLANS["starter"]


def test_unknown_plan_on_an_active_sub_falls_back_to_starter():
    assert effective_limits(_sub("active", plan="platinum")) == PLANS["starter"]


def test_trial_expired_only_applies_to_trials():
    assert trial_expired(_sub("trialing", _in(-1))) is True
    assert trial_expired(_sub("trialing", _in(1))) is False
    assert trial_expired(_sub("active", _in(-1))) is False
    assert trial_expired(None) is False
