"""In-app notifications with optional email delivery."""
from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import NotFoundError
from app.database.base import utcnow
from app.models import Notification
from app.services.email_service import notification_email, send_email

logger = logging.getLogger("careerpilot.notifications")

RECENT_DUPLICATE_WINDOW = timedelta(hours=6)


def create_notification(db: Session, user_id: str, kind: str, title: str, body: str = "",
                        link: str = "", send_email_too: bool = False) -> Notification:
    settings = get_settings()
    existing = db.scalar(select(Notification).where(
        Notification.user_id == user_id,
        Notification.kind == kind,
        Notification.title == title,
        Notification.created_at >= utcnow() - RECENT_DUPLICATE_WINDOW,
    ))
    if existing:
        return existing
    notification = Notification(user_id=user_id, kind=kind, title=title[:300], body=body[:4000],
                                link=link[:500])
    db.add(notification)
    db.commit()
    db.refresh(notification)
    if send_email_too and settings.email_configured:
        # Best effort; the API never claims delivery unless it succeeded.
        import asyncio

        async def _send() -> None:
            subject, text = notification_email(
                title, body, f"{settings.effective_frontend_origin}{link}")
            from app.models import User

            user = db.get(User, user_id)
            if not user:
                return
            result = await send_email(user.email, subject, text)
            if result.sent:
                notification.email_sent_at = utcnow()
                db.commit()

        try:
            asyncio.run(_send())
        except RuntimeError:  # already inside an event loop
            logger.info("notification_email_deferred notification=%s", notification.id)
    return notification


def list_notifications(db: Session, user_id: str, limit: int = 30, offset: int = 0) -> tuple[list[Notification], int]:
    items = list(db.scalars(select(Notification).where(Notification.user_id == user_id)
                            .order_by(Notification.created_at.desc())
                            .limit(limit).offset(offset)).all())
    unread = db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user_id, Notification.read_at.is_(None))) or 0
    return items, int(unread)


def mark_read(db: Session, user_id: str, notification_id: str) -> Notification:
    notification = db.get(Notification, notification_id)
    if not notification or notification.user_id != user_id:
        raise NotFoundError("Notification not found")
    if not notification.read_at:
        notification.read_at = utcnow()
        db.commit()
    return notification


def mark_all_read(db: Session, user_id: str) -> int:
    items = db.scalars(select(Notification).where(
        Notification.user_id == user_id, Notification.read_at.is_(None))).all()
    now = utcnow()
    for item in items:
        item.read_at = now
    db.commit()
    return len(items)


def unread_count(db: Session, user_id: str) -> int:
    return int(db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user_id, Notification.read_at.is_(None))) or 0)


def clear_all(db: Session, user_id: str) -> int:
    items = list(db.scalars(select(Notification).where(Notification.user_id == user_id)).all())
    for item in items:
        db.delete(item)
    db.commit()
    return len(items)
