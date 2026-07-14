"""Transactional email behind a provider abstraction.

'console' (default) logs the message + link so flows work end-to-end in dev with
no credentials. 'smtp' sends for real. A Resend/SES HTTP provider slots in the
same way — implement `_send` and branch on settings.email_provider.
"""
from __future__ import annotations

import asyncio
import logging
from email.message import EmailMessage

from .config import settings

log = logging.getLogger("email")

WEB = settings.web_origin.split(",")[0].strip()


async def _send(to: str, subject: str, body: str) -> None:
    if settings.email_provider == "smtp" and settings.smtp_host:
        await asyncio.to_thread(_send_smtp, to, subject, body)
    else:
        log.warning("EMAIL[console] to=%s | %s\n%s", to, subject, body)


def _send_smtp(to: str, subject: str, body: str) -> None:
    import smtplib

    msg = EmailMessage()
    msg["From"] = settings.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
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


async def send_password_reset(to: str, token: str) -> None:
    link = f"{WEB}/reset?token={token}"
    await _send(to, "Reset your Business OS password",
                f"Click to reset your password (valid 1 hour):\n{link}\n\nIf you didn't request this, ignore it.")


async def send_verification(to: str, token: str) -> None:
    link = f"{WEB}/verify?token={token}"
    await _send(to, "Verify your email",
                f"Welcome to Business OS! Confirm your email:\n{link}")


async def send_invite(to: str, tenant_name: str, token: str) -> None:
    link = f"{WEB}/accept-invite?token={token}"
    await _send(to, f"You're invited to {tenant_name} on Business OS",
                f"You've been invited to join {tenant_name}. Set up your account:\n{link}")
