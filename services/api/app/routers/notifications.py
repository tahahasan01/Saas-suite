"""Notifications — the signed-in user's in-app feed."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status

from .. import db
from ..deps import AuthContext, current_auth
from ..models import NotificationList, NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationList)
async def list_notifications(auth: AuthContext = Depends(current_auth)) -> NotificationList:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select id, title, body, kind, link, read, created_at from notifications
               where user_id = $1 order by created_at desc limit 30""",
            auth.user_id,
        )
        unread = await conn.fetchval(
            "select count(*) from notifications where user_id = $1 and not read", auth.user_id)
    return NotificationList(
        items=[NotificationOut(id=str(r["id"]), title=r["title"], body=r["body"], kind=r["kind"],
                               link=r["link"], read=r["read"], created_at=r["created_at"]) for r in rows],
        unread=unread,
    )


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(response: Response, auth: AuthContext = Depends(current_auth)) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await conn.execute("update notifications set read = true where user_id = $1 and not read", auth.user_id)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
