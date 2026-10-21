"""Blob storage behind the files table (D-14, TR-SEC-57).

Two backends with one interface:

* LocalStorage: blobs on disk, downloaded through `/files/_local/...` on
  the API with an HMAC-signed, 5-minute URL. Fine for dev, or for a single
  VPS with the directory on a volume.
* S3Storage: any S3-compatible store (Cloudflare R2, MinIO, B2). Downloads
  are SigV4 presigned GET URLs valid 5 minutes; puts, deletes and listings
  are signed requests over httpx. No SDK dependency.

`get()` returns the configured backend (STORAGE_BACKEND, S3_* settings).
Keys look like t/{tenant}/{sha[:2]}/{sha}: dedupe is per tenant only.
"""
from __future__ import annotations

import hashlib
import hmac
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol
from urllib.parse import quote, urlsplit

import httpx

from .config import settings

DOWNLOAD_TTL_S = 300


@dataclass(frozen=True)
class StoredObject:
    key: str
    modified: datetime


class Storage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...
    async def get_bytes(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> None: ...
    async def exists(self, key: str) -> bool: ...
    async def list(self, prefix: str) -> list[StoredObject]: ...
    def presign_get(self, key: str, *, expires_s: int = DOWNLOAD_TTL_S, filename: str = "",
                    content_type: str = "", attachment: bool = False,
                    now: datetime | None = None) -> str: ...


def content_disposition(filename: str, attachment: bool) -> str:
    kind = "attachment" if attachment else "inline"
    safe = "".join(c for c in filename if c.isalnum() or c in "._- ") or "file"
    return f"{kind}; filename=\"{safe}\"; filename*=UTF-8''{quote(filename or 'file')}"


# ── Local disk ──────────────────────────────────────────────────────────────
class LocalStorage:
    def __init__(self, root: Path, secret: bytes, public_base: str = "/api") -> None:
        self.root = root
        self.secret = secret
        self.public_base = public_base.rstrip("/")

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root.resolve() not in p.parents:
            raise ValueError("storage key escapes the root")
        return p

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".part")
        tmp.write_bytes(data)
        tmp.replace(p)

    async def get_bytes(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    async def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    async def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    async def list(self, prefix: str) -> list[StoredObject]:
        base = self.root.resolve()
        out = []
        for p in base.rglob("*"):
            if p.is_file() and not p.name.endswith(".part"):
                key = p.relative_to(base).as_posix()
                if key.startswith(prefix):
                    out.append(StoredObject(key, datetime.fromtimestamp(p.stat().st_mtime, timezone.utc)))
        return out

    def age(self, key: str, *, hours: float) -> None:
        """Test helper: pretend a blob was written `hours` ago."""
        import os
        t = time.time() - hours * 3600
        os.utime(self._path(key), (t, t))

    def sign(self, key: str, exp: int, content_type: str, disposition: str) -> str:
        msg = "\n".join((key, str(exp), content_type, disposition)).encode()
        return hmac.new(self.secret, msg, hashlib.sha256).hexdigest()

    def presign_get(self, key: str, *, expires_s: int = DOWNLOAD_TTL_S, filename: str = "",
                    content_type: str = "", attachment: bool = False,
                    now: datetime | None = None) -> str:
        start = int((now or datetime.now(timezone.utc)).timestamp())
        exp = start + expires_s
        disp = content_disposition(filename, attachment)
        sig = self.sign(key, exp, content_type, disp)
        return (f"{self.public_base}/files/_local/{quote(key)}?exp={exp}"
                f"&ct={quote(content_type, safe='')}&cd={quote(disp, safe='')}&sig={sig}")

    def verify(self, key: str, exp: int, content_type: str, disposition: str, sig: str) -> bool:
        if exp < time.time():
            return False
        return hmac.compare_digest(self.sign(key, exp, content_type, disposition), sig)


# ── S3-compatible (SigV4) ───────────────────────────────────────────────────
def _hmac(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def _q(s: str) -> str:
    return quote(s, safe="-_.~")


class S3Storage:
    def __init__(self, *, endpoint: str, bucket: str, region: str, access_key: str, secret_key: str,
                 virtual_host: bool = False) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.bucket = bucket
        self.region = region
        self.access_key = access_key
        self.secret_key = secret_key
        # virtual_host: the bucket is already in the endpoint's host name.
        self.virtual_host = virtual_host

    def _path(self, key: str) -> str:
        p = "/" + quote(key, safe="/-_.~")
        return p if self.virtual_host or not self.bucket else f"/{self.bucket}{p}"

    def _signing_key(self, day: str) -> bytes:
        k = _hmac(("AWS4" + self.secret_key).encode(), day)
        for part in (self.region, "s3", "aws4_request"):
            k = _hmac(k, part)
        return k

    def _signature(self, method: str, path: str, query: dict[str, str], headers: dict[str, str],
                   payload_hash: str, amz_date: str) -> tuple[str, str]:
        canon_q = "&".join(f"{_q(k)}={_q(v)}" for k, v in sorted(query.items()))
        names = sorted(h.lower() for h in headers)
        canon_h = "".join(f"{n}:{headers[n].strip()}\n" for n in names)
        signed = ";".join(names)
        creq = "\n".join((method, path, canon_q, canon_h, signed, payload_hash))
        scope = f"{amz_date[:8]}/{self.region}/s3/aws4_request"
        sts = "\n".join(("AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(creq.encode()).hexdigest()))
        return hmac.new(self._signing_key(amz_date[:8]), sts.encode(), hashlib.sha256).hexdigest(), signed

    def presign_get(self, key: str, *, expires_s: int = DOWNLOAD_TTL_S, filename: str = "",
                    content_type: str = "", attachment: bool = False,
                    now: datetime | None = None) -> str:
        t = now or datetime.now(timezone.utc)
        amz_date = t.strftime("%Y%m%dT%H%M%SZ")
        host = urlsplit(self.endpoint).netloc
        path = self._path(key)
        query = {
            "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
            "X-Amz-Credential": f"{self.access_key}/{amz_date[:8]}/{self.region}/s3/aws4_request",
            "X-Amz-Date": amz_date,
            "X-Amz-Expires": str(expires_s),
            "X-Amz-SignedHeaders": "host",
        }
        if filename:
            query["response-content-disposition"] = content_disposition(filename, attachment)
        if content_type:
            query["response-content-type"] = content_type
        sig, _ = self._signature("GET", path, query, {"host": host}, "UNSIGNED-PAYLOAD", amz_date)
        qs = "&".join(f"{_q(k)}={_q(v)}" for k, v in sorted(query.items()))
        return f"{self.endpoint}{path}?{qs}&X-Amz-Signature={sig}"

    async def _request(self, method: str, key: str = "", *, query: dict[str, str] | None = None,
                       body: bytes = b"", content_type: str = "") -> httpx.Response:
        query = query or {}
        amz_date = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        payload_hash = hashlib.sha256(body).hexdigest()
        path = self._path(key) if key else (f"/{self.bucket}" if self.bucket and not self.virtual_host else "/")
        headers = {"host": urlsplit(self.endpoint).netloc, "x-amz-content-sha256": payload_hash,
                   "x-amz-date": amz_date}
        if content_type:
            headers["content-type"] = content_type
        sig, signed = self._signature(method, path, query, headers, payload_hash, amz_date)
        headers["authorization"] = (
            f"AWS4-HMAC-SHA256 Credential={self.access_key}/{amz_date[:8]}/{self.region}/s3/aws4_request, "
            f"SignedHeaders={signed}, Signature={sig}")
        qs = "&".join(f"{_q(k)}={_q(v)}" for k, v in sorted(query.items()))
        url = f"{self.endpoint}{path}" + (f"?{qs}" if qs else "")
        async with httpx.AsyncClient(timeout=30) as client:
            return await client.request(method, url, headers=headers, content=body)

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        r = await self._request("PUT", key, body=data, content_type=content_type)
        r.raise_for_status()

    async def get_bytes(self, key: str) -> bytes:
        r = await self._request("GET", key)
        r.raise_for_status()
        return r.content

    async def delete(self, key: str) -> None:
        r = await self._request("DELETE", key)
        if r.status_code not in (200, 204, 404):
            r.raise_for_status()

    async def exists(self, key: str) -> bool:
        r = await self._request("HEAD", key)
        return r.status_code == 200

    async def list(self, prefix: str) -> list[StoredObject]:
        out: list[StoredObject] = []
        token = ""
        ns = "{http://s3.amazonaws.com/doc/2006-03-01/}"
        while True:
            q = {"list-type": "2", "prefix": prefix}
            if token:
                q["continuation-token"] = token
            r = await self._request("GET", query=q)
            r.raise_for_status()
            # Our own bucket's listing, not user input; expat never fetches
            # external entities and Python 3.12's expat caps entity expansion.
            root = ET.fromstring(r.content)
            for c in root.iter(f"{ns}Contents"):
                k = c.findtext(f"{ns}Key") or ""
                m = c.findtext(f"{ns}LastModified") or ""
                out.append(StoredObject(k, datetime.fromisoformat(m.replace("Z", "+00:00"))))
            token = root.findtext(f"{ns}NextContinuationToken") or ""
            if not token:
                return out


# ── The configured backend ──────────────────────────────────────────────────
_store: Storage | None = None


def _local_secret() -> bytes:
    seed = settings.files_url_secret or (settings.bos_data_keys + settings.database_url)
    return hashlib.sha256(b"bos-files-url:" + seed.encode()).digest()


def get() -> Storage:
    global _store
    if _store is None:
        if settings.storage_backend == "s3":
            _store = S3Storage(endpoint=settings.s3_endpoint, bucket=settings.s3_bucket,
                               region=settings.s3_region, access_key=settings.s3_access_key_id,
                               secret_key=settings.s3_secret_access_key)
        else:
            root = Path(settings.files_local_dir) if settings.files_local_dir \
                else Path(__file__).resolve().parents[1] / ".files"
            _store = LocalStorage(root=root, secret=_local_secret(), public_base=settings.files_public_base)
    return _store
