"""Product CSV import/export for the POS catalog."""
from __future__ import annotations

CSV = "text/csv"


# ── products endpoint ───────────────────────────────────────────────────────
async def test_product_import_with_prices_and_tax(client, pos_tenant):
    csv = (
        "Item Name,Sale Price,Qty,Barcode,Tax %\n"
        "Lux Soap,Rs 120.50,48,890123,18\n"
    )
    r = await client.post("/pos/products/import", content=csv.encode(), headers={"Content-Type": CSV})
    assert r.json()["created"] == 1
    p = next(p for p in (await client.get("/pos/products")).json() if p["name"] == "Lux Soap")
    assert p["price_minor"] == 12_050
    assert p["stock_qty"] == 48
    assert p["tax_rate"] == 18


async def test_product_import_skips_existing_barcode(client, pos_tenant):
    csv = "name,barcode\nSoap A,111222\n"
    assert (await client.post("/pos/products/import", content=csv.encode(),
                              headers={"Content-Type": CSV})).json()["created"] == 1
    again = await client.post("/pos/products/import",
                              content="name,barcode\nSoap A renamed,111222\n".encode(),
                              headers={"Content-Type": CSV})
    assert again.json() == {"created": 0, "skipped_duplicates": 1, "errors": []}


async def test_product_export_round_trips(client, pos_tenant):
    r = await client.get("/pos/products/export")
    assert r.status_code == 200
    assert r.text.startswith("name,sku,barcode,category,price,cost,stock,hs_code,tax_rate")
