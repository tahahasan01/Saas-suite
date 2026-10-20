"""The worker process (D-08, gate I6): `python -m app.worker` from services/api.

Runs every job in `scheduled_jobs` (app/jobs.py), which includes the outbox
consumers: `fbr.outbox` (FBR filings) and `email.outbox` (transactional
email). The API process runs no scheduler. Any number of workers can run:
claims are DB-locked, so a due job runs once.

Loop: every WORKER_POLL_S seconds, reap dead runs, claim what is due and
start each claimed job as its own task (a slow daily job never holds up the
FBR outbox). SIGTERM/SIGINT stop claiming, give running jobs a grace period
to finish, then hand the rest back (due again at once, no failure counted).

Each tick touches WORKER_HEARTBEAT_FILE; `--healthcheck` exits non-zero when
it is stale, for the container HEALTHCHECK.

    python -m app.worker                 run until stopped
    python -m app.worker --once          one pass over what is due, then exit
    python -m app.worker --list          jobs, state and last outcome
    python -m app.worker --trigger CODE  make a job due now
    python -m app.worker --enable CODE   turn a switched-off job back on
    python -m app.worker --healthcheck   exit 0 if the loop ticked recently
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import signal
import socket
import sys
import tempfile
import time
from pathlib import Path

from . import db, jobs, obs, startup_guard
from .config import settings

log = logging.getLogger("worker")

GRACE_S = 30
HEARTBEAT = Path(settings.worker_heartbeat_file or Path(tempfile.gettempdir()) / "bos-worker-heartbeat")


def worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}"


def _beat() -> None:
    try:
        HEARTBEAT.write_text(str(time.time()))
    except OSError:
        pass


def healthcheck() -> int:
    """0 if the loop touched the heartbeat file recently, else 1."""
    try:
        age = time.time() - float(HEARTBEAT.read_text())
    except (OSError, ValueError):
        return 1
    return 0 if age < max(60.0, settings.worker_poll_s * 6) else 1


async def serve(stop: asyncio.Event, wid: str, only: list[str] | None = None) -> None:
    running: set[asyncio.Task[None]] = set()
    log.info("worker %s started (poll every %ss)", wid, settings.worker_poll_s)
    while not stop.is_set():
        try:
            await jobs.reap()
            for c in await jobs.claim(wid, only):
                t = asyncio.create_task(obs.in_new_context(jobs.execute(c)), name=f"job:{c['code']}")
                running.add(t)
                t.add_done_callback(running.discard)
            _beat()
        except Exception:  # noqa: BLE001 — a DB blip: try again next tick
            log.exception("worker tick failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=settings.worker_poll_s)
        except asyncio.TimeoutError:
            pass
    if running:
        log.info("stopping: waiting up to %ss for %d running job(s)", GRACE_S, len(running))
        _, pending = await asyncio.wait(running, timeout=GRACE_S)
        for t in pending:
            t.cancel()   # jobs.execute hands the job back before it ends
        await asyncio.gather(*pending, return_exceptions=True)
    log.info("worker %s stopped", wid)


async def _list() -> None:
    async with db.owner_conn() as oc:
        rows = await oc.fetch(
            """select j.code, j.active, j.status, j.run_every, j.next_run_at, j.last_success_at,
                      j.failure_count, j.disabled_reason,
                      (select r.status from job_runs r where r.job_code = j.code
                        order by r.id desc limit 1) as last_run
                 from scheduled_jobs j order by j.priority, j.code""")
    for r in rows:
        state = r["status"] if r["active"] else f"OFF ({r['disabled_reason'][:60]})"
        print(f"{r['code']:<24} {state:<10} every {r['run_every']!s:<10} last={r['last_run'] or '-':<8} "
              f"failures={r['failure_count']} next={r['next_run_at']:%Y-%m-%d %H:%M:%S}")


async def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m app.worker", description=__doc__.split("\n")[0])
    g = p.add_mutually_exclusive_group()
    g.add_argument("--once", action="store_true")
    g.add_argument("--list", action="store_true")
    g.add_argument("--trigger", metavar="CODE")
    g.add_argument("--enable", metavar="CODE")
    g.add_argument("--healthcheck", action="store_true")
    args = p.parse_args(argv)

    if args.healthcheck:
        return healthcheck()

    # Same credentials as the API, same refusal (S10): exits 78 before any I/O.
    startup_guard.enforce(settings)
    obs.setup_logging("worker")
    obs.init_sentry("worker")
    await db.connect()
    try:
        if args.list:
            await _list()
        elif args.trigger:
            await jobs.trigger(args.trigger)
        elif args.enable:
            if not await jobs.enable(args.enable):
                print(f"no such job: {args.enable}", file=sys.stderr)
                return 1
        elif args.once:
            ran = await jobs.run_due(worker_id())
            log.info("ran %d job(s): %s", len(ran), ", ".join(ran) or "none due")
        else:
            stop = asyncio.Event()
            loop = asyncio.get_running_loop()
            for sig in (signal.SIGTERM, signal.SIGINT):
                try:
                    loop.add_signal_handler(sig, stop.set)
                except (NotImplementedError, RuntimeError):  # Windows: Ctrl+C still ends the loop
                    pass
            await serve(stop, worker_id())
    finally:
        await db.disconnect()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except KeyboardInterrupt:
        raise SystemExit(0)
