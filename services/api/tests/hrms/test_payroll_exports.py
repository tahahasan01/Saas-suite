"""Exports from an approved run (St03 §6.5–6.6, §7): the monthly WHT
worksheet, EOBI and PESSI/SESSI challan worksheets, the annual salary
certificate and a generic bank CSV with IBAN validation. We export; we
never file anything with FBR, EOBI or the provinces."""
from __future__ import annotations

import csv
import io
import uuid

from app import jobs

from .payroll_helpers import login_with_role, new_employee, owner_execute, owner_fetch

MONTH = "2026-09"
GOOD_IBAN = "PK36SCBL0000001123456702"


async def approved(client, month=MONTH) -> dict:
    run = (await client.post("/payroll/runs", json={"month": month})).json()
    await client.post(f"/payroll/runs/{run['id']}/calculate")
    await jobs.HANDLERS["payroll.calculate"]()
    assert (await client.post(f"/payroll/runs/{run['id']}/approve")).status_code == 200
    return (await client.get(f"/payroll/runs/{run['id']}")).json()


def rows(text: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(text)))


async def test_the_wht_worksheet_lists_cnic_taxable_and_tax(client, tenant):
    emp = await new_employee(client, name="Ayesha", salary_minor=30_000_000, join_date="2026-01-01",
                             cnic="35202-1234567-3")
    run = await approved(client)
    r = await client.get(f"/payroll/runs/{run['id']}/exports/wht.csv")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    table = rows(r.text)
    header = table[0]
    assert header[:5] == ["Employee", "CNIC", "NTN", "Taxable salary (PKR)", "Tax deducted (PKR)"]
    ayesha = next(row for row in table if row[0] == "Ayesha")
    slip = next(p for p in run["payslips"] if p["employee_id"] == emp["id"])
    assert ayesha[1] == "35202-1234567-3"
    assert ayesha[4] == f"{slip['tax_minor'] / 100:.2f}"
    assert table[-1][0] == "Total"
    assert float(table[-1][4]) == sum(p["tax_minor"] for p in run["payslips"]) / 100
    audited = await owner_fetch("select 1 from audit_log where tenant_id = $1 and action = 'payroll.export'",
                                uuid.UUID(tenant.tenant_id))
    assert audited


async def test_eobi_and_pessi_challans(client, tenant):
    await owner_execute("insert into fbr_settings (tenant_id, seller_province) values ($1, 'Punjab')",
                        uuid.UUID(tenant.tenant_id))
    await client.put("/payroll/statutory/EOBI", json={"enabled": True, "registration_no": "EOBI-REG-9"})
    await client.put("/payroll/statutory/PESSI", json={"enabled": True, "registration_no": "PESSI-REG-7"})
    await client.put(f"/payroll/employees/{tenant.employee_id}/details", json={"eobi_number": "E-1", "ss_number": "S-1"})
    run = await approved(client)
    eobi = rows((await client.get(f"/payroll/runs/{run['id']}/exports/eobi.csv")).text)
    assert "EOBI-REG-9" in eobi[0][1]
    header = eobi[1]
    assert header == ["Employee", "CNIC", "Registration no", "Base wage (PKR)", "Employee share (PKR)",
                      "Employer share (PKR)", "Total (PKR)"]
    row = next(r for r in eobi if r[2] == "E-1")
    assert row[3:7] == ["40000.00", "400.00", "2000.00", "2400.00"]
    pessi = rows((await client.get(f"/payroll/runs/{run['id']}/exports/social-security.csv?scheme=PESSI")).text)
    row = next(r for r in pessi if r[2] == "S-1")
    assert row[4:7] == ["0.00", "2400.00", "2400.00"]
    assert (await client.get(f"/payroll/runs/{run['id']}/exports/social-security.csv?scheme=NOPE")).status_code == 422


async def test_exports_need_an_approved_run_and_the_export_key(client, tenant):
    run = (await client.post("/payroll/runs", json={"month": MONTH})).json()
    assert (await client.get(f"/payroll/runs/{run['id']}/exports/wht.csv")).status_code == 409
    reader = await login_with_role(client, "Payroll reader", {"hrms": ["read"], "payroll": ["read"]})
    try:
        done = await approved(client, "2026-08")
        assert (await reader.get(f"/payroll/runs/{done['id']}/exports/wht.csv")).status_code == 403
        assert (await reader.get(f"/payroll/runs/{done['id']}/exports/bank.csv")).status_code == 403
    finally:
        await reader.aclose()


async def test_the_bank_file_pays_valid_ibans_and_lists_the_rest(client, tenant):
    good = await new_employee(client, name="Bilal", salary_minor=8_000_000, join_date="2026-01-01")
    bad = await new_employee(client, name="Sana", salary_minor=8_000_000, join_date="2026-01-01")
    await client.put(f"/payroll/employees/{good['id']}/details", json={"iban": GOOD_IBAN, "payment_mode": "bank",
                                                                       "bank_name": "SCB"})
    await client.put(f"/payroll/employees/{bad['id']}/details", json={"payment_mode": "bank"})   # no IBAN
    run = await approved(client)
    check = (await client.get(f"/payroll/runs/{run['id']}/exports/bank-check")).json()
    assert {p["name"] for p in check["problems"]} >= {"Sana"}
    assert any(p["name"] == "Sana" and "IBAN" in p["reason"] for p in check["problems"])
    assert check["ready"] == 1 and check["cash"] >= 1
    table = rows((await client.get(f"/payroll/runs/{run['id']}/exports/bank.csv")).text)
    assert table[0] == ["Beneficiary name", "IBAN", "Bank", "Amount (PKR)", "Reference"]
    assert len(table) == 2
    slip = next(p for p in run["payslips"] if p["employee_id"] == good["id"])
    assert table[1] == ["Bilal", GOOD_IBAN, "SCB", f"{slip['net_minor'] / 100:.2f}", "PAY-202609-" + good["id"][:8]]


async def test_spreadsheet_formulas_in_names_are_neutralised(client, tenant):
    await new_employee(client, name="=HYPERLINK(\"x\")", salary_minor=8_000_000, join_date="2026-01-01")
    run = await approved(client)
    text = (await client.get(f"/payroll/runs/{run['id']}/exports/wht.csv")).text
    assert "'=HYPERLINK" in text


async def test_the_annual_salary_certificate(client, tenant):
    await approved(client, "2026-08")
    await approved(client, "2026-09")
    r = await client.get(f"/payroll/reports/salary-certificate?employee_id={tenant.employee_id}&tax_year=TY2027")
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    data = (await client.get(
        f"/payroll/reports/salary-certificate.json?employee_id={tenant.employee_id}&tax_year=TY2027")).json()
    assert [m["month"] for m in data["months"]] == ["2026-08", "2026-09"]
    assert data["tax_minor"] == sum(m["tax_minor"] for m in data["months"])
    assert data["rates_verified"] is False
    r = await client.get(f"/payroll/reports/salary-certificate?employee_id={tenant.employee_id}&tax_year=TY1999")
    assert r.status_code == 422
