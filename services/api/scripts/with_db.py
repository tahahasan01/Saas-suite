"""Run a command against a private, fully migrated copy of the database.

From services/api:
    ./.venv/Scripts/python -m scripts.with_db <db_name> [--fresh] -- <command ...>
e.g.
    ./.venv/Scripts/python -m scripts.with_db businessos_mywork -- python -m pytest -q tests/core

Creates <db_name> if missing (must start with "businessos_"; it refuses the
shared dev db), applies this checkout's migrations to it, then runs the
command with DATABASE_URL / APP_DATABASE_URL pointing at it. --fresh drops and
recreates it first. Credentials come from .env; nothing secret is printed.
Use it whenever several people or agents test in parallel, or a branch adds
migrations the shared dev db shouldn't get yet.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from urllib.parse import urlsplit, urlunsplit

import asyncpg

sys.path.insert(0, os.getcwd())
from app.config import settings  # noqa: E402  (the checkout's own settings)


def with_db(url: str, name: str) -> str:
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path="/" + name))


async def ensure(name: str, fresh: bool) -> None:
    admin = await asyncpg.connect(with_db(settings.database_url, "postgres"))
    try:
        exists = await admin.fetchval("select 1 from pg_database where datname=$1", name)
        if exists and fresh:
            await admin.execute(
                "select pg_terminate_backend(pid) from pg_stat_activity where datname=$1", name)
            await admin.execute(f'drop database "{name}"')
            exists = False
        if not exists:
            owner = urlsplit(settings.database_url).username
            await admin.execute(f'create database "{name}" owner "{owner}"')
            print(f"[with_db] created database {name}")
    finally:
        await admin.close()


def main() -> int:
    args = sys.argv[1:]
    if len(args) < 3 or "--" not in args:
        print(__doc__)
        return 2
    name = args[0]
    if not name.startswith("businessos_"):
        print("[with_db] refusing: database name must start with businessos_ (never the shared dev db)")
        return 2
    fresh = "--fresh" in args[: args.index("--")]
    cmd = args[args.index("--") + 1:]
    asyncio.run(ensure(name, fresh))
    env = dict(os.environ)
    env["DATABASE_URL"] = with_db(settings.database_url, name)
    env["APP_DATABASE_URL"] = with_db(settings.app_database_url, name)
    python = sys.executable
    mig = subprocess.run([python, "-m", "scripts.migrate"], env=env)
    if mig.returncode != 0:
        print("[with_db] migrations failed")
        return mig.returncode
    if cmd and cmd[0] == "python":
        cmd = [python] + cmd[1:]
    return subprocess.run(cmd, env=env).returncode


if __name__ == "__main__":
    raise SystemExit(main())
