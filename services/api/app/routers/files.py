"""Upload and download files (D-14, TR-SEC-55..57).

POST /files?name=logo.png&purpose=logo   raw bytes in the body (no multipart
                                          parser needed); returns a draft
GET  /files/{id}                         302 to a 5-minute download link
GET  /files/_local/{key}?exp&ct&cd&sig   the local backend's signed link
"""
from __future__ import annotations

from typing import Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse

from .. import db, files, storage
from ..deps import AuthContext, current_auth
from ..org_models import FileOut

router = APIRouter(prefix="/files", tags=["files"])


def _out(r: asyncpg.Record) -> FileOut:
    return FileOut(id=str(r["id"]), mime=r["mime"], size_bytes=r["size_bytes"], sha256=r["sha256"],
                   original_name=r["original_name"])


@router.post("", response_model=FileOut, status_code=status.HTTP_201_CREATED)
async def upload(request: Request, name: str = Query(min_length=1, max_length=255),
                 purpose: Literal["attachment", "logo"] = "attachment",
                 auth: AuthContext = Depends(current_auth)) -> FileOut:
    if not auth.role_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No role assigned")
    data = await request.body()  # BodyLimitMiddleware already capped it at 10 MB
    if len(data) > files.MAX_UPLOAD:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Files can be at most 10 MB")
    try:
        async with db.tenant_conn(auth.tenant_id) as conn:
            row = await files.save_upload(conn, tenant_id=auth.tenant_id, user_id=auth.user_id,
                                          data=data, name=name, purpose=purpose)
    except files.TooLarge as e:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, str(e))
    except files.Rejected as e:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, str(e))
    return _out(row)


@router.get("/_local/{key:path}")
async def local_blob(key: str, exp: int, ct: str, cd: str, sig: str) -> Response:
    """Serves the local backend's signed links. Signed, so no session: an
    <img> or a download follows it like an S3 link."""
    store = storage.get()
    if not isinstance(store, storage.LocalStorage) or not store.verify(key, exp, ct, cd, sig):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This link has expired")
    try:
        data = await store.get_bytes(key)
    except (FileNotFoundError, ValueError):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return Response(content=data, media_type=ct, headers={
        "Content-Disposition": cd,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
        # Even if a browser rendered it, nothing in it could run.
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    })


@router.get("/{file_id}")
async def download(file_id: str, auth: AuthContext = Depends(current_auth)) -> RedirectResponse:
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await files.readable(conn, auth.user_id, file_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    url = storage.get().presign_get(
        row["storage_key"], filename=row["original_name"], content_type=row["mime"],
        # Only images are shown inline; PDFs, CSVs and workbooks download (TR-SEC-56).
        attachment=row["mime"] not in files.IMAGE_MIMES)
    return RedirectResponse(url, status_code=status.HTTP_302_FOUND, headers={"Cache-Control": "no-store"})
