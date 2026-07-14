"""AI Gateway — natural-language questions over the tenant's CRM data.

Flow:  question -> LLM writes SQL -> sql_guard.sanitize -> READ ONLY execution
under RLS -> LLM phrases an answer from the rows. Every call is logged to
ai_interactions with token usage.
"""
from __future__ import annotations

import json
from datetime import datetime, date
from decimal import Decimal
from typing import Any

from anthropic import AsyncAnthropic

from .. import db
from ..config import settings
from .sql_guard import UnsafeQuery, sanitize, views_for

# Per-section schema. Only the sections a tenant has enabled are shown to the
# model — describing views it cannot query just invites rejected SQL.
SCHEMA_BY_SECTION = {
    "crm": """
ai_v_leads(id, name, company, phone, email, source, value numeric, currency,
           score int, stage text, stage_kind text /* active|won|lost */,
           pipeline text, created_at timestamptz)
ai_v_interactions(id, lead_name, channel /* call|whatsapp|email|note|bot */,
           outcome /* interested|not_interested|callback|busy */, note,
           next_follow_up_at timestamptz, created_at timestamptz)
""".strip(),
    "pos": """
ai_v_sales(id, total numeric, discount numeric, tax numeric, payment_method,
           item_count int, cashier text, created_at timestamptz, sale_date date)
ai_v_sale_items(id, product text, qty numeric, unit_price numeric,
           line_total numeric, sale_date date, cashier text)
ai_v_products(id, name, sku, barcode, category, unit, price numeric,
           stock_qty numeric, low_stock_at numeric, is_low_stock bool, active bool)
ai_v_returns(id, refund numeric, reason text, return_date date, cashier text)
""".strip(),
    "hrms": """
ai_v_employees(id, name, designation, department, join_date date, status)
ai_v_attendance(id, employee text, department, work_date date, check_in timestamptz,
           check_out timestamptz, status /* present|late|absent */)
ai_v_leave(id, employee text, department, request_type /* leave|wfh */,
           leave_type /* annual|sick|casual|unpaid */, from_date date, to_date date,
           status /* pending|approved|rejected */)
""".strip(),
}


def schema_for(sections) -> str:
    parts = [SCHEMA_BY_SECTION[s] for s in sorted(sections) if s in SCHEMA_BY_SECTION]
    return "You may query ONLY these PostgreSQL views (read-only):\n\n" + "\n\n".join(parts)


class AiUnavailable(RuntimeError):
    """No API key on this deployment — the feature is switched off, not broken."""


def _client() -> AsyncAnthropic | None:
    return AsyncAnthropic(api_key=settings.anthropic_api_key) if settings.anthropic_api_key else None


def _json_default(o: Any):
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    return str(o)


def _extract_sql(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.strip("`")
        t = t[3:] if t.lower().startswith("sql") else t
    return t.strip()


async def ask(tenant_id: str, user_id: str, question: str, sections: set[str]) -> dict:
    """`sections` are the tenant's enabled modules — they decide what the AI can
    see. One question can cross all three, which is the thing three separate
    products cannot do."""
    client = _client()
    if client is None:
        # Never return this as an `answer` — the UI would render an ops message
        # in the same place as a real result, which reads as a broken product.
        raise AiUnavailable("AI is not configured on this deployment.")

    allowed = views_for(sections)
    if not allowed:
        raise AiUnavailable("Turn on a module before asking questions about your data.")

    tokens_in = tokens_out = 0

    # 1) NL -> SQL
    gen = await client.messages.create(
        model=settings.ai_model,
        max_tokens=400,
        system=(f"You convert a business question into ONE read-only PostgreSQL SELECT.\n"
                f"{schema_for(sections)}\n"
                "Rules: SELECT only; use ONLY the views above; no semicolons, no comments. "
                "Views may be joined. Today is current_date. "
                "Return ONLY the SQL, nothing else."),
        messages=[{"role": "user", "content": question}],
    )
    tokens_in += gen.usage.input_tokens
    tokens_out += gen.usage.output_tokens
    raw_sql = _extract_sql(gen.content[0].text)

    # 2) Guard
    try:
        safe_sql = sanitize(raw_sql, allowed=allowed)
    except UnsafeQuery as e:
        await _log(tenant_id, user_id, question, f"[blocked: {e}]", raw_sql, tokens_in, tokens_out)
        return {"answer": "I couldn't answer that safely from your data. Try rephrasing it.",
                "sql": None, "rows": []}

    # 3) Execute read-only under RLS
    async with db.readonly_tenant_conn(tenant_id) as conn:
        records = await conn.fetch(safe_sql)
    rows = [dict(r) for r in records]

    # 4) Phrase an answer
    ans = await client.messages.create(
        model=settings.ai_model,
        max_tokens=400,
        system="Answer the user's question concisely from the JSON rows. Use PKR for money. "
               "If rows are empty, say no matching records were found.",
        messages=[{"role": "user", "content":
                   f"Question: {question}\nRows: {json.dumps(rows[:50], default=_json_default)}"}],
    )
    tokens_in += ans.usage.input_tokens
    tokens_out += ans.usage.output_tokens
    answer = ans.content[0].text.strip()

    await _log(tenant_id, user_id, question, answer, safe_sql, tokens_in, tokens_out)
    return {"answer": answer, "sql": safe_sql, "rows": json.loads(json.dumps(rows[:50], default=_json_default))}


async def _log(tenant_id, user_id, prompt, response, sql, tin, tout) -> None:
    async with db.tenant_conn(tenant_id) as conn:
        await conn.execute(
            """insert into ai_interactions (tenant_id, user_id, kind, prompt, response, sql, tokens_in, tokens_out)
               values ($1,$2,'ask',$3,$4,$5,$6,$7)""",
            tenant_id, user_id, prompt, response, sql, tin, tout)
