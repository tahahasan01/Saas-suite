"""Document numbering settings (D-06, checklist §6.3).

List each sequence with the number the next document will get, and move a
counter forward (e.g. to continue from a paper book). Never backwards: that
would issue a number twice. Every move is audited.
"""
from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from .. import audit, db, sequences
from ..deps import AuthContext
from ..org_models import SequenceOut, SequenceUpdate
from ..rbac import perm

router = APIRouter(prefix="/sequences", tags=["sequences"])


async def _out(conn: asyncpg.Connection, seq: asyncpg.Record) -> SequenceOut:
    today = await sequences.local_date(conn, None)
    period, nxt, preview = await sequences.peek(conn, seq, today)
    return SequenceOut(
        id=str(seq["id"]), code=seq["code"], name=seq["name"],
        branch_id=str(seq["branch_id"]) if seq["branch_id"] else None,
        register_id=str(seq["register_id"]) if seq["register_id"] else None,
        pattern=seq["pattern"], padding=seq["padding"], reset=seq["reset"], gapless=seq["gapless"],
        period_key=period, next_value=nxt, preview=preview)


@router.get("", response_model=list[SequenceOut])
async def list_sequences(auth: AuthContext = Depends(perm("settings.sequences.read"))) -> list[SequenceOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return [await _out(conn, s) for s in await sequences.list_all(conn)]


@router.patch("/{sequence_id}", response_model=SequenceOut)
async def set_next(sequence_id: str, body: SequenceUpdate,
                   auth: AuthContext = Depends(perm("settings.sequences.manage"))) -> SequenceOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            moved = await sequences.set_next(conn, sequence_id, body.next_value, body.period_key)
        except ValueError as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))
        except asyncpg.CheckViolationError:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That period isn't valid")
        if moved is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Sequence not found")
        before, after, period = moved
        await audit.event(conn, "sequence.set_next", "sequence", sequence_id,
                          changes={"next_value": [before, after]}, data={"period_key": period})
        seq = await conn.fetchrow("select * from sequences where id = $1", sequence_id)
        return await _out(conn, seq)
