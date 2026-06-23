"""Email notifications for CRM activity."""

from __future__ import annotations

import asyncio
from email.message import EmailMessage
from email.utils import formataddr
import logging
import smtplib
from typing import Any, Mapping, Sequence
from urllib.parse import quote

from config import settings
from database import execute_query


logger = logging.getLogger(__name__)


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_email(value: Any) -> str:
    return _clean_text(value).lower()


def _looks_like_email(value: str) -> bool:
    return "@" in value and "." in value.rsplit("@", 1)[-1]


def _case_public_id(record_id: str) -> str:
    if record_id.upper().startswith("REC-"):
        return f"CASE-{record_id[4:]}".upper()
    return record_id.upper()


def _case_url(record_id: str) -> str:
    return f"{settings.app_base_url}/cases/{_case_public_id(record_id)}"


def _smtp_configured() -> bool:
    return all(
        [
            settings.email_notifications_enabled,
            settings.smtp_host,
            settings.smtp_port,
            settings.smtp_username,
            settings.smtp_password,
            settings.smtp_from_email,
        ]
    )


def is_smtp_configured() -> bool:
    return _smtp_configured()


async def _fetch_case_recipients(case_record: Mapping[str, Any]) -> list[str]:
    record_id = _clean_text(case_record.get("recordId"))
    recipients: set[str] = set()
    names: set[str] = set()

    for value in [case_record.get("seOwner"), case_record.get("assignedTo")]:
        cleaned = _clean_text(value)
        if not cleaned:
            continue
        if _looks_like_email(cleaned):
            recipients.add(_normalize_email(cleaned))
        else:
            names.add(cleaned.lower())

    if names:
        placeholders = ", ".join(["%s"] * len(names))
        owner_rows = await execute_query(
            f"""
            SELECT email
            FROM users
            WHERE isActive = 1
              AND LOWER(TRIM(displayName)) IN ({placeholders})
            """,
            list(names),
        )
        recipients.update(_normalize_email(row.get("email")) for row in owner_rows if _normalize_email(row.get("email")))

    watcher_rows = await execute_query(
        """
        SELECT DISTINCT u.email, cw.displayName
        FROM case_watchers cw
        LEFT JOIN users u
          ON u.id = cw.userId
          OR LOWER(TRIM(u.displayName)) = LOWER(TRIM(cw.displayName))
        WHERE cw.caseRecordId = %s
          AND (u.isActive = 1 OR u.id IS NULL)
        """,
        [record_id],
    )
    for row in watcher_rows:
        email = _normalize_email(row.get("email"))
        display_name = _clean_text(row.get("displayName"))
        if email:
            recipients.add(email)
        elif _looks_like_email(display_name):
            recipients.add(_normalize_email(display_name))

    return sorted(recipients)


def _format_changes(changes: Sequence[Mapping[str, Any]]) -> str:
    if not changes:
        return "The case was updated."

    lines = []
    for change in changes[:12]:
        field = _clean_text(change.get("field")) or "Field"
        previous_value = _clean_text(change.get("previousValue")) or "-"
        new_value = _clean_text(change.get("newValue")) or "-"
        lines.append(f"- {field}: {previous_value} -> {new_value}")

    if len(changes) > len(lines):
        lines.append(f"- {len(changes) - len(lines)} more change(s)")

    return "\n".join(lines)


def _build_case_update_message(
    case_record: Mapping[str, Any],
    recipients: Sequence[str],
    changes: Sequence[Mapping[str, Any]],
    actor_name: str,
) -> EmailMessage:
    record_id = _clean_text(case_record.get("recordId"))
    public_id = _case_public_id(record_id)
    description = _clean_text(case_record.get("description")) or "Untitled case"
    status = _clean_text(case_record.get("status")) or "-"
    priority = _clean_text(case_record.get("priority")) or "-"
    url = _case_url(record_id)

    message = EmailMessage()
    message["Subject"] = f"[CRM] {public_id} updated"
    message["From"] = formataddr((settings.smtp_from_name, settings.smtp_from_email))
    message["To"] = ", ".join(recipients)
    message.set_content(
        "\n".join(
            [
                f"{public_id} was updated by {actor_name or 'Unknown user'}.",
                "",
                description,
                "",
                f"Escalation Status: {status}",
                f"Priority: {priority}",
                "",
                "Changes:",
                _format_changes(changes),
                "",
                f"Open case: {url}",
            ]
        )
    )
    return message


def _password_reset_url(token: str) -> str:
    return f"{settings.app_base_url}/login?resetToken={quote(token, safe='')}"


def _build_password_reset_message(user: Mapping[str, Any], reset_token: str, expires_minutes: int) -> EmailMessage:
    display_name = _clean_text(user.get("displayName")) or "there"
    reset_url = _password_reset_url(reset_token)

    message = EmailMessage()
    message["Subject"] = "[CRM] Reset your password"
    message["From"] = formataddr((settings.smtp_from_name, settings.smtp_from_email))
    message["To"] = _clean_text(user.get("email"))
    message.set_content(
        "\n".join(
            [
                f"Hi {display_name},",
                "",
                "We received a request to reset your CRM password.",
                f"This link expires in {expires_minutes} minutes:",
                "",
                reset_url,
                "",
                "If you did not request this, you can ignore this email.",
            ]
        )
    )
    return message


def _send_message(message: EmailMessage) -> None:
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds) as smtp:
        if settings.smtp_use_starttls:
            smtp.starttls()
        smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


async def send_case_update_notification(
    case_record: Mapping[str, Any],
    changes: Sequence[Mapping[str, Any]],
    actor_name: str,
) -> None:
    """Notify case owners and watchers that a case changed."""

    if not _smtp_configured():
        logger.debug("Case email notification skipped because SMTP is not configured.")
        return

    recipients = await _fetch_case_recipients(case_record)
    if not recipients:
        logger.info("Case email notification skipped for %s because there are no recipients.", case_record.get("recordId"))
        return

    message = _build_case_update_message(case_record, recipients, changes, actor_name)

    try:
        await asyncio.to_thread(_send_message, message)
        logger.info(
            "Sent case update email for %s to %s recipient(s): %s",
            case_record.get("recordId"),
            len(recipients),
            ", ".join(recipients),
        )
    except Exception:
        logger.exception("Failed to send case update email for %s.", case_record.get("recordId"))


async def send_password_reset_email(user: Mapping[str, Any], reset_token: str, expires_minutes: int) -> None:
    """Send a password reset link to the user's account email."""

    if not _smtp_configured():
        raise RuntimeError("SMTP is not configured")

    email = _normalize_email(user.get("email"))
    if not email:
        raise RuntimeError("User email is missing")

    message = _build_password_reset_message(user, reset_token, expires_minutes)

    try:
        await asyncio.to_thread(_send_message, message)
        logger.info("Sent password reset email for user %s to %s", user.get("id"), email)
    except Exception:
        logger.exception("Failed to send password reset email for user %s.", user.get("id"))
        raise
