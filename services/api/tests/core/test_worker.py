"""The worker and its DB-locked jobs (D-08, gate I6, migration 0043).

Jobs live in `scheduled_jobs`. A worker claims a due job in a committed
statement (`for update skip locked`, status -> running) before it runs it, so
any number of workers — loops in one process or separate processes — run each
due job exactly once. A job that keeps failing is switched off and alerts; a
`running` row whose worker died is reset by the reaper once its timeout passes.

Each test registers its own throwaway job code and runs only that code, so the
real seeded jobs (FBR outbox, reminders …) never run here.
"""
from __future__ import annotations

import asyncio
import random
import string
import sys
from pathlib import Path

import asyncpg
import pytest
import pytest_asyncio

from app import alerts, db, jobs
from app.config import settings

API_DIR = Path(__file__).resolve().parents[2]


async def _q(sql, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


def _code() -> str:
    return "test." + "".join(random.choices(string.ascii_lowercase, k=10))


@pytest_asyncio.fixture
async def pools():
    await db.connect()
    yield
    await db.disconnect()


@pytest_asyncio.fixture
async def job(pools, monkeypatch):
    """A due test job whose handler counts its runs. Removed afterwards."""
    code = _code()
    calls: list[int] = []

    async def handler():
        calls.append(1)
        await asyncio.sleep(0.2)   # long enough for concurrent claimers to overlap
        return {"done": 1}

    monkeypatch.setitem(jobs.HANDLERS, code, handler)
    await _q("""insert into scheduled_jobs (code, run_every, next_run_at, timeout_s, max_failures)
                values ($1, interval '1 hour', now(), 30, 3)""", code)
    yield {"code": code, "calls": calls}
    await _q("delete from scheduled_jobs where code=$1", code)


@pytest.fixture
def raised(monkeypatch):
    """Every alert raised during the test."""
    got: list[alerts.Alert] = []
    monkeypatch.setattr(alerts, "_sinks", [got.append])
    return got


async def _job(code):
    [row] = await _q("select * from scheduled_jobs where code=$1", code)
    return row


async def _runs(code):
    return await _q("select * from job_runs where job_code=$1 order by id", code)


# ── Registry ────────────────────────────────────────────────────────────────
async def test_every_seeded_job_has_a_handler_and_every_handler_a_row():
    codes = {r["code"] for r in await _q("select code from scheduled_jobs where code not like 'test.%'")}
    assert codes == set(jobs.HANDLERS)
    # The worker drives the FBR outbox and the email outbox: both are jobs.
    assert {"fbr.outbox", "email.outbox", "ops.monitor"} <= codes


def test_the_api_process_runs_no_scheduler():
    import app.main  # noqa: F401

    assert "apscheduler" not in sys.modules
    assert not hasattr(jobs, "start")
    assert not hasattr(settings, "enable_scheduler")


# ── Locking ─────────────────────────────────────────────────────────────────
async def test_a_due_job_runs_once_however_many_workers_race_for_it(job):
    results = await asyncio.gather(*(jobs.run_due(f"w{i}", only=[job["code"]]) for i in range(6)))
    assert sorted(len(r) for r in results) == [0, 0, 0, 0, 0, 1]
    assert len(job["calls"]) == 1
    [run] = await _runs(job["code"])
    assert run["status"] == "done" and run["result"] == '{"done": 1}'
    row = await _job(job["code"])
    assert row["status"] == "idle" and row["last_success_at"] is not None
    assert row["next_run_at"] > row["last_run_at"]      # rescheduled an interval ahead


async def test_two_worker_processes_never_run_the_same_job(job):
    """Separate processes, separate pools: the database is the only lock."""
    script = (
        "import asyncio, sys\n"
        "from app import db, jobs\n"
        "async def slow():\n"
        "    await asyncio.sleep(1.5)\n"
        "jobs.HANDLERS[sys.argv[1]] = slow\n"
        "async def main():\n"
        "    await db.connect()\n"
        "    try:\n"
        "        print(len(await jobs.run_due(sys.argv[2], only=[sys.argv[1]])))\n"
        "    finally:\n"
        "        await db.disconnect()\n"
        "asyncio.run(main())\n")
    procs = [await asyncio.create_subprocess_exec(
        sys.executable, "-c", script, job["code"], f"proc{i}", cwd=str(API_DIR),
        stdout=asyncio.subprocess.PIPE) for i in range(2)]
    outs = [int((await p.communicate())[0].decode().strip().splitlines()[-1]) for p in procs]
    assert sorted(outs) == [0, 1]
    assert len(await _runs(job["code"])) == 1


async def test_a_job_locked_by_another_transaction_is_skipped_not_waited_on(job):
    conn = await asyncpg.connect(settings.database_url)
    try:
        async with conn.transaction():
            await conn.execute("select 1 from scheduled_jobs where code=$1 for update", job["code"])
            ran = await asyncio.wait_for(jobs.run_due("w", only=[job["code"]]), timeout=5)
    finally:
        await conn.close()
    assert ran == [] and job["calls"] == []


async def test_a_trigger_runs_a_job_before_its_next_run(job):
    await jobs.run_due("w", only=[job["code"]])
    assert await jobs.run_due("w", only=[job["code"]]) == []         # not due for an hour
    await jobs.trigger(job["code"])
    assert await jobs.run_due("w", only=[job["code"]]) == [job["code"]]
    assert await _q("select 1 from job_triggers where job_code=$1", job["code"]) == []  # consumed


# ── Failures, auto-disable, timeouts, the reaper ───────────────────────────
async def test_failures_are_counted_and_success_resets_them(job, monkeypatch, raised):
    async def boom():
        raise RuntimeError("upstream down")

    monkeypatch.setitem(jobs.HANDLERS, job["code"], boom)
    await jobs.run_due("w", only=[job["code"]])
    row = await _job(job["code"])
    assert row["failure_count"] == 1 and row["active"] and row["first_failure_at"] is not None
    assert (await _runs(job["code"]))[-1]["status"] == "failed"
    assert "upstream down" in (await _runs(job["code"]))[-1]["error"]

    monkeypatch.setitem(jobs.HANDLERS, job["code"], lambda: asyncio.sleep(0))
    await jobs.trigger(job["code"])
    await jobs.run_due("w", only=[job["code"]])
    row = await _job(job["code"])
    assert row["failure_count"] == 0 and row["first_failure_at"] is None
    assert raised == []


async def test_a_job_that_keeps_failing_is_switched_off_with_an_alert(job, monkeypatch, raised):
    async def boom():
        raise RuntimeError("bad config")

    monkeypatch.setitem(jobs.HANDLERS, job["code"], boom)
    for _ in range(3):                                   # max_failures = 3
        await jobs.trigger(job["code"])
        await jobs.run_due("w", only=[job["code"]])
    row = await _job(job["code"])
    assert not row["active"] and row["failure_count"] == 3
    assert "bad config" in row["disabled_reason"]
    [alert] = raised
    assert alert.event == "job.disabled" and alert.fields["job"] == job["code"]
    await jobs.trigger(job["code"])
    assert await jobs.run_due("w", only=[job["code"]]) == []         # off until re-enabled
    await jobs.enable(job["code"])
    assert (await _job(job["code"]))["active"]


async def test_a_job_over_its_timeout_is_stopped_and_counted(job, monkeypatch):
    async def hangs():
        await asyncio.sleep(60)

    monkeypatch.setitem(jobs.HANDLERS, job["code"], hangs)
    await _q("update scheduled_jobs set timeout_s = 1 where code=$1", job["code"])
    await asyncio.wait_for(jobs.run_due("w", only=[job["code"]]), timeout=10)
    assert (await _runs(job["code"]))[-1]["status"] == "timeout"
    row = await _job(job["code"])
    assert row["status"] == "idle" and row["failure_count"] == 1


async def test_the_reaper_frees_a_job_whose_worker_died(job, raised):
    """A worker killed mid-job leaves its row `running`; once the timeout has
    passed the reaper puts it back, records the run as timed out, and counts
    a failure."""
    [claimed] = await jobs.claim("dead-worker", only=[job["code"]])
    await _q("update scheduled_jobs set locked_until = now() - interval '1 second' where code=$1",
             job["code"])
    await jobs.reap()
    row = await _job(job["code"])
    assert row["status"] == "idle" and row["current_run_id"] is None and row["failure_count"] == 1
    [run] = await _runs(job["code"])
    assert run["id"] == claimed["run_id"] and run["status"] == "timeout"
    # The dead worker's late finish (if it ever comes back) changes nothing.
    await jobs.finish(claimed, ok=True)
    assert (await _job(job["code"]))["failure_count"] == 1
    assert (await _runs(job["code"]))[0]["status"] == "timeout"


async def test_a_running_job_inside_its_timeout_is_left_alone(job):
    await jobs.claim("busy-worker", only=[job["code"]])
    await jobs.reap()
    assert (await _job(job["code"]))["status"] == "running"


# ── The long-running loop ───────────────────────────────────────────────────
async def test_the_worker_loop_runs_due_jobs_and_stops_cleanly(job, monkeypatch):
    from app import worker

    stop = asyncio.Event()

    async def handler():
        job["calls"].append(1)
        stop.set()

    monkeypatch.setitem(jobs.HANDLERS, job["code"], handler)
    monkeypatch.setattr(settings, "worker_poll_s", 0.05)
    await asyncio.wait_for(worker.serve(stop, "loop", only=[job["code"]]), timeout=10)
    assert job["calls"] == [1]
    assert (await _runs(job["code"]))[-1]["status"] == "done"


async def test_stopping_mid_job_hands_it_back_without_a_failure(job, monkeypatch):
    from app import worker

    stop = asyncio.Event()
    started = asyncio.Event()

    async def long_job():
        started.set()
        await asyncio.sleep(60)

    monkeypatch.setitem(jobs.HANDLERS, job["code"], long_job)
    monkeypatch.setattr(settings, "worker_poll_s", 0.05)
    monkeypatch.setattr(worker, "GRACE_S", 0.1)
    loop = asyncio.create_task(worker.serve(stop, "loop", only=[job["code"]]))
    await asyncio.wait_for(started.wait(), timeout=10)
    stop.set()
    await asyncio.wait_for(loop, timeout=10)
    row = await _job(job["code"])
    assert row["status"] == "idle" and row["failure_count"] == 0
    assert row["next_run_at"] <= row["updated_at"]                    # due again at once
    [run] = await _runs(job["code"])
    assert run["status"] == "failed" and run["error"] == "worker stopped"


async def test_a_job_with_no_recent_success_is_reported_stale(job, raised):
    from app import monitor

    await _q("""update scheduled_jobs set last_success_at = now() - interval '3 hours'
                 where code=$1""", job["code"])
    assert job["code"] in await monitor.stale_jobs()
    assert any(a.event == "job.stale" and a.fields["job"] == job["code"] for a in raised)
    await jobs.claim("w", only=[job["code"]])        # running now: not stale, the reaper's business
    assert job["code"] not in await monitor.stale_jobs()
