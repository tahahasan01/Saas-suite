"""Transactional email, delivered through the outbox (D-09, P1-7, checklist 2B).

A request never talks to SMTP. It writes an `email.send` outbox row in its
own transaction (`queue_*` below) and returns; the row is delivered after
commit — at once by the request's background fast path (`deliver_now`), and
otherwise by the worker's `email.outbox` job. So SMTP being down can't fail
or slow a request, and /auth/forgot answers the same whether or not the
address has an account.

The row holds what to send, never a credential: the reset / verify / invite
token is minted at delivery (tokens.create stores only its hash), so neither
a dump of `outbox` nor a stuck row is a working link. A retried delivery
mints a fresh token; an undelivered one simply expires.

Delivery: claim (`sending`, attempts + 1, committed) -> send -> `done`, or
`retry` with back-off, or `failed` after max_attempts (alert `email.failed`).
A row left `sending` past its lock goes back to `retry`: unlike an FBR
filing, a repeated email is harmless.

Providers: 'console' (default) logs the message + link so flows work in dev
with no credentials; 'smtp' sends for real. A Resend/SES HTTP provider slots
in the same way — implement it in `_send` and branch on settings.email_provider.
"""
from __future__ import annotations

import asyncio
import logging
import random
import uuid
from email.message import EmailMessage

from . import alerts, db, tokens
from .config import settings

log = logging.getLogger("email")

WEB = settings.web_origin.split(",")[0].strip()

KIND = "email.send"
MAX_ATTEMPTS = 8                   # with the back-off below, about an hour of trying
BACKOFF_BASE_S = 30
BACKOFF_CAP_S = 3600
LOCK_FOR = "5 minutes"
BATCH = 50
MAX_PASSES = 5


# ── Providers ───────────────────────────────────────────────────────────────
async def _send(to: str, subject: str, body: str) -> None:
    if settings.email_provider == "smtp" and settings.smtp_host:
        await asyncio.to_thread(_send_smtp, to, subject, body)
    else:
        # The dev console provider: this line IS the email, so it is the one
        # log line allowed through unredacted (never in production).
        log.warning("EMAIL[console] to=%s | %s\n%s", to, subject, body, extra={"unredacted": True})


Attachment = tuple[str, bytes, str]          # filename, content, MIME type


async def _send_attached(to: str, subject: str, body: str, attachments: list[Attachment]) -> None:
    if settings.email_provider == "smtp" and settings.smtp_host:
        await asyncio.to_thread(_send_smtp, to, subject, body, attachments)
    else:
        log.warning("EMAIL[console] to=%s | %s\n%s\n[attached: %s]", to, subject, body,
                    ", ".join(f"{n} ({len(d)} bytes)" for n, d, _ in attachments), extra={"unredacted": True})


def _send_smtp(to: str, subject: str, body: str, attachments: list[Attachment] | None = None) -> None:
    import smtplib

    msg = EmailMessage()
    msg["From"] = settings.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    for name, data, mime in attachments or []:
        main, _, sub_type = mime.partition("/")
        msg.add_attachment(data, maintype=main, subtype=sub_type, filename=name)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as s:
        s.ehlo()
        # STARTTLS is negotiated, not assumed. Calling it unconditionally breaks
        # local catchers (Mailpit/MailHog offer no STARTTLS and raise
        # SMTPNotSupportedError); skipping it unconditionally would hand
        # credentials to a real provider in plaintext. So: upgrade when offered,
        # and refuse to authenticate when it isn't.
        if s.has_extn("starttls"):
            s.starttls()
            s.ehlo()  # re-EHLO: the server's capabilities change after upgrade
        elif settings.smtp_user:
            raise RuntimeError(
                f"SMTP host {settings.smtp_host!r} does not offer STARTTLS, but SMTP_USER is set. "
                "Refusing to send credentials in plaintext — use a TLS-capable host, "
                "or clear SMTP_USER/SMTP_PASSWORD if this is a local mail catcher."
            )
        if settings.smtp_user:
            s.login(settings.smtp_user, settings.smtp_password)
        s.send_message(msg)


# ── Enqueue (inside the caller's transaction) ───────────────────────────────
async def _enqueue(conn, tenant_id: str, template: str, to: str, *, run_after=None, **params) -> int:
    return await conn.fetchval(
        """insert into outbox (tenant_id, kind, dedup_key, payload, max_attempts, run_after)
           values ($1, $2, $3, $4, $5, coalesce($6, now())) returning id""",
        tenant_id, KIND, uuid.uuid4().hex, {"template": template, "to": to, **params}, MAX_ATTEMPTS, run_after)


async def queue_password_reset(conn, tenant_id: str, user_id: str, to: str) -> int:
    return await _enqueue(conn, tenant_id, "password_reset", to, user_id=str(user_id))


async def queue_verification(conn, tenant_id: str, user_id: str, to: str) -> int:
    return await _enqueue(conn, tenant_id, "verify_email", to, user_id=str(user_id))


async def queue_invite(conn, tenant_id: str, to: str, tenant_name: str, role_id: str | None,
                       employee_id: str | None = None) -> int:
    return await _enqueue(conn, tenant_id, "invite", to, tenant_name=tenant_name,
                          role_id=str(role_id) if role_id else None,
                          employee_id=str(employee_id) if employee_id else None)


async def queue_invoice_overdue(conn, tenant_id: str, to: str, *, company: str, customer: str, number: str,
                                due: str, balance_minor: int) -> int:
    return await _enqueue(conn, tenant_id, "invoice_overdue", to, company=company, customer=customer,
                          number=number, due=due, balance_minor=balance_minor)


async def queue_invoice(conn, tenant_id: str, to: str, invoice_id: str) -> int:
    """An issued invoice with its PDF. Only the id is queued: the PDF is
    built at delivery, from the invoice (frozen once issued)."""
    return await _enqueue(conn, tenant_id, "invoice", to, invoice_id=str(invoice_id))


async def queue_quote(conn, tenant_id: str, to: str, quote_id: str) -> int:
    """A quote's link and PDF. Only the id is queued: the link is decrypted
    and the PDF built at delivery, and a quote closed by then isn't sent."""
    return await _enqueue(conn, tenant_id, "quote", to, quote_id=str(quote_id))


async def queue_campaign(conn, tenant_id: str, to: str, *, subject: str, body: str, business: str,
                         unsubscribe_token: str, run_after=None) -> int:
    """A marketing email (wave D campaigns), already merged; `run_after`
    holds it past the quiet hours."""
    return await _enqueue(conn, tenant_id, "campaign", to, run_after=run_after, subject=subject, body=body,
                          business=business, unsubscribe_url=f"{WEB}/u/{unsubscribe_token}")


# ── Rendering (at delivery: the link's token is minted here) ────────────────
async def _render(row) -> tuple[str, str]:
    p = row["payload"]
    to, template = p["to"], p["template"]
    if template == "password_reset":
        token = await tokens.create("reset", email=to, user_id=p["user_id"], ttl_hours=1)
        return ("Reset your Business OS password",
                f"Click to reset your password (valid 1 hour):\n{WEB}/reset?token={token}\n\n"
                "If you didn't request this, ignore it.")
    if template == "verify_email":
        token = await tokens.create("verify", email=to, user_id=p["user_id"], ttl_hours=48)
        return "Verify your email", f"Welcome to Business OS! Confirm your email:\n{WEB}/verify?token={token}"
    if template == "invite":
        token = await tokens.create("invite", email=to, tenant_id=str(row["tenant_id"]),
                                    role_id=p.get("role_id"), employee_id=p.get("employee_id"),
                                    ttl_hours=72)
        name = p.get("tenant_name") or "a workspace"
        return (f"You're invited to {name} on Business OS",
                f"You've been invited to join {name}. Set up your account:\n{WEB}/accept-invite?token={token}")
    if template == "invoice_overdue":
        rupees, paisa = divmod(int(p["balance_minor"]), 100)
        amount = f"Rs {rupees:,}" + (f".{paisa:02d}" if paisa else "")
        return (f"Payment reminder: invoice {p['number']} from {p['company']}",
                f"Dear {p['customer']},\n\nInvoice {p['number']} was due on {p['due']} and {amount} is still "
                f"outstanding. If you've already paid, please ignore this reminder.\n\nThank you,\n{p['company']}")
    if template == "campaign":
        return (p["subject"] or p["business"],
                f"{p['body']}\n\n--\n{p['business']}\nTo stop these emails: {p['unsubscribe_url']}")
    raise ValueError(f"unknown email template {template!r}")


# ── Claiming and settling (owner connection) ────────────────────────────────
_CLAIM = f"""
with due as (
    select o.id from outbox o
     where o.kind = '{KIND}' and o.status in ('pending', 'retry') and o.run_after <= now()
       and ($2::bigint is null or o.id = $2)
     order by o.run_after, o.id
     limit $1
     for update of o skip locked)
update outbox o
   set status = 'sending', attempts = o.attempts + 1,
       locked_until = now() + interval '{LOCK_FOR}', updated_at = now()
  from due
 where o.id = due.id
returning o.*"""


def backoff_seconds(attempts: int) -> float:
    return min(BACKOFF_CAP_S, BACKOFF_BASE_S * 2 ** max(attempts - 1, 0)) * random.uniform(0.8, 1.2)


async def _claim(limit: int, only_id: int | None = None) -> list:
    async with db.owner_conn() as oc:
        return await oc.fetch(_CLAIM, limit, only_id)


async def _settle(row, error: str | None) -> str | None:
    if error is None:
        status = "done"
    elif row["attempts"] >= row["max_attempts"]:
        status = "failed"
    else:
        status = "retry"
    wait = backoff_seconds(row["attempts"]) if status == "retry" else 0.0
    async with db.owner_conn() as oc:
        held = await oc.fetchval(
            """update outbox
                  set status = $2,
                      run_after = case when $2 = 'retry' then now() + make_interval(secs => $3)
                                       else run_after end,
                      locked_until = null, last_error_code = $4, last_error = $5,
                      result = case when $2 = 'done' then jsonb_build_object('sent_at', now()) else result end,
                      updated_at = now()
                where id = $1 and status = 'sending'
            returning id""",
            row["id"], status, wait, "" if error is None else "send_failed", (error or "")[:500])
    if held is None:
        return None
    if status == "failed":
        # The provider's text (which can quote the address) stays in the log.
        error_type = (error or "").split(":", 1)[0].strip()[:60]
        log.error("email outbox row %s failed for good: %s", row["id"], error)
        await alerts.emit("email.failed",
                          f"Email outbox row {row['id']} ({row['payload'].get('template')}) "
                          f"failed {row['attempts']} times ({error_type})",
                          severity="error", tenant_id=str(row["tenant_id"]), outbox_id=row["id"],
                          template=row["payload"].get("template"), error_type=error_type)
    return status


async def _invoice_mail(row) -> tuple[str, str, list[Attachment]]:
    from . import invoices_pdf, invoicing   # keeps the mailer importable without the invoice stack

    async with db.tenant_conn(str(row["tenant_id"])) as conn:
        inv = await invoicing.detail(conn, row["payload"]["invoice_id"])
        seller = await invoicing.seller(conn, row["tenant_id"])
    ref = inv.number or inv.legacy_ref or inv.id[:8]
    rupees, paisa = divmod(inv.balance_minor or inv.total_minor, 100)
    amount = f"Rs {rupees:,}" + (f".{paisa:02d}" if paisa else "")
    company = seller.get("name") or "us"
    due = f", due {inv.due_date.strftime('%d %b %Y')}" if inv.due_date else ""
    body = (f"Dear {inv.contact_name or 'customer'},\n\nPlease find invoice {ref} attached: {amount}{due}.\n\n"
            f"Thank you,\n{company}")
    pdf = invoices_pdf.build_invoice_pdf(inv, seller)
    return f"Invoice {ref} from {company}", body, [(f"{ref}.pdf", pdf, "application/pdf")]


async def _quote_mail(row) -> tuple[str, str, list[Attachment]] | None:
    """None when the quote is no longer open: a dead link isn't worth sending."""
    from . import invoicing, quotes, quotes_pdf, sequences

    async with db.tenant_conn(str(row["tenant_id"])) as conn:
        r = await quotes.get(conn, row["payload"]["quote_id"])
        if not quotes.is_open(r, await sequences.local_date(conn, None)):
            return None
        q = await quotes.out(conn, r)
        seller = await invoicing.seller(conn, row["tenant_id"])
        link = f"{WEB}{quotes.plain_link(r)}"
    company = seller.get("name") or "us"
    rupees, paisa = divmod(q.total_minor, 100)
    amount = f"Rs {rupees:,}" + (f".{paisa:02d}" if paisa else "")
    body = (f"Dear {q.customer_name or 'customer'},\n\nPlease find quote {q.number} for {amount}, valid until "
            f"{q.valid_until.strftime('%d %b %Y')}. You can view and accept it here:\n{link}\n\n"
            f"The quote is also attached as a PDF.\n\nThank you,\n{company}")
    return (f"Quote {q.number} from {company}", body,
            [(f"{q.number}.pdf", quotes_pdf.build_quote_pdf(q, seller), "application/pdf")])


async def _deliver(row) -> str | None:
    try:
        if row["payload"]["template"] == "invoice":
            subject, body, files = await _invoice_mail(row)
            await _send_attached(row["payload"]["to"], subject, body, files)
        elif row["payload"]["template"] == "quote":
            mail = await _quote_mail(row)
            if mail is not None:
                await _send_attached(row["payload"]["to"], *mail)
        else:
            subject, body = await _render(row)
            await _send(row["payload"]["to"], subject, body)
    except Exception as e:  # noqa: BLE001 — SMTP down, bad template: an ordinary failed attempt
        log.warning("email outbox row %s not sent (attempt %s): %r", row["id"], row["attempts"], e)
        return await _settle(row, f"{type(e).__name__}: {e}")
    return await _settle(row, None)


async def deliver_now(outbox_id: int) -> None:
    """The post-commit fast path for one row just queued. Never raises: the
    row stays queued for the worker."""
    try:
        rows = await _claim(1, outbox_id)
        if rows:
            await _deliver(rows[0])
    except Exception:  # noqa: BLE001
        log.exception("fast-path delivery of email outbox row %s failed", outbox_id)


async def _reap() -> int:
    async with db.owner_conn() as oc:
        status = await oc.execute(
            f"""update outbox set status = 'retry', locked_until = null, run_after = now(),
                       last_error_code = 'abandoned', updated_at = now()
                 where kind = '{KIND}' and status = 'sending' and locked_until < now()""")
    return int(status.split()[-1])


async def process_outbox() -> int:
    """The worker's email job: requeue abandoned sends, then deliver everything
    due. Returns the number sent."""
    await _reap()
    sent = 0
    for _ in range(MAX_PASSES):
        rows = await _claim(BATCH)
        if not rows:
            break
        for row in rows:
            sent += (await _deliver(row)) == "done"
    return sent
