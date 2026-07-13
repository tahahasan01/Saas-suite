"""Apply raw-SQL migrations from infra/migrations in order (idempotent via a
schema_migrations ledger). Run: python -m scripts.migrate  (from services/api)."""
from __future__ import annotations

import asyncio
from pathlib import Path

import asyncpg

from app.config import settings

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "infra" / "migrations"


async def main() -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute(
            """create table if not exists schema_migrations (
                   version text primary key,
                   applied_at timestamptz not null default now()
               )"""
        )
        applied = {r["version"] for r in await conn.fetch("select version from schema_migrations")}
        files = sorted(MIGRATIONS_DIR.glob("*.sql"))
        if not files:
            print(f"No .sql files found in {MIGRATIONS_DIR}")
            return
        for path in files:
            version = path.name
            if version in applied:
                print(f"= skip {version}")
                continue
            sql = path.read_text(encoding="utf-8")
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute("insert into schema_migrations(version) values ($1)", version)
            print(f"+ applied {version}")
        print("Migrations up to date.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
