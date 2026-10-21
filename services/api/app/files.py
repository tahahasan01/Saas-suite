"""Uploaded files (D-14, TR-SEC-55..57, migration 0057).

* `sniff()` decides the type from the bytes alone. Allow-list: PNG, JPEG,
  WebP, PDF, CSV (UTF-8 text), XLSX. HTML, SVG, XML and anything else are
  refused, whatever the file name or Content-Type claims.
* `clean()` re-encodes images: EXIF (GPS, camera serials) and text chunks
  are dropped, orientation is applied first, and the long side is capped.
* Blobs are keyed t/{tenant}/{sha[:2]}/{sha}: identical uploads in a tenant
  share a blob; nothing is shared across tenants.
* A new upload is a draft (entity null). The owning record claims it with
  `attach()`; `detach()` turns it back into a draft. The daily `files.gc`
  job deletes drafts older than 24 hours and blobs no row points at.
* Downloads: the owning entity decides who may read (`register_reader`);
  a draft is readable by its uploader only.
"""
from __future__ import annotations

import hashlib
import io
import logging
import warnings
import zipfile
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone
from typing import Any, cast

import asyncpg
from PIL import Image, ImageOps

from . import db, storage
from .models import FileMime

log = logging.getLogger("files")

MIB = 1024 * 1024
MAX_UPLOAD = 10 * MIB          # TR-SEC-55: attachments and documents
MAX_LOGO = 1 * MIB             # TR-SEC-55: logos
MAX_IMAGE_PX = 4096            # TR-SEC-56: the long side after re-encoding
MAX_PIXELS = 25_000_000        # pixel budget checked on the header before decoding (~100 MB RGBA)
DRAFT_TTL = timedelta(hours=24)
BLOB_GRACE = timedelta(hours=1)  # a blob younger than this may belong to a row still committing

IMAGE_MIMES = ("image/png", "image/jpeg", "image/webp")
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_MARKUP = (b"<html", b"<!doctype", b"<svg", b"<?xml", b"<script", b"<body", b"<iframe", b"<head",
           b"<object", b"<embed", b"<meta")

# Pillow's own guard, a backstop behind MAX_PIXELS (clean() turns its warning into an error).
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class Rejected(ValueError):
    """Not a file type we accept (415)."""


class TooLarge(ValueError):
    """Over the size limit for its purpose (413)."""


def sniff(data: bytes) -> FileMime:
    if not data:
        raise Rejected("The file is empty")
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"PK\x03\x04"):
        try:
            names = zipfile.ZipFile(io.BytesIO(data)).namelist()
        except zipfile.BadZipFile:
            raise Rejected("That file is damaged")
        if "[Content_Types].xml" in names and any(n.startswith("xl/") for n in names):
            return cast(FileMime, XLSX)
        raise Rejected("Only Excel workbooks (.xlsx) are accepted, not other archives")
    return _sniff_csv(data)


def _sniff_csv(data: bytes) -> FileMime:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise Rejected("Only images, PDF, CSV and Excel files can be uploaded")
    if any(ord(c) < 32 and c not in "\t\r\n" for c in text):
        raise Rejected("Only images, PDF, CSV and Excel files can be uploaded")
    lowered = text[:4096].lower().encode()
    if text.lstrip().startswith("<") or any(m in lowered for m in _MARKUP):
        raise Rejected("Web pages, SVG and XML files can't be uploaded")
    return "text/csv"


def clean(data: bytes, mime: str) -> tuple[bytes, str]:
    """Re-encode images without metadata; other types pass through."""
    if mime not in IMAGE_MIMES:
        return data, mime
    with warnings.catch_warnings():
        # Pillow only warns between MAX_IMAGE_PIXELS and twice that; here a
        # warning is a refusal (local filter, not process-wide).
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        try:
            img: Image.Image = Image.open(io.BytesIO(data))
            # The header's size, before a single pixel is decoded: a small
            # upload claiming a huge image never reaches load() (security review).
            w, h = img.size
            if w * h > MAX_PIXELS:
                raise TooLarge(f"That image is too large ({w}×{h}); keep it under {MAX_PIXELS // 1_000_000} megapixels")
            if mime == "image/jpeg":
                img.draft("RGB", (MAX_IMAGE_PX, MAX_IMAGE_PX))  # decode JPEGs at a reduced scale
            img.load()
            img = ImageOps.exif_transpose(img)
        except TooLarge:
            raise
        except (Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise TooLarge("That image is too large")
        except (OSError, SyntaxError, ValueError):
            raise Rejected("That image can't be read")
    if max(img.size) > MAX_IMAGE_PX:
        img.thumbnail((MAX_IMAGE_PX, MAX_IMAGE_PX))
    out = io.BytesIO()
    if mime == "image/jpeg":
        img.convert("RGB").save(out, "JPEG", quality=90, optimize=True)
    elif mime == "image/webp":
        img.save(out, "WEBP", quality=90)
    else:
        if img.mode not in ("RGB", "RGBA", "L", "LA", "P"):
            img = img.convert("RGBA")
        img.save(out, "PNG", optimize=True)
    return out.getvalue(), mime


def storage_key(tenant_id: str, sha: str) -> str:
    return f"t/{tenant_id}/{sha[:2]}/{sha}"


_COLS = "id, tenant_id, sha256, size_bytes, mime, original_name, storage_key, entity, entity_id, field, created_by"


async def save_upload(conn: asyncpg.Connection, *, tenant_id: str, user_id: str, data: bytes,
                      name: str, purpose: str = "attachment") -> asyncpg.Record:
    """Sniff, clean, store and record an upload as a draft."""
    if purpose == "logo" and len(data) > MAX_LOGO:
        raise TooLarge("A logo can be at most 1 MB")
    sniffed = sniff(data)
    if purpose == "logo" and sniffed not in IMAGE_MIMES:
        raise Rejected("A logo must be a PNG, JPEG or WebP image")
    data, mime = clean(data, sniffed)
    sha = hashlib.sha256(data).hexdigest()
    key = storage_key(tenant_id, sha)
    # Always written, even when the blob exists: that refreshes its age, so
    # the GC's grace period covers a blob being reused right now.
    await storage.get().put(key, data, mime)
    row: asyncpg.Record = await conn.fetchrow(
        f"""insert into files (tenant_id, sha256, size_bytes, mime, original_name, storage_key, created_by)
            values ($1, $2, $3, $4, $5, $6, $7) returning {_COLS}""",
        tenant_id, sha, len(data), mime, name[:255], key, user_id)
    return row


# ── Who may read a file: delegated to the owning entity ─────────────────────
Reader = Callable[[asyncpg.Connection, str, asyncpg.Record], Awaitable[bool]]
READERS: dict[str, Reader] = {}


def register_reader(entity: str, reader: Reader) -> None:
    """`reader(conn, user_id, file_row)` -> may this user read it? Register
    one per entity that attaches files (e.g. 'hrms_employee' checks the
    employee read permission and the CNIC field guard)."""
    READERS[entity] = reader


async def _any_user_of_the_tenant(conn: asyncpg.Connection, user_id: str, row: asyncpg.Record) -> bool:
    return True  # RLS already confined the row to the caller's tenant


register_reader("tenant_branding", _any_user_of_the_tenant)


async def readable(conn: asyncpg.Connection, user_id: str, file_id: str) -> asyncpg.Record | None:
    row: asyncpg.Record | None = await conn.fetchrow(f"select {_COLS} from files where id = $1", file_id)
    if row is None:
        return None
    if row["entity"] is None:
        return row if str(row["created_by"]) == user_id else None
    reader = READERS.get(row["entity"])
    if reader is None or not await reader(conn, user_id, row):
        return None
    return row


async def attach(conn: asyncpg.Connection, file_id: str, *, entity: str, entity_id: str, field: str,
                 user_id: str) -> asyncpg.Record | None:
    """Claim the caller's own draft for a record. None if it isn't one."""
    row: asyncpg.Record | None = await conn.fetchrow(
        f"""update files set entity = $2, entity_id = $3, field = $4, draft_since = null
             where id = $1 and entity is null and created_by = $5 returning {_COLS}""",
        file_id, entity, entity_id, field, user_id)
    return row


async def detach(conn: asyncpg.Connection, *, entity: str, entity_id: str, field: str) -> None:
    """Release a record's file: it becomes a draft again and the GC removes
    it after DRAFT_TTL."""
    await conn.execute(
        """update files set entity = null, entity_id = null, field = null, draft_since = now()
            where entity = $1 and entity_id = $2 and field = $3""", entity, entity_id, field)


# ── Garbage collection (worker job files.gc, daily) ─────────────────────────
async def gc() -> dict[str, Any]:
    """Delete drafts older than 24 hours, then blobs no files row points at
    (older than the grace period). Owner connection: it spans tenants."""
    store = storage.get()
    async with db.owner_conn() as conn:
        drafts = await conn.fetch(
            """delete from files where entity is null and coalesce(draft_since, created_at) < now() - $1::interval
               returning storage_key""", DRAFT_TTL)
        cutoff = datetime.now(timezone.utc) - BLOB_GRACE
        candidates = [o.key for o in await store.list("t/") if o.modified < cutoff]
        live = {r["storage_key"] for r in await conn.fetch(
            "select distinct storage_key from files where storage_key = any($1::text[])", candidates)}
    deleted = 0
    for key in candidates:
        if key not in live:
            await store.delete(key)
            deleted += 1
    if drafts or deleted:
        log.info("files.gc removed %d draft rows and %d blobs", len(drafts), deleted)
    return {"drafts_deleted": len(drafts), "blobs_deleted": deleted}
