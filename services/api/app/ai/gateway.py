"""AI Gateway — natural-language questions over the tenant's data.

Flow:  question -> LLM writes SQL -> sql_guard.sanitize -> run_query (as
ai_reader, READ ONLY, under RLS, row-capped) -> LLM phrases an answer from the
rows. Every call is logged to ai_interactions with token usage.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import anthropic
import asyncpg
from anthropic import AsyncAnthropic

from .. import db
from ..config import settings
from .sql_guard import UnsafeQuery, sanitize, views_for

log = logging.getLogger("ai.gateway")

ROW_CAP = 200                 # rows the database returns, whatever LIMIT the SQL says
ROWS_TO_MODEL = 50            # rows sent back to the model (and the client) to phrase
RESULT_BYTES_CAP = 64 * 1024  # ...and never more than this much JSON

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


class AiUpstreamError(RuntimeError):
    """The model provider failed. `status_code` is 503 when trying again later
    can help (unreachable, rate-limited, overloaded) and 502 when it answered
    with something unusable. Never a 500: our code didn't break."""

    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


class TenantTripwire(RuntimeError):
    """The AI transaction ended on a different role or tenant than it began.
    ai_reader cannot call set_config, so this should be impossible — which is
    exactly why it is checked."""


_RETRY_LATER = {429, 503, 504, 529}


def _client() -> AsyncAnthropic | None:
    return AsyncAnthropic(api_key=settings.anthropic_api_key) if settings.anthropic_api_key else None


async def _complete(client, **kwargs) -> tuple[str, int, int]:
    """One model call -> (text, tokens_in, tokens_out), or AiUpstreamError."""
    try:
        msg = await client.messages.create(**kwargs)
    except anthropic.APIConnectionError as e:   # includes timeouts
        log.warning("model unreachable: %s", type(e).__name__)
        raise AiUpstreamError("The AI service could not be reached. Please try again shortly.", 503) from e
    except anthropic.APIStatusError as e:
        log.warning("model returned HTTP %s", e.status_code)
        if e.status_code in _RETRY_LATER:
            raise AiUpstreamError("The AI service is busy right now. Please try again shortly.", 503) from e
        raise AiUpstreamError("The AI service returned an error.", 502) from e
    except anthropic.AnthropicError as e:
        log.warning("model call failed: %s", type(e).__name__)
        raise AiUpstreamError("The AI service returned an error.", 502) from e
    text = next((b.text for b in (msg.content or []) if getattr(b, "type", None) == "text"), "")
    if not text.strip():
        raise AiUpstreamError("The AI service returned an empty reply.", 502)
    return text, msg.usage.input_tokens, msg.usage.output_tokens


async def run_query(tenant_id: str, sql: str, timeout_ms: int = 5000) -> list[dict]:
    """Run validated SQL the only way model SQL is ever run (TR-SEC-10).

    As ai_reader in a read-only transaction (db.ai_conn), wrapped as a
    subquery under a hard LIMIT. The wrapper means the database itself accepts
    nothing but one SELECT — SET ROLE, DO, COPY or a second statement is a
    syntax error there — and caps rows whatever LIMIT the SQL carries. The
    newlines keep a trailing line comment from swallowing the cap.
    """
    wrapped = f"select * from (\n{sql}\n) as ai_q limit {ROW_CAP}"
    async with db.ai_conn(tenant_id, timeout_ms) as conn:
        records = await conn.fetch(wrapped)
        after = await conn.fetchrow(
            "select current_user::text as role, current_setting('app.tenant_id', true) as tenant")
    if after["role"] != "ai_reader" or after["tenant"] != str(tenant_id):
        raise TenantTripwire(f"ended as {after['role']} on another tenant")
    return [dict(r) for r in records]


def _cap_bytes(rows: list[dict]) -> list[dict]:
    out, size = [], 2
    for r in rows:
        size += len(json.dumps(r, default=_json_default)) + 1
        if size > RESULT_BYTES_CAP:
            break
        out.append(r)
    return out


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
    refusal: dict[str, Any] = {"answer": "I couldn't answer that safely from your data. Try rephrasing it.",
               "sql": None, "rows": []}

    # 1) NL -> SQL
    text, tin, tout = await _complete(
        client,
        model=settings.ai_model,
        max_tokens=400,
        system=(f"You convert a business question into ONE read-only PostgreSQL SELECT.\n"
                f"{schema_for(sections)}\n"
                "Rules: SELECT only; use ONLY the views above; no semicolons, no comments. "
                "Views may be joined. Today is current_date. "
                "Return ONLY the SQL, nothing else."),
        messages=[{"role": "user", "content": question}],
    )
    tokens_in += tin
    tokens_out += tout
    raw_sql = _extract_sql(text)

    # 2) Guard
    try:
        safe_sql = sanitize(raw_sql, allowed=allowed)
    except UnsafeQuery as e:
        await _log(tenant_id, user_id, question, f"[blocked: {e}]", raw_sql, tokens_in, tokens_out)
        return refusal

    # 3) Execute as ai_reader. Model SQL that the database rejects (a wrong
    # column, a timeout, or a privilege the validator should have caught) is
    # an answer to the user, not a 500.
    try:
        rows = await run_query(tenant_id, safe_sql)
    except asyncpg.QueryCanceledError:
        await _log(tenant_id, user_id, question, "[db timeout]", safe_sql, tokens_in, tokens_out)
        return {"answer": "That question took too long to answer. Try narrowing it, e.g. to a date range.",
                "sql": None, "rows": []}
    except asyncpg.PostgresError as e:
        await _log(tenant_id, user_id, question, f"[db refused: {type(e).__name__}]", safe_sql,
                   tokens_in, tokens_out)
        return refusal
    except TenantTripwire as e:
        log.error("AI tenant tripwire for tenant %s: %s", tenant_id, e)
        await _log(tenant_id, user_id, question, f"[tripwire: {e}]", safe_sql, tokens_in, tokens_out)
        return refusal
    shown = _cap_bytes(rows[:ROWS_TO_MODEL])
    shown_json = json.dumps(shown, default=_json_default)

    # 4) Phrase an answer
    try:
        text, tin, tout = await _complete(
            client,
            model=settings.ai_model,
            max_tokens=400,
            system="Answer the user's question concisely from the JSON rows. Use PKR for money. "
                   "If rows are empty, say no matching records were found.",
            messages=[{"role": "user", "content": f"Question: {question}\nRows: {shown_json}"}],
        )
    except AiUpstreamError as e:
        # The first call's tokens were spent; meter them before failing.
        await _log(tenant_id, user_id, question, f"[upstream error: {e.status_code}]", safe_sql,
                   tokens_in, tokens_out)
        raise
    tokens_in += tin
    tokens_out += tout
    answer = text.strip()

    await _log(tenant_id, user_id, question, answer, safe_sql, tokens_in, tokens_out)
    return {"answer": answer, "sql": safe_sql, "rows": json.loads(shown_json)}


async def _log(tenant_id, user_id, prompt, response, sql, tin, tout) -> None:
    async with db.tenant_conn(tenant_id) as conn:
        await conn.execute(
            """insert into ai_interactions (tenant_id, user_id, kind, prompt, response, sql, tokens_in, tokens_out)
               values ($1,$2,'ask',$3,$4,$5,$6,$7)""",
            tenant_id, user_id, prompt, response, sql, tin, tout)
