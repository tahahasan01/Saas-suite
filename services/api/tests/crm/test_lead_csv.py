"""Lead CSV import/export: partial success with named bad rows, and duplicate
skipping that also sees rows earlier in the same file."""
from __future__ import annotations

from app.csv_io import LEAD_HEADERS, read_rows

CSV = "text/csv"


# ── leads endpoint ──────────────────────────────────────────────────────────
async def test_lead_import_creates_skips_and_reports(client, crm_tenant):
    before = len((await client.get("/crm/leads")).json())
    csv = (
        "Name,Company,Phone,Value\n"
        "Imran,Alpha Co,0311 1111111,10000\n"      # created
        ",No Name Co,0322 2222222,5\n"             # bad: no name -> reported
        "Imran Again,Beta Co,0311 1111111,20000\n"  # same phone as row 2 -> skipped
    )
    r = await client.post("/crm/leads/import", content=csv.encode(), headers={"Content-Type": CSV})
    assert r.status_code == 200
    result = r.json()
    assert result["created"] == 1
    assert result["skipped_duplicates"] == 1
    assert result["errors"] == [{"row": 3, "error": "Missing name"}]
    assert len((await client.get("/crm/leads")).json()) == before + 1


async def test_lead_import_can_force_past_duplicates(client, crm_tenant):
    csv = "Name,Phone\nA,0399 9999999\nB,0399 9999999\n"
    r = await client.post("/crm/leads/import?skip_duplicates=false",
                          content=csv.encode(), headers={"Content-Type": CSV})
    assert r.json()["created"] == 2


async def test_lead_export_round_trips(client, crm_tenant):
    r = await client.get("/crm/leads/export")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    header, *lines = r.text.strip().splitlines()
    assert header == "name,company,phone,email,source,value,stage,created_at"
    assert lines  # sample data seeded at signup

    # What we export, we must accept back.
    rows = read_rows(r.text.encode(), LEAD_HEADERS)
    assert rows[0]["name"]
