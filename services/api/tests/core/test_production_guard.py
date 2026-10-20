"""Production refuses to boot on defaults (S10, S11, P0-6).

A forgotten .env line must fail the deploy, not quietly ship the dev
password that sits in this repository. The subprocess tests import the real
app with ENV=production, exactly as the container does.
"""
from __future__ import annotations

import base64
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from app import startup_guard
from app.config import Settings

API_DIR = Path(__file__).resolve().parents[2]
STRONG = "q8Zr2mXv7LpN4tWs9KcY"
DATA_KEYS = '{"k1": "%s"}' % base64.b64encode(os.urandom(32)).decode()
GOOD = {
    "ENV": "production",
    "DATABASE_URL": f"postgres://businessos:{STRONG}@db:5432/businessos",
    "APP_DATABASE_URL": f"postgres://app_user:{STRONG}x@db:5432/businessos",
    "BOS_DATA_KEYS": DATA_KEYS,
    "BOS_DATA_KEY_ACTIVE": "k1",
}


def _settings(**overrides) -> Settings:
    base = {k.lower(): v for k, v in GOOD.items()}
    return Settings(_env_file=None, **{**base, **overrides})


def test_good_production_settings_pass():
    assert startup_guard.problems(_settings()) == []


@pytest.mark.parametrize("field, value, needle", [
    ("database_url", "postgres://businessos:change_me_in_prod@db:5432/businessos", "DATABASE_URL"),
    ("app_database_url", "postgres://app_user:app_user_pw@db:5432/businessos", "APP_DATABASE_URL"),
    ("app_database_url", "postgres://app_user:devpassword@db:5432/businessos", "APP_DATABASE_URL"),
    ("app_database_url", "postgres://app_user@db:5432/businessos", "APP_DATABASE_URL"),
    ("database_url", "postgres://businessos:short@db:5432/businessos", "DATABASE_URL"),
    ("bos_data_keys", "", "BOS_DATA_KEYS"),
    ("bos_data_keys", "not json", "BOS_DATA_KEYS"),
])
def test_known_or_weak_secrets_are_refused(field, value, needle):
    found = startup_guard.problems(_settings(**{field: value}))
    assert any(needle in p for p in found), found


def test_problems_never_echo_the_secret_itself():
    found = startup_guard.problems(
        _settings(app_database_url="postgres://app_user:app_user_pw@db:5432/businessos"))
    assert found and not any("app_user_pw" in p for p in found)


def test_development_is_not_policed():
    dev = Settings(_env_file=None, env="development",
                   database_url="postgres://businessos:change_me_in_prod@localhost/businessos")
    assert startup_guard.problems(dev) == []


def _run(env_overrides: dict, code: str) -> subprocess.CompletedProcess:
    # SENTRY_DSN blanked: a test must never report to the real project.
    env = {**os.environ, "SENTRY_DSN": "", **env_overrides}
    return subprocess.run([sys.executable, "-c", textwrap.dedent(code)], cwd=API_DIR, env=env,
                          capture_output=True, text=True, timeout=120)


def test_the_api_refuses_to_start_with_default_secrets_in_production():
    r = _run({**GOOD, "APP_DATABASE_URL": "postgres://app_user:app_user_pw@db:5432/businessos"},
             "import app.main")
    assert r.returncode != 0
    assert "refusing to start" in r.stderr
    assert "APP_DATABASE_URL" in r.stderr


PROBE = """
    import asyncio, httpx
    from app.main import app

    async def main():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://api") as c:
            for path in ("/docs", "/redoc", "/openapi.json", "/health"):
                r = await c.get(path)
                print(path, r.status_code, r.headers.get("strict-transport-security", "-"))
    asyncio.run(main())
"""


def test_api_docs_are_hidden_in_production_and_hsts_is_sent():
    r = _run(GOOD, PROBE)
    assert r.returncode == 0, r.stderr
    lines = dict(line.split(" ", 1) for line in r.stdout.strip().splitlines())
    assert lines["/docs"].startswith("404")
    assert lines["/redoc"].startswith("404")
    assert lines["/openapi.json"].startswith("404")
    assert lines["/health"].startswith("200 max-age=")


async def test_api_docs_stay_available_in_development(client):
    # The test process itself runs as development.
    assert (await client.get("/docs")).status_code == 200
    assert (await client.get("/openapi.json")).status_code == 200


def test_the_worker_refuses_to_start_with_default_secrets_in_production():
    # The worker holds the same credentials as the API, so the same guard.
    r = _run({**GOOD, "APP_DATABASE_URL": "postgres://app_user:app_user_pw@db:5432/businessos"},
             "import asyncio\nfrom app import worker\nraise SystemExit(asyncio.run(worker.main(['--once'])))")
    assert r.returncode != 0
    assert "refusing to start" in r.stderr
    assert "APP_DATABASE_URL" in r.stderr


def test_the_worker_refuses_the_public_dev_data_key_in_production():
    r = _run({**GOOD, "BOS_DATA_KEYS": "", "BOS_DATA_KEY_ACTIVE": ""},
             "import asyncio\nfrom app import worker\nraise SystemExit(asyncio.run(worker.main([])))")
    assert r.returncode != 0
    assert "BOS_DATA_KEYS" in r.stderr
