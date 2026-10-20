"""Request bodies have a ceiling (07 S12): a 50 MB JSON post must be turned
away at the door, not parsed into memory by every worker it reaches.

JSON endpoints get 1 MiB; CSV imports, which legitimately carry up to
csv_io.MAX_ROWS rows, get 5 MiB. Bodies sent without a Content-Length
(chunked) are counted as they stream in, so leaving the header off is no way
around it.
"""
from __future__ import annotations

MIB = 1024 * 1024


async def test_an_oversized_json_body_is_413(client, crm_tenant):
    r = await client.post("/crm/leads", content=b'{"name": "' + b"x" * (2 * MIB) + b'"}',
                          headers={"content-type": "application/json"})
    assert r.status_code == 413
    assert "too large" in r.json()["detail"].lower()


async def test_a_body_without_content_length_is_counted_as_it_streams(client, crm_tenant):
    async def chunks():
        for _ in range(3):
            yield b"x" * MIB

    r = await client.post("/crm/leads", content=chunks(), headers={"content-type": "application/json"})
    assert r.status_code == 413


async def test_a_normal_body_is_untouched(client, crm_tenant):
    r = await client.post("/crm/leads", json={"name": "Small Lead"})
    assert r.status_code in (200, 201), r.text


# 2 MiB: over the JSON ceiling, under the import one. Whatever the import then
# says about the content, it isn't the size gate turning it away.
_BIG_CSV = b"name\n" + (b"y" * 1000 + b"\n") * (2 * MIB // 1001)


def _not_size_gated(r) -> bool:
    return not (r.status_code == 413 and "too large" in r.text.lower())


async def test_lead_imports_may_be_larger_than_json(client, crm_tenant):
    r = await client.post("/crm/leads/import", content=_BIG_CSV, headers={"content-type": "text/csv"})
    assert _not_size_gated(r), r.text


async def test_product_imports_may_be_larger_than_json(client, pos_tenant):
    r = await client.post("/pos/products/import", content=_BIG_CSV, headers={"content-type": "text/csv"})
    assert _not_size_gated(r), r.text
