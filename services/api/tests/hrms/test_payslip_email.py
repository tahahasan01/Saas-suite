"""Email payslips from a payroll run (research sweep, TRD /payroll/runs/{id}/payslips/send, 0111).

Once a run is approved (or paid, locked), payroll emails each payslip to
the employee's email on file, through the email outbox, with the PDF
attached. Only a pointer is queued; the PDF is built at delivery from the
frozen payslip, with bank and identity numbers masked because it sits in a
mailbox. A payslip is sent once unless asked again; people without an email
are skipped and counted. Sending needs payroll.run.pay.
"""
from __future__ import annotations

import json

import pytest

from app import email

from .payroll_helpers import login_with_role, new_employee, owner_execute, owner_fetch
from .test_payroll_runs import calc, new_run


@pytest.fixture
def attached(monkeypatch):
    out: list[tuple[str, str, str, list]] = []

    async def capture(to, subject, body, attachments):
        out.append((to, subject, body, attachments))

    monkeypatch.setattr(email, "_send_attached", capture)
    return out


async def _approved_run(client) -> dict:
    run = await new_run(client, "2026-09")
    await calc(client, run["id"])
    assert (await client.post(f"/payroll/runs/{run['id']}/approve")).status_code == 200
    return (await client.get(f"/payroll/runs/{run['id']}")).json()


async def _queued(tenant_id: str) -> list[dict]:
    rows = await owner_fetch("select * from outbox where tenant_id = $1::uuid and payload->>'template' = 'payslip' "
                             "order by id", tenant_id)
    return [{**dict(r), "payload": r["payload"] if isinstance(r["payload"], dict) else json.loads(r["payload"])}
            for r in rows]


async def test_an_approved_run_emails_each_payslip_once_with_its_pdf(client, tenant, attached, monkeypatch):
    from app import payslip_pdf
    drawn: list[dict] = []
    real = payslip_pdf.render
    monkeypatch.setattr(payslip_pdf, "render", lambda payload: (drawn.append(payload), real(payload))[1])
    e = await new_employee(client, name="Mehwish", salary_minor=7_000_000, email="mehwish@example.com",
                           cnic="35202-7654321-2")
    await owner_execute("update hrms_employees set email = '' where tenant_id = $1::uuid and id <> $2::uuid",
                        tenant.tenant_id, e["id"])
    run = await _approved_run(client)
    r = await client.post(f"/payroll/runs/{run['id']}/payslips/send", json={})
    assert r.status_code == 202, r.text
    out = r.json()
    assert out["queued"] == 1 and out["no_email"] == len(run["payslips"]) - 1 and out["already_sent"] == 0
    [row] = await _queued(tenant.tenant_id)
    slip = next(p for p in run["payslips"] if p["employee_id"] == e["id"])
    assert row["payload"] == {"template": "payslip", "to": "mehwish@example.com", "payslip_id": slip["id"]}

    # Sent once; again only when asked.
    again = (await client.post(f"/payroll/runs/{run['id']}/payslips/send", json={})).json()
    assert again["queued"] == 0 and again["already_sent"] == 1
    forced = (await client.post(f"/payroll/runs/{run['id']}/payslips/send", json={"again": True})).json()
    assert forced["queued"] == 1

    await owner_execute("update outbox set run_after = now() where tenant_id = $1::uuid", tenant.tenant_id)
    assert await email.process_outbox() >= 1
    to, subject, body, files = attached[0]
    assert to == "mehwish@example.com" and "September 2026" in subject
    [(name, data, mime)] = files
    assert name.endswith(".pdf") and mime == "application/pdf" and data.startswith(b"%PDF")
    # The mailbox copy masks identity numbers (what went into the PDF).
    assert drawn and "7654321" not in json.dumps(drawn[-1]["snapshot"], default=str)


async def test_only_final_runs_are_sent_and_sending_needs_pay_rights(client, tenant):
    draft = await new_run(client, "2026-09")
    assert (await client.post(f"/payroll/runs/{draft['id']}/payslips/send", json={})).status_code == 409
    await calc(client, draft["id"])
    assert (await client.post(f"/payroll/runs/{draft['id']}/payslips/send", json={})).status_code == 409   # review
    assert (await client.post(f"/payroll/runs/{draft['id']}/approve")).status_code == 200
    reader = await login_with_role(client, "Payroll reader", {"hrms": ["read"], "payroll": ["read"]})
    try:
        assert (await reader.post(f"/payroll/runs/{draft['id']}/payslips/send", json={})).status_code == 403
    finally:
        await reader.aclose()


async def test_a_chosen_few_can_be_sent(client, tenant):
    a = await new_employee(client, name="One", salary_minor=5_000_000, email="one@example.com")
    b = await new_employee(client, name="Two", salary_minor=5_000_000, email="two@example.com")
    run = await _approved_run(client)
    r = await client.post(f"/payroll/runs/{run['id']}/payslips/send", json={"employee_ids": [a["id"]]})
    assert r.status_code == 202 and r.json()["queued"] == 1
    assert [x["payload"]["to"] for x in await _queued(tenant.tenant_id)] == ["one@example.com"]
    assert b["id"]
