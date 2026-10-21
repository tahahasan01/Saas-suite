"""Files: uploads, storage and 5-minute download links (D-14, TR-SEC-55..57, 0057).

Uploads are sniffed by their bytes, never their name or Content-Type, and
only images (PNG, JPEG, WebP), PDF, CSV and XLSX get in. Images are
re-encoded, which drops EXIF (GPS, camera serials). Blobs are keyed by
tenant and hash, so identical uploads in one tenant share a blob and a hash
can never be used to probe another tenant. Downloads check the owning
record and redirect to a link that dies after 5 minutes.
"""
from __future__ import annotations

import io
import time
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import asyncpg
import pytest
from PIL import Image

from app import context, files, jobs, storage
from app.config import settings

from .test_me_permissions import _member


def _png(w: int = 8, h: int = 8, color=(200, 30, 30)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "PNG")
    return buf.getvalue()


def _jpeg_with_exif() -> bytes:
    img = Image.new("RGB", (16, 16), (10, 120, 200))
    exif = Image.Exif()
    exif[0x010F] = "SpyCam"          # Make
    exif[0x0110] = "Model-X"         # Model
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif.tobytes())
    return buf.getvalue()


def _xlsx() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("xl/workbook.xml", "<workbook/>")
    return buf.getvalue()


def _zip_not_xlsx() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("evil.exe", "MZ")
    return buf.getvalue()


PDF = b"%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


# ── Sniffing ────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("data,mime", [
    (_png(), "image/png"),
    (_jpeg_with_exif(), "image/jpeg"),
    (PDF, "application/pdf"),
    (b"name,phone\nAli,03001234567\n", "text/csv"),
    ("﻿نام,فون\nعلی,0300\n".encode(), "text/csv"),
    (_xlsx(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
])
def test_allowed_types_are_recognised_by_their_bytes(data, mime):
    assert files.sniff(data) == mime


def _webp() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (4, 4)).save(buf, "WEBP")
    return buf.getvalue()


def test_webp_is_an_image():
    assert files.sniff(_webp()) == "image/webp"


@pytest.mark.parametrize("data", [
    b"<!DOCTYPE html><html><script>alert(1)</script></html>",
    b"<html><body>hi</body></html>",
    b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
    b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
    b"<?xml version='1.0'?><root/>",
    b"name,phone\n<script>alert(1)</script>,1\n",
    b"MZ\x90\x00\x03\x00\x00\x00",                        # a Windows executable
    b"GIF89a\x01\x00\x01\x00",                            # not on the list
    b"\x00\x01\x02binary\x00",                           # binary that isn't any of the above
    b"",
])
def test_everything_else_is_refused(data):
    with pytest.raises(files.Rejected):
        files.sniff(data)


def test_a_zip_that_is_not_a_workbook_is_refused():
    with pytest.raises(files.Rejected):
        files.sniff(_zip_not_xlsx())


def test_images_are_reencoded_without_exif():
    raw = _jpeg_with_exif()
    assert b"SpyCam" in raw
    clean, mime = files.clean(raw, "image/jpeg")
    assert mime == "image/jpeg" and b"SpyCam" not in clean
    assert not Image.open(io.BytesIO(clean)).getexif()


def _png_header_only(w: int, h: int) -> bytes:
    """A tiny PNG whose header claims w x h pixels (a decompression bomb's shape)."""
    import struct
    import zlib

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    idat = zlib.compress(b"\x00" * 64)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.mark.parametrize("w,h", [(9000, 9000), (20000, 20000), (100000, 300)])
def test_images_claiming_too_many_pixels_are_refused_before_decoding(w, h, monkeypatch):
    """Security review: the pixel budget is checked on the header, so a small
    upload declaring a huge image is never decoded into memory."""
    data = _png_header_only(w, h)
    assert len(data) < 200

    def no_decode(*a, **k):
        raise AssertionError("the image was decoded")
    monkeypatch.setattr(Image.Image, "load", no_decode)
    with pytest.raises(files.TooLarge):
        files.clean(data, "image/png")


async def test_a_decompression_bomb_upload_is_a_413(client, crm_tenant):
    r = await _upload(client, _png_header_only(20000, 20000), "bomb.png")
    assert r.status_code == 413


def test_huge_images_are_scaled_down():
    clean, _ = files.clean(_png(5000, 10), "image/png")
    assert Image.open(io.BytesIO(clean)).width <= files.MAX_IMAGE_PX


# ── S3 presigning (AWS SigV4 documented example) ────────────────────────────
def test_s3_presign_matches_the_aws_signature_v4_example():
    """AWS S3 docs, 'Authenticating Requests: Using Query Parameters'."""
    s3 = storage.S3Storage(endpoint="https://examplebucket.s3.amazonaws.com", bucket="", region="us-east-1",
                           access_key="AKIAIOSFODNN7EXAMPLE",
                           secret_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", virtual_host=True)
    url = s3.presign_get("test.txt", expires_s=86400, now=datetime(2013, 5, 24, tzinfo=timezone.utc))
    q = parse_qs(urlsplit(url).query)
    assert urlsplit(url).path == "/test.txt"
    assert q["X-Amz-Signature"] == ["aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"]


def test_s3_presign_is_five_minutes_and_sets_the_download_headers():
    s3 = storage.S3Storage(endpoint="https://acct.r2.cloudflarestorage.com", bucket="bos", region="auto",
                           access_key="AK", secret_key="SK")
    url = s3.presign_get("t/x/ab/abc", filename="invoice.pdf", content_type="application/pdf", attachment=True)
    q = parse_qs(urlsplit(url).query)
    assert urlsplit(url).path == "/bos/t/x/ab/abc"
    assert q["X-Amz-Expires"] == ["300"]
    assert q["response-content-disposition"][0].startswith("attachment;")
    assert q["response-content-type"] == ["application/pdf"]


# ── Upload and download through the API ─────────────────────────────────────
@pytest.fixture(autouse=True)
def _local_store(tmp_path, monkeypatch):
    """Every test gets its own empty local store."""
    store = storage.LocalStorage(root=tmp_path, secret=b"test-secret", public_base="/api")
    monkeypatch.setattr(storage, "_store", store)
    return store


async def _upload(client, data: bytes, name: str = "logo.png", **params):
    return await client.post("/files", params={"name": name, **params}, content=data,
                             headers={"Content-Type": "application/octet-stream"})


async def _follow(client, r):
    """The redirect goes to /api/files/_local/... (the web's /api rewrite);
    the test client talks to the API directly."""
    assert r.status_code == 302, r.text
    loc = r.headers["location"]
    assert loc.startswith("/api/")
    return await client.get(loc[len("/api"):])


async def test_upload_then_download(client, crm_tenant, _local_store):
    r = await _upload(client, _png())
    assert r.status_code == 201, r.text
    f = r.json()
    assert f["mime"] == "image/png" and f["original_name"] == "logo.png" and len(f["sha256"]) == 64
    got = await _follow(client, await client.get(f"/files/{f['id']}"))
    assert got.status_code == 200
    assert got.headers["content-type"] == "image/png"
    assert got.headers["x-content-type-options"] == "nosniff"
    assert Image.open(io.BytesIO(got.content)).size == (8, 8)


async def test_the_name_and_content_type_header_are_not_believed(client, crm_tenant):
    r = await client.post("/files", params={"name": "cute.png"},
                          content=b"<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>",
                          headers={"Content-Type": "image/png"})
    assert r.status_code == 415


async def test_pdfs_download_as_attachments(client, crm_tenant):
    f = (await _upload(client, PDF, "bill.pdf")).json()
    got = await _follow(client, await client.get(f"/files/{f['id']}"))
    assert got.headers["content-disposition"].startswith("attachment;")
    assert got.headers["content-type"] == "application/pdf"


async def test_a_tampered_or_expired_link_is_refused(client, crm_tenant):
    f = (await _upload(client, _png())).json()
    loc = (await client.get(f"/files/{f['id']}")).headers["location"][len("/api"):]
    assert (await client.get(loc.replace("sig=", "sig=0"))).status_code == 403
    parts = urlsplit(loc)
    q = {k: v[0] for k, v in parse_qs(parts.query).items()}
    q["exp"] = str(int(time.time()) - 1)
    stale = parts.path + "?" + "&".join(f"{k}={v}" for k, v in q.items())
    assert (await client.get(stale)).status_code == 403


async def test_links_last_five_minutes(client, crm_tenant):
    f = (await _upload(client, _png())).json()
    loc = (await client.get(f"/files/{f['id']}")).headers["location"]
    exp = int(parse_qs(urlsplit(loc).query)["exp"][0])
    assert 290 <= exp - time.time() <= 301


async def test_identical_uploads_share_a_blob_within_a_tenant_only(client, _local_store):
    from ..conftest import _drop, _signup
    data = _png(color=(1, 2, 3))
    t1 = await _signup(client, ["crm"])
    try:
        a = (await _upload(client, data)).json()
        b = (await _upload(client, data, "again.png")).json()
        assert a["id"] != b["id"] and a["sha256"] == b["sha256"]
        t2 = await _signup(client, ["crm"])  # client is now t2's owner
        try:
            c = (await _upload(client, data)).json()
            conn = await asyncpg.connect(settings.database_url)
            try:
                keys = {r["id"]: r["storage_key"] for r in await conn.fetch(
                    "select id::text, storage_key from files where id = any($1::uuid[])", [a["id"], b["id"], c["id"]])}
            finally:
                await conn.close()
            assert keys[a["id"]] == keys[b["id"]]
            assert keys[c["id"]] != keys[a["id"]]
            assert keys[a["id"]].startswith(f"t/{t1}/") and keys[c["id"]].startswith(f"t/{t2}/")
            # One blob per tenant: the second upload in t1 reused the first.
            assert len([p for p in _local_store.root.rglob("*") if p.is_file()]) == 2
        finally:
            await _drop(t2)
    finally:
        await _drop(t1)


async def test_a_draft_is_visible_only_to_its_uploader(client, crm_tenant):
    f = (await _upload(client, _png())).json()
    mate, _ = await _member(client, {"crm": ["read"]})
    try:
        assert (await mate.get(f"/files/{f['id']}")).status_code == 404
    finally:
        await mate.aclose()


async def test_another_tenants_file_is_not_found(client):
    from ..conftest import _drop, _signup
    t1 = await _signup(client, ["crm"])
    f = (await _upload(client, _png())).json()
    t2 = await _signup(client, ["crm"])
    try:
        assert (await client.get(f"/files/{f['id']}")).status_code == 404
    finally:
        await _drop(t1)
        await _drop(t2)


async def test_uploads_over_ten_megabytes_are_refused(client, crm_tenant):
    r = await _upload(client, b"a,b\n" * (3 * 1024 * 1024), "big.csv")
    assert r.status_code == 413


async def test_logos_are_limited_to_one_megabyte(client, crm_tenant):
    noisy = Image.effect_noise((1400, 1400), 90).convert("RGB")
    buf = io.BytesIO()
    noisy.save(buf, "PNG")
    assert buf.tell() > 1024 * 1024
    r = await _upload(client, buf.getvalue(), "logo.png", purpose="logo")
    assert r.status_code == 413
    r = await _upload(client, PDF, "logo.pdf", purpose="logo")
    assert r.status_code == 415  # a logo must be an image


async def test_upload_needs_a_session(client):
    r = await client.post("/files", params={"name": "x.png"}, content=_png())
    assert r.status_code == 401


# ── Garbage collection ──────────────────────────────────────────────────────
async def test_gc_removes_old_drafts_and_orphan_blobs_but_keeps_the_rest(client, crm_tenant, _local_store):
    draft = (await _upload(client, _png(color=(9, 9, 9)))).json()
    kept = (await _upload(client, _png(color=(8, 8, 8)))).json()
    fresh = (await _upload(client, _png(color=(7, 7, 7)))).json()
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute("update files set created_at = now() - interval '25 hours' where id = any($1::uuid[])",
                           [draft["id"], kept["id"]])
        await conn.execute("update files set entity='tenant_branding', entity_id=tenant_id::text, field='logo' "
                           "where id=$1", uuid.UUID(kept["id"]))
        draft_key = await conn.fetchval("select storage_key from files where id=$1", uuid.UUID(draft["id"]))
    finally:
        await conn.close()
    orphan_old = f"t/{crm_tenant.tenant_id}/ff/" + "f" * 64
    orphan_new = f"t/{crm_tenant.tenant_id}/ee/" + "e" * 64
    await _local_store.put(orphan_old, b"x", "text/csv")
    await _local_store.put(orphan_new, b"y", "text/csv")
    _local_store.age(orphan_old, hours=2)
    _local_store.age(draft_key, hours=2)

    with context.job("files.gc", "1"):
        result = await jobs.HANDLERS["files.gc"]()
    assert result["drafts_deleted"] == 1 and result["blobs_deleted"] == 2

    conn = await asyncpg.connect(settings.database_url)
    try:
        ids = {str(r["id"]) for r in await conn.fetch("select id from files where tenant_id=$1",
                                                      uuid.UUID(crm_tenant.tenant_id))}
    finally:
        await conn.close()
    assert ids == {kept["id"], fresh["id"]}
    assert not await _local_store.exists(orphan_old) and not await _local_store.exists(draft_key)
    assert await _local_store.exists(orphan_new)  # too young: its row may be committing
    # Second run: nothing left to do.
    with context.job("files.gc", "2"):
        again = await jobs.HANDLERS["files.gc"]()
    assert again == {"drafts_deleted": 0, "blobs_deleted": 0}


async def test_gc_is_scheduled_daily():
    conn = await asyncpg.connect(settings.database_url)
    try:
        every = await conn.fetchval("select run_every from scheduled_jobs where code='files.gc'")
    finally:
        await conn.close()
    assert every == timedelta(days=1)
    assert "files.gc" in jobs.HANDLERS
