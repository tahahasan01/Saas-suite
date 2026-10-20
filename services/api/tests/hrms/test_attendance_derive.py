"""The derived day as a pure function of the punches (D-43, St03 §6.3).

No database: instants go in, (status, late_min, early_min, worked_min) come
out. The shift's start and end are already instants here — turning local
times into instants is the tenant clock's job, tested against Postgres in
test_shifts_punches.py.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from app import attendance
from app.attendance import Punch, Rule

T0 = datetime(2026, 10, 20, 4, 0, tzinfo=timezone.utc)   # 09:00 PKT


def at(minutes: float) -> datetime:
    return T0 + timedelta(minutes=minutes)


DAY = Rule(start_at=at(0), end_at=at(9 * 60), grace_in_min=15, grace_out_min=10,
           half_day_below_min=240, absent_below_min=120)


def day(*punches: tuple[str, float], rule: Rule | None = DAY, late_after_at=None):
    return attendance.derive([Punch(at(m), k) for k, m in punches], rule=rule, late_after_at=late_after_at)


def test_inside_the_grace_is_on_time_one_minute_past_is_late():
    assert day(("in", 15)).status == "present"
    assert day(("in", 15)).late_min == 0
    d = day(("in", 16))
    assert (d.status, d.late_min) == ("late", 1)
    # Seconds count: 09:15:30 is half a minute past grace, so it is late.
    assert day(("in", 15.5)).late_min == 1


def test_early_leaving_is_measured_from_the_end_less_its_grace():
    assert day(("in", 0), ("out", 9 * 60 - 10)).early_min == 0
    assert day(("in", 0), ("out", 9 * 60 - 11)).early_min == 1
    assert day(("in", 0), ("out", 9 * 60 + 30)).early_min == 0


def test_half_day_and_absent_thresholds_on_worked_minutes():
    assert day(("in", 0), ("out", 240)).status == "present"      # exactly the threshold
    assert day(("in", 0), ("out", 239)).status == "half_day"
    assert day(("in", 0), ("out", 120)).status == "half_day"
    assert day(("in", 0), ("out", 119)).status == "absent"
    # A late half day is a half day — the stronger status wins.
    assert day(("in", 60), ("out", 200)).status == "half_day"


def test_thresholds_wait_for_the_check_out():
    """Twenty minutes into the day nobody is a half day yet."""
    d = day(("in", 0))
    assert (d.status, d.worked_min, d.last_out) == ("present", 0, None)
    # Back from a break: the day is open again, so thresholds wait again.
    assert day(("in", 0), ("out", 60), ("in", 120)).status == "present"


def test_worked_time_is_the_sum_of_pairs_not_the_span():
    d = day(("in", 0), ("out", 180), ("in", 240), ("out", 9 * 60))
    assert d.worked_min == 180 + 300
    assert (d.first_in, d.last_out) == (at(0), at(9 * 60))


def test_repeated_punches_keep_the_first_in_and_the_last_out():
    d = day(("in", 0), ("in", 30), ("out", 400), ("out", 500))
    assert d.first_in == at(0)
    assert d.last_out == at(500)
    assert d.worked_min == 500


def test_a_zero_threshold_switches_the_rule_off():
    rule = Rule(start_at=at(0), end_at=at(540), grace_in_min=0, grace_out_min=0,
                half_day_below_min=0, absent_below_min=0)
    assert day(("in", 0), ("out", 5), rule=rule).status == "present"


def test_without_a_shift_the_tenant_late_after_rule_applies():
    """No shift assigned: late from tenants.late_after on (inclusive, as
    before), never a half day, no early leaving."""
    threshold = at(15)
    assert day(("in", 14), rule=None, late_after_at=threshold).status == "present"
    assert day(("in", 15), rule=None, late_after_at=threshold).status == "late"
    d = day(("in", 20), ("out", 30), rule=None, late_after_at=threshold)
    assert (d.status, d.late_min, d.early_min) == ("late", 5, 0)


# ── A day nobody checked out of (security review: fail-open payroll) ────────
def test_an_open_day_that_is_over_is_judged_on_closed_pairs_only():
    """Checking in and never checking out must not earn a full day. Once the
    day is over, an unmatched check-in counts 0 minutes (the conservative
    rule: HR corrects it from the flag), so the thresholds apply."""
    d = attendance.derive([Punch(at(0), "in")], rule=DAY, day_over=True)
    assert (d.status, d.worked_min, d.missing_checkout, d.final) == ("absent", 0, True, True)
    # Worked 3 h, came back from a break, never checked out: a half day.
    d = attendance.derive([Punch(at(0), "in"), Punch(at(180), "out"), Punch(at(200), "in")],
                          rule=DAY, day_over=True)
    assert (d.status, d.worked_min, d.missing_checkout) == ("half_day", 180, True)


def test_an_open_day_in_progress_is_not_judged_yet():
    d = attendance.derive([Punch(at(0), "in")], rule=DAY, day_over=False)
    assert (d.status, d.missing_checkout, d.final) == ("present", False, False)


def test_a_checked_out_day_that_is_over_is_final_and_not_flagged():
    d = attendance.derive([Punch(at(0), "in"), Punch(at(540), "out")], rule=DAY, day_over=True)
    assert (d.status, d.missing_checkout, d.final) == ("present", False, True)


def test_without_a_shift_a_missing_check_out_is_flagged_but_not_judged():
    """No shift means no thresholds, as before — but HR still sees the gap."""
    d = attendance.derive([Punch(at(0), "in")], rule=None, late_after_at=at(60), day_over=True)
    assert (d.status, d.missing_checkout, d.final) == ("present", True, True)


def test_overnight_cutoff_is_the_middle_of_the_off_duty_gap():
    # 22:00–06:00: off 06:00–22:00, so punches before 14:00 belong to the night before.
    assert attendance.overnight_cutoff(time(22), time(6)) == time(14)
    assert attendance.overnight_cutoff(time(20), time(4)) == time(12)
    assert attendance.overnight_cutoff(time(23, 30), time(7, 30)) == time(15, 30)
