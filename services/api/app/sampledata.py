"""Seed a new tenant with realistic demo data for its enabled sections, so the
first thing a user sees is a *live* workspace — not an empty app (the #1 cause
of SMB churn). Best-effort: never fails signup.

Runs inside a tenant-scoped connection (app_user + app.tenant_id), so all inserts
carry the correct tenant_id and pass RLS.
"""
from __future__ import annotations

import asyncpg

_STAGES = [("New", "active"), ("Contacted", "active"), ("Qualified", "active"),
           ("Proposal", "active"), ("Won", "won"), ("Lost", "lost")]

# name, company, phone, email, source, stage_index, value_minor, score
_LEADS = [
    ("Bilal Khan", "Khan Traders", "03001234567", "bilal@khan.pk", "referral", 2, 5_000_00, 88),
    ("Ayesha Malik", "Malik Textiles", "03007654321", "ayesha@malik.pk", "whatsapp", 1, 12_000_00, 72),
    ("Usman Sheikh", "Sheikh & Sons", "03009998877", "", "facebook", 0, 3_000_00, 55),
    ("Fatima Noor", "Noor Enterprises", "03331112233", "fatima@noor.pk", "referral", 4, 25_000_00, 95),
]
# name, barcode, price_minor, stock, low
_PRODUCTS = [
    ("Coca-Cola 500ml", "5449000000996", 8000, 120, 24),
    ("Lays Chips", "1234500001", 5000, 60, 12),
    ("Fresh Milk 1L", "1234500002", 18000, 40, 10),
    ("Sunridge Rice 5kg", "1234500003", 220000, 25, 5),
    ("Dawn Bread", "1234500004", 12000, 30, 8),
]
# name, designation, department, salary_minor
_EMPLOYEES = [
    ("Ahmed Raza", "Sales Manager", "Sales", 150_000_00),
    ("Sana Malik", "Cashier", "Retail", 80_000_00),
    ("Hassan Ali", "Accountant", "Finance", 110_000_00),
]


async def seed(conn: asyncpg.Connection, tenant_id: str, user_id: str, sections: list[str]) -> None:
    if "crm" in sections:
        pid = await conn.fetchval(
            "insert into crm_pipelines (tenant_id, name, is_default) values ($1,'Sales Pipeline',true) returning id",
            tenant_id)
        stage_ids = []
        for pos, (name, kind) in enumerate(_STAGES):
            sid = await conn.fetchval(
                "insert into crm_stages (tenant_id, pipeline_id, name, position, kind) values ($1,$2,$3,$4,$5) returning id",
                tenant_id, pid, name, pos, kind)
            stage_ids.append(sid)
        await conn.execute(
            """insert into workflows (tenant_id, name, trigger, conditions, actions, is_system)
               values ($1,'Notify owner when a deal is won','lead.stage_changed',$2,$3,true)""",
            tenant_id,
            [{"field": "stage_kind", "op": "eq", "value": "won"}],
            [{"type": "notify", "recipient": "owner", "kind": "success",
              "message": "Deal won: {name}", "body": "{company}", "link": "/crm"}])
        for name, company, phone, email, source, si, value, score in _LEADS:
            await conn.execute(
                """insert into crm_leads (tenant_id, pipeline_id, stage_id, owner_id, name, company, phone, email, source, value_minor, score)
                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
                tenant_id, pid, stage_ids[si], user_id, name, company, phone, email, source, value, score)

    if "pos" in sections:
        for name, barcode, price, stock, low in _PRODUCTS:
            await conn.execute(
                """insert into pos_products (tenant_id, name, barcode, price_minor, stock_qty, low_stock_at)
                   values ($1,$2,$3,$4,$5,$6)""",
                tenant_id, name, barcode, price, stock, low)

    if "hrms" in sections:
        for name, designation, department, salary in _EMPLOYEES:
            await conn.execute(
                """insert into hrms_employees (tenant_id, name, designation, department, salary_minor)
                   values ($1,$2,$3,$4,$5)""",
                tenant_id, name, designation, department, salary)
