"""A drawn signature on online quotes (wave D leftovers, migration 0131).

The customer can draw a signature when accepting; a business can require
one. It is checked to be a small PNG, stored with the acceptance evidence,
frozen with it, printed on the PDF, and never handed back by the public
page (which only says whether one is needed)."""
from __future__ import annotations

import base64
import struct
import uuid
import zlib

import asyncpg
import pytest
import pytest_asyncio

from app.config import settings

from ..conftest import _drop, _signup
from .helpers import q
from .test_quotes import deal, quote, token_of


@pytest_asyncio.fixture
async def shop(client):
    tenant_id = await _signup(client, ["crm", "pos"])
    yield tenant_id
    await _drop(tenant_id)


def png(width: int = 300, height: int = 100) -> bytes:
    """A real (blank) PNG, the way a canvas exports one."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + b"\xff" * width * 3 for _ in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def data_url(b: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(b).decode()


async def accept(client, qt: dict, **extra):
    page = (await client.get(f"/public/quotes/{token_of(qt)}")).json()
    return await client.post(f"/public/quotes/{token_of(qt)}/accept",
                             json={"name": "Bilal Ahmed", "content_hash": page["content_hash"], **extra})


async def test_a_drawn_signature_is_kept_with_the_acceptance(client, shop):
    qt = await quote(client, (await deal(client))["id"])
    r = await accept(client, qt, signature=data_url(png()))
    assert r.status_code == 200, r.text
    assert r.json()["signed"] is True and "signature" not in r.json()
    [row] = await q("select accepted_signature from crm_quotes where id = $1", uuid.UUID(qt["id"]))
    assert bytes(row["accepted_signature"]).startswith(b"\x89PNG")
    staff = (await client.get(f"/crm/quotes/{qt['id']}")).json()
    assert staff["signed"] is True
    pdf = await client.get(f"/crm/quotes/{qt['id']}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


async def test_without_a_requirement_a_typed_name_is_enough(client, shop):
    qt = await quote(client, (await deal(client))["id"])
    page = (await client.get(f"/public/quotes/{token_of(qt)}")).json()
    assert page["signature_required"] is False
    r = await accept(client, qt)
    assert r.status_code == 200 and r.json()["signed"] is False


async def test_a_business_can_require_a_signature(client, shop):
    assert (await client.put("/crm/settings", json={"quote_require_signature": True})).json()[
        "quote_require_signature"] is True
    qt = await quote(client, (await deal(client))["id"])
    assert (await client.get(f"/public/quotes/{token_of(qt)}")).json()["signature_required"] is True
    assert (await accept(client, qt)).status_code == 422
    assert (await accept(client, qt, signature=data_url(png()))).status_code == 200


@pytest.mark.parametrize("bad", [
    "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff" + b"0" * 50).decode(),   # not a PNG
    "data:image/png;base64,not-base64!!",
    data_url(b"\x89PNG\r\n\x1a\n" + b"junk"),                                              # no header
    data_url(png(5000, 10)),                                                                # absurd size
    "data:image/png;base64," + "A" * 300_000,                                               # too big
], ids=["jpeg", "bad-base64", "no-header", "huge-dimensions", "too-big"])
async def test_only_a_small_real_png_is_taken(client, shop, bad):
    qt = await quote(client, (await deal(client))["id"])
    r = await accept(client, qt, signature=bad)
    assert r.status_code == 422, r.text
    [row] = await q("select status from crm_quotes where id = $1", uuid.UUID(qt["id"]))
    assert row["status"] == "sent"


async def test_the_signature_is_frozen_with_the_acceptance(client, shop):
    qt = await quote(client, (await deal(client))["id"])
    await accept(client, qt, signature=data_url(png()))
    conn = await asyncpg.connect(settings.database_url)
    try:
        with pytest.raises(asyncpg.RaiseError, match="frozen"):
            await conn.execute("update crm_quotes set accepted_signature = $2 where id = $1",
                               uuid.UUID(qt["id"]), png(10, 10))
    finally:
        await conn.close()
