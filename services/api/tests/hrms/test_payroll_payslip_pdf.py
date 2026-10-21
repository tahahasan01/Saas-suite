"""Payslip PDFs rendered from the frozen payslip lines, with a Unicode font so
Urdu names work, downloaded from the portal through a short-lived signed link
(D-40, St03 risk 14, QA-H12)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import jobs, payslip_pdf
from app.main import app

from .payroll_helpers import login_with_role, owner_execute
from .test_employee_portal import portal  # noqa: F401  (fixture)

MONTH = "2026-09"


def _slip(name: str) -> dict:
    return {
        "company": "Fixture Co", "company_ntn": "1234567-8", "run_number": "PR-2026-09", "period": "September 2026",
        "pay_date": "30 Sep 2026", "tax_year": "TY2027", "rates_verified": False,
        "snapshot": {"name": name, "cnic": "35202-1234567-3", "designation": "Cashier", "department": "Store",
                     "iban": "PK36SCBL0000001123456702", "bank_name": "SCB"},
        "employed_days": 30, "period_days": 30, "absent_days": 1, "unpaid_leave_days": 0,
        "gross_minor": 10_000_000, "deductions_minor": 800_000, "net_minor": 9_200_000,
        "employer_cost_minor": 10_200_000, "taxable_ytd_minor": 30_000_000, "tax_ytd_minor": 1_500_000,
        "lines": [
            {"code": "BASIC", "name": "Basic pay", "kind": "earning", "amount_minor": 10_000_000},
            {"code": "INCOME_TAX", "name": "Income tax (FBR)", "kind": "deduction", "amount_minor": 500_000},
            {"code": "ABSENCE", "name": "Absence", "kind": "deduction", "amount_minor": 300_000},
            {"code": "EOBI_ER", "name": "EOBI (employer)", "kind": "employer_contribution", "amount_minor": 200_000},
        ],
        "warnings": [],
    }


def test_a_payslip_pdf_renders_with_an_urdu_name():
    pdf = payslip_pdf.render(_slip("عائشہ خان"))
    assert pdf.startswith(b"%PDF") and len(pdf) > 2000
    assert b"NotoNaskhArabic" in pdf          # the Arabic-script font is embedded


def test_an_english_name_and_long_values_render_too():
    slip = _slip("Muhammad Abdul Rehman Qureshi " * 4)
    slip["lines"] += [{"code": f"X{i}", "name": "Allowance " * 6, "kind": "earning", "amount_minor": 1}
                      for i in range(40)]
    assert payslip_pdf.render(slip).startswith(b"%PDF")


def test_amounts_in_words_use_lakh_and_crore():
    assert payslip_pdf.in_words(9_200_000) == "Rupees ninety-two thousand only"
    assert payslip_pdf.in_words(12_345_678_950) == ("Rupees twelve crore thirty-four lakh fifty-six thousand "
                                                    "seven hundred eighty-nine and 50 paisa only")
    assert payslip_pdf.in_words(0) == "Rupees zero only"


# ── Through the API ─────────────────────────────────────────────────────────
async def _approved_run(client) -> dict:
    run = (await client.post("/payroll/runs", json={"month": MONTH})).json()
    await client.post(f"/payroll/runs/{run['id']}/calculate")
    await jobs.HANDLERS["payroll.calculate"]()
    await client.post(f"/payroll/runs/{run['id']}/approve")
    return (await client.get(f"/payroll/runs/{run['id']}")).json()


@pytest_asyncio.fixture
async def anonymous():
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    yield c
    await c.aclose()


async def test_the_portal_downloads_its_payslip_through_a_signed_link(client, tenant, portal, anonymous):  # noqa: F811
    await owner_execute("update hrms_employees set name = 'عائشہ' where id = $1", uuid.UUID(tenant.employee_id))
    await _approved_run(client)
    mine = (await portal.get("/me/payslips")).json()[0]
    r = await portal.post(f"/me/payslips/{mine['id']}/link")
    assert r.status_code == 200, r.text
    link = r.json()
    left = datetime.fromisoformat(link["expires_at"]) - datetime.now(timezone.utc)
    assert 0 < left.total_seconds() <= 300
    assert "token=" in link["url"] and mine["id"] not in link["url"]
    # The link itself is the credential: it works without a session …
    pdf = await anonymous.get(link["url"])
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
    assert "no-store" in pdf.headers["cache-control"]
    # … until it expires.
    await owner_execute("update payslip_links set expires_at = now() - interval '1 second'")
    assert (await anonymous.get(link["url"])).status_code == 404


async def test_a_made_up_token_is_404(client, anonymous):   # `client` opens the db pools
    assert (await anonymous.get("/payslips/download?token=nope")).status_code == 404


async def test_nobody_can_link_someone_elses_payslip(client, tenant, portal):  # noqa: F811
    run = await _approved_run(client)
    other = next(p for p in run["payslips"] if p["employee_id"] != tenant.employee_id)
    assert (await portal.post(f"/me/payslips/{other['id']}/link")).status_code == 404
    assert (await portal.post(f"/me/payslips/{uuid.uuid4()}/link")).status_code == 404


async def test_a_payslip_still_in_review_cannot_be_linked(client, tenant, portal):  # noqa: F811
    run = (await client.post("/payroll/runs", json={"month": MONTH})).json()
    await client.post(f"/payroll/runs/{run['id']}/calculate")
    await jobs.HANDLERS["payroll.calculate"]()
    slip = next(p for p in (await client.get(f"/payroll/runs/{run['id']}")).json()["payslips"]
                if p["employee_id"] == tenant.employee_id)
    assert (await portal.post(f"/me/payslips/{slip['id']}/link")).status_code == 404


async def test_payroll_can_download_any_payslip_pdf_hr_cannot(client, tenant):
    run = await _approved_run(client)
    slip = run["payslips"][0]
    r = await client.get(f"/payroll/runs/{run['id']}/payslips/{slip['id']}/pdf")
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    clerk = await login_with_role(client, "HR clerk", {"hrms": ["read", "write"]})
    try:
        assert (await clerk.get(f"/payroll/runs/{run['id']}/payslips/{slip['id']}/pdf")).status_code == 403
    finally:
        await clerk.aclose()
