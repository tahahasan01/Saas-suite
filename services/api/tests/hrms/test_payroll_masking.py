"""Every output built from a payslip masks identity fields (CNIC, IBAN, NTN,
EOBI and social-security numbers) for a caller without the pay-view key
(payroll.salary.read) — the JSON payslip, the PDF, the statutory worksheets,
the salary certificate and the bank file all go through ONE masking function
(payroll_access.snapshot_view). Security review finding: the admin PDF used
to render the raw snapshot.

Legacy grants can't yet give run access without the pay-view key (RBAC v2,
3A, will), so the test switches the check off at its single seam."""
from __future__ import annotations

import uuid

import pytest

from app import jobs, payroll_access, payslip_pdf

from .test_employee_portal import portal  # noqa: F401  (fixture)

MONTH = "2026-09"
CNIC = "35202-7654321-9"
IBAN = "PK36SCBL0000001123456702"
SECRETS = ("7654321", "0000001123", "9988776", "EOBI-55501", "SS-77702")


async def _setup(client, tenant) -> dict:
    await client.patch(f"/hrms/employees/{tenant.employee_id}", json={"designation": "Cashier"})
    from .payroll_helpers import owner_execute
    await owner_execute("update hrms_employees set cnic = $2 where id = $1", uuid.UUID(tenant.employee_id), CNIC)
    await owner_execute("insert into fbr_settings (tenant_id, seller_province) values ($1, 'Punjab')",
                        uuid.UUID(tenant.tenant_id))
    await client.put(f"/payroll/employees/{tenant.employee_id}/details", json={
        "iban": IBAN, "payment_mode": "bank", "ntn": "9988776-1", "eobi_number": "EOBI-55501", "ss_number": "SS-77702"})
    for scheme in ("EOBI", "PESSI"):
        await client.put(f"/payroll/statutory/{scheme}", json={"enabled": True})
    run = (await client.post("/payroll/runs", json={"month": MONTH})).json()
    await client.post(f"/payroll/runs/{run['id']}/calculate")
    await jobs.HANDLERS["payroll.calculate"]()
    await client.post(f"/payroll/runs/{run['id']}/approve")
    detail = (await client.get(f"/payroll/runs/{run['id']}")).json()
    slip = next(p for p in detail["payslips"] if p["employee_id"] == tenant.employee_id)
    return {"run": run["id"], "slip": slip["id"]}


def _captured(monkeypatch) -> list:
    seen: list = []
    real, real_cert = payslip_pdf.render, payslip_pdf.render_certificate
    monkeypatch.setattr(payslip_pdf, "render", lambda payload: seen.append(payload) or real(payload))
    monkeypatch.setattr(payslip_pdf, "render_certificate",
                        lambda cert, *a: seen.append(cert) or real_cert(cert, *a))
    return seen


OUTPUTS = {
    "json payslip": lambda ids: f"/payroll/runs/{ids['run']}/payslips/{ids['slip']}",
    "pdf payslip": lambda ids: f"/payroll/runs/{ids['run']}/payslips/{ids['slip']}/pdf",
    "bank csv": lambda ids: f"/payroll/runs/{ids['run']}/exports/bank.csv",
    "wht csv": lambda ids: f"/payroll/runs/{ids['run']}/exports/wht.csv",
    "eobi csv": lambda ids: f"/payroll/runs/{ids['run']}/exports/eobi.csv",
    "pessi csv": lambda ids: f"/payroll/runs/{ids['run']}/exports/social-security.csv?scheme=PESSI",
    "certificate json": lambda ids: "/payroll/reports/salary-certificate.json?employee_id={emp}&tax_year=TY2027",
    "certificate pdf": lambda ids: "/payroll/reports/salary-certificate?employee_id={emp}&tax_year=TY2027",
}


async def _fetch(client, tenant, ids, name, monkeypatch) -> str:
    seen = _captured(monkeypatch)
    url = OUTPUTS[name](ids).replace("{emp}", tenant.employee_id)
    r = await client.get(url)
    assert r.status_code == 200, (name, r.text[:300])
    # A PDF's text is glyph ids, so check what was handed to the renderer.
    return repr(seen) if name.endswith("pdf payslip") or name == "certificate pdf" else r.text


@pytest.mark.parametrize("name", list(OUTPUTS))
async def test_outputs_are_masked_without_the_pay_view_key(client, tenant, monkeypatch, name):
    ids = await _setup(client, tenant)

    async def no_pay(conn, role_id):
        return False

    monkeypatch.setattr(payroll_access, "sees_pay", no_pay)
    body = await _fetch(client, tenant, ids, name, monkeypatch)
    leaked = [s for s in SECRETS if s in body]
    assert not leaked, f"{name} leaked {leaked}"


@pytest.mark.parametrize("name", ["json payslip", "bank csv", "wht csv"])
async def test_the_same_outputs_are_whole_with_the_key(client, tenant, monkeypatch, name):
    ids = await _setup(client, tenant)
    body = await _fetch(client, tenant, ids, name, monkeypatch)
    assert any(s in body for s in SECRETS)


async def test_the_employee_sees_their_own_payslip_unmasked(client, tenant, portal, monkeypatch):  # noqa: F811
    await _setup(client, tenant)

    async def no_pay(conn, role_id):
        return False

    monkeypatch.setattr(payroll_access, "sees_pay", no_pay)
    mine = (await portal.get("/me/payslips")).json()[0]
    assert mine["snapshot"]["cnic"] == CNIC and mine["snapshot"]["iban"] == IBAN
