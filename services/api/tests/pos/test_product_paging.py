"""Product list paging.

The list used to stop at 200 rows with no way to ask for more, and the Products
page filtered that capped list in the browser — the 201st product onwards
(alphabetically) could not be found, edited or archived from the UI.
"""
from __future__ import annotations

from app import db

BULK = 230  # comfortably past the old 200-row cap


async def _bulk(tenant_id: str, n: int = BULK) -> None:
    async with db.tenant_conn(tenant_id) as conn:
        await conn.execute(
            """insert into pos_products (tenant_id, name, sku, barcode, price_minor)
               select $1, 'Zz Bulk ' || lpad(g::text, 3, '0'), 'BULK-' || g, '77000' || lpad(g::text, 3, '0'), 100
                 from generate_series(1, $2) g""", tenant_id, n)


def _total(r) -> int:
    return int(r.headers["x-total-count"])


async def test_unfiltered_list_reports_the_full_total(client, pos_tenant):
    await _bulk(pos_tenant.tenant_id)
    r = await client.get("/pos/products")
    assert r.status_code == 200
    assert len(r.json()) == 200  # default page size unchanged for existing callers
    assert _total(r) >= BULK


async def test_pages_cover_every_product_exactly_once(client, pos_tenant):
    await _bulk(pos_tenant.tenant_id)
    total = _total(await client.get("/pos/products?limit=1"))
    seen: list[str] = []
    offset = 0
    while offset < total:
        r = await client.get(f"/pos/products?limit=100&offset={offset}")
        assert _total(r) == total
        page = r.json()
        assert page, "a page inside the total came back empty"
        seen += [p["id"] for p in page]
        offset += len(page)
    assert len(seen) == total
    assert len(set(seen)) == total  # stable order: no row twice, none skipped
    # The last bulk product sorts after the sample catalog and past row 200.
    names = [p["name"] for p in (await client.get(f"/pos/products?limit=500")).json()]
    assert "Zz Bulk 230" in names
    assert names.index("Zz Bulk 230") >= 200


async def test_search_is_server_side_and_reports_its_total(client, pos_tenant):
    await _bulk(pos_tenant.tenant_id)
    r = await client.get("/pos/products?q=zz bulk 23")
    # 230 plus 023 and 123 and 223 — whatever the cap, a product past the old 200 is found.
    names = {p["name"] for p in r.json()}
    assert "Zz Bulk 230" in names
    assert _total(r) == len(r.json())

    r = await client.get("/pos/products?q=Zz Bulk&limit=10&offset=220")
    assert _total(r) == BULK
    assert [p["name"] for p in r.json()] == [f"Zz Bulk {i:03d}" for i in range(221, 231)]


async def test_search_matches_sku_barcode_fragment_and_hs_code(client, pos_tenant):
    await _bulk(pos_tenant.tenant_id, 3)
    assert [p["name"] for p in (await client.get("/pos/products?q=BULK-2")).json()] == ["Zz Bulk 002"]
    assert [p["name"] for p in (await client.get("/pos/products?q=77000003")).json()] == ["Zz Bulk 003"]
    p = (await client.get("/pos/products?q=Zz Bulk 001")).json()[0]
    await client.patch(f"/pos/products/{p['id']}", json={"hs_code": "9999.1234"})
    assert [x["name"] for x in (await client.get("/pos/products?q=9999.12")).json()] == ["Zz Bulk 001"]


async def test_archived_are_counted_only_when_asked(client, pos_tenant):
    await _bulk(pos_tenant.tenant_id, 2)
    p = (await client.get("/pos/products?q=Zz Bulk 001")).json()[0]
    await client.patch(f"/pos/products/{p['id']}", json={"active": False})
    assert _total(await client.get("/pos/products?q=Zz Bulk")) == 1
    assert _total(await client.get("/pos/products?q=Zz Bulk&include_archived=true")) == 2


async def test_limit_is_bounded(client, pos_tenant):
    assert (await client.get("/pos/products?limit=0")).status_code == 422
    assert (await client.get("/pos/products?limit=10000")).status_code == 422
    assert (await client.get("/pos/products?offset=-1")).status_code == 422


async def test_total_header_is_readable_cross_origin(client, pos_tenant):
    """The web app calls the API from another origin; without
    Access-Control-Expose-Headers the browser hides the total from fetch()."""
    r = await client.get("/pos/products", headers={"Origin": "http://localhost:3000"})
    assert "x-total-count" in r.headers.get("access-control-expose-headers", "").lower()
