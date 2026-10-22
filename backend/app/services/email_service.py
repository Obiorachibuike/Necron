"""Email delivery with an honest 'not configured' path.

If SMTP is not configured, messages are logged (without secrets) in development
and the API never claims an email was delivered.
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage
from dataclasses import dataclass

from app.core.config import get_settings

logger = logging.getLogger("careerpilot.email")


@dataclass
class EmailResult:
    sent: bool
    configured: bool
    message: str


def _send_sync(to: str, subject: str, body: str) -> None:
    settings = get_settings()
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password or "")
        smtp.send_message(message)


async def send_email(to: str, subject: str, body: str) -> EmailResult:
    settings = get_settings()
    if not settings.email_configured:
        logger.info("email_not_configured to=%s subject=%s", _mask(to), subject)
        return EmailResult(
            sent=False,
            configured=False,
            message="Email delivery is not configured on this deployment.",
        )
    try:
        await asyncio.wait_for(asyncio.to_thread(_send_sync, to, subject, body), timeout=25)
        return EmailResult(sent=True, configured=True, message="Email sent.")
    except Exception as exc:  # pragma: no cover - depends on external SMTP
        logger.warning("email_send_failed to=%s error=%s", _mask(to), type(exc).__name__)
        return EmailResult(sent=False, configured=True, message="The email could not be delivered.")


def _mask(value: str) -> str:
    local, _, domain = value.partition("@")
    return f"{local[:2]}***@{domain}" if domain else "***"


def verification_email(name: str, link: str) -> tuple[str, str]:
    return (
        "Verify your CareerPilot AI email",
        f"Hi {name or 'there'},\n\nConfirm your email address to finish setting up your "
        f"CareerPilot AI account:\n\n{link}\n\nThis link expires in 24 hours. "
        f"If you did not create an account, you can ignore this email.\n",
    )


def reset_email(name: str, link: str) -> tuple[str, str]:
    return (
        "Reset your CareerPilot AI password",
        f"Hi {name or 'there'},\n\nUse this link to choose a new password:\n\n{link}\n\n"
        f"This link expires in 1 hour and can only be used once. If you did not request a "
        f"reset, no action is needed and your password remains unchanged.\n",
    )


def notification_email(title: str, body: str, link: str) -> tuple[str, str]:
    return (title, f"{body}\n\nOpen CareerPilot AI: {link}\n")
