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
from .sql_guard import UnsafeQuery, sanitize

SCHEMA = """
You may query ONLY these PostgreSQL views (read-only):

ai_v_leads(id, name, company, phone, email, source, value numeric, currency,
           score int, stage text, stage_kind text /* active|won|lost */,
           pipeline text, created_at timestamptz)
ai_v_interactions(id, lead_name, channel /* call|whatsapp|email|note|bot */,
           outcome /* interested|not_interested|callback|busy */, note,
           next_follow_up_at timestamptz, created_at timestamptz)
""".strip()


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


async def ask(tenant_id: str, user_id: str, question: str) -> dict:
    client = _client()
    if client is None:
        # Never return this as an `answer` — the UI would render an ops message
        # in the same place as a real result, which reads as a broken product.
        raise AiUnavailable("AI is not configured on this deployment.")

    tokens_in = tokens_out = 0

    # 1) NL -> SQL
    gen = await client.messages.create(
        model=settings.ai_model,
        max_tokens=400,
        system=(f"You convert a business question into ONE read-only PostgreSQL SELECT.\n{SCHEMA}\n"
                "Rules: SELECT only; use ONLY the views above; no semicolons, no comments. "
                "Return ONLY the SQL, nothing else."),
        messages=[{"role": "user", "content": question}],
    )
    tokens_in += gen.usage.input_tokens
    tokens_out += gen.usage.output_tokens
    raw_sql = _extract_sql(gen.content[0].text)

    # 2) Guard
    try:
        safe_sql = sanitize(raw_sql)
    except UnsafeQuery as e:
        await _log(tenant_id, user_id, question, f"[blocked: {e}]", raw_sql, tokens_in, tokens_out)
        return {"answer": "I can only answer questions about your CRM data, and I couldn't do that safely.",
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
