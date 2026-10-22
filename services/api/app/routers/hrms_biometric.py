"""Biometric attendance import (wave A, H6, St10; St03 "ZKTeco bridge, CSV first").

HR uploads a device's attendance log as CSV (`hrms.attendance.write`). Each
row is an employee code (matched to hrms_employees.code), a local date-time
(the device's clock, read in the tenant's time zone) and, when the export has
one, an in/out state. Without a state, each person's punches alternate in and
out in time order, as the kiosk does. Every punch goes through
attendance.punch (method 'biometric'), so days are derived exactly as for any
other punch. A punch already recorded at the same instant is a duplicate, so
the same file imported twice adds nothing. Unknown codes and unreadable rows
are reported, never guessed.
"""
from __future__ import annotations

import csv
import io
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status

from .. import attendance, csv_io, db
from ..deps import AuthContext
from ..models import BiometricImportOut, ImportRowError
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms"])

_CODE = {"code", "employee code", "emp code", "employee id", "user id", "userid", "ac no", "ac-no", "ac no.",
         "ac-no.", "enroll no", "enrollno", "badge", "badge number", "id"}
_TIME = {"time", "date time", "datetime", "date/time", "checktime", "check time", "timestamp", "punch time",
         "log time"}
_STATE = {"state", "status", "check type", "checktype", "in/out", "type", "punch state", "inout"}
_IN = {"in", "c/in", "check in", "checkin", "0", "i", "duty on", "c-in"}
_OUT = {"out", "c/out", "check out", "checkout", "1", "o", "duty off", "c-out"}
_FORMATS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M:%S",
            "%d-%m-%Y %H:%M", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M", "%m/%d/%Y %I:%M:%S %p", "%m/%d/%Y %I:%M %p")


def _norm(cell: str) -> str:
    return re.sub(r"\s+", " ", cell.strip().lower().replace("_", " "))


def _when(raw: str, tz: ZoneInfo) -> datetime | None:
    raw = raw.strip()
    for fmt in _FORMATS:
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=tz)
        except ValueError:
            continue
    return None


def _read(body: bytes) -> tuple[list[list[str]], dict[str, int]]:
    try:
        text = body.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = body.decode("latin-1")
    rows = [r for r in csv.reader(io.StringIO(text)) if any(c.strip() for c in r)]
    if not rows:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The file is empty.")
    cols: dict[str, int] = {}
    for i, cell in enumerate(rows[0]):
        name = _norm(cell)
        for key, names in (("code", _CODE), ("time", _TIME), ("state", _STATE)):
            if name in names and key not in cols:
                cols[key] = i
    if "code" not in cols or "time" not in cols:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "This doesn't look like an attendance log: it needs an employee code column "
                            "(e.g. AC-No. or User ID) and a time column (e.g. Time or Date Time).")
    if len(rows) - 1 > csv_io.MAX_ROWS:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE,
                            f"Maximum {csv_io.MAX_ROWS} rows per import: split the file and try again.")
    return rows[1:], cols


@router.post("/attendance/import", response_model=BiometricImportOut)
async def import_log(request: Request, auth: AuthContext = Depends(perm("hrms.attendance.write"))) -> BiometricImportOut:
    data, cols = _read(await request.body())
    async with db.tenant_conn(auth.tenant_id) as conn:
        tz = ZoneInfo(await conn.fetchval(
            "select coalesce(timezone, 'Asia/Karachi') from tenants where id = current_setting('app.tenant_id')::uuid"))
        codes = {r["code"].strip().lower(): str(r["id"]) for r in await conn.fetch(
            "select id, code from hrms_employees where code is not null and status = 'active'")}
        errors: list[ImportRowError] = []
        unknown: set[str] = set()
        punches: dict[str, list[tuple[datetime, str | None, int]]] = {}
        for n, cells in enumerate(data, start=2):          # row 1 is the header
            got = {key: (cells[i].strip() if i < len(cells) else "") for key, i in cols.items()}
            code, when = got["code"], _when(got["time"], tz)
            if when is None:
                errors.append(ImportRowError(row=n, error=f"Can't read the time {got['time']!r}"))
                continue
            emp = codes.get(code.lower())
            if emp is None:
                unknown.add(code)
                continue
            state = _norm(got.get("state", ""))
            kind = "in" if state in _IN else "out" if state in _OUT else None
            if state and kind is None:
                errors.append(ImportRowError(row=n, error=f"Unknown in/out state {got['state']!r}"))
                continue
            punches.setdefault(emp, []).append((when, kind, n))

        imported = duplicates = 0
        for emp, items in punches.items():
            for when, kind, n in sorted(items, key=lambda x: x[0]):
                if await conn.fetchval("select 1 from hrms_punches where employee_id = $1 and at = $2", emp, when):
                    duplicates += 1
                    continue
                k = kind or await attendance.next_kind(conn, emp, when)
                if await attendance.punch(conn, emp, k, method="biometric", at=when, by=auth.user_id) is None:
                    errors.append(ImportRowError(row=n, error=f"A check-out at {when:%d %b %H:%M} has no check-in that day"))
                    continue
                imported += 1
    return BiometricImportOut(imported=imported, duplicates=duplicates, unknown_codes=sorted(unknown),
                              errors=errors[:200])
