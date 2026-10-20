"""Write the API's OpenAPI schema to a file (default: packages/api-client/openapi.json).

Run: python -m scripts.export_openapi [path]   (from services/api)

Importing the app needs no database (the pool opens in the lifespan), so CI can
run this before any service is up. Keys keep FastAPI's order and the file ends
in one newline, so the same code always gives byte-identical output and the CI
drift check only fails when the API really changed.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from app.main import app

DEFAULT_OUT = Path(__file__).resolve().parents[3] / "packages" / "api-client" / "openapi.json"


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"
    out.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
