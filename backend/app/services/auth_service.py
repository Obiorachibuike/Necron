"""Account lifecycle, session handling and security tokens."""
from __future__ import annotations

import logging
import secrets
from datetime import timedelta
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AuthError, ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.core.security import (
    constant_time_equals,
    hash_password,
    new_session_token,
    sha256,
    verify_password,
)
from app.database.base import utcnow
from app.models import (
    CareerPreference,
    OnboardingDraft,
    SecurityToken,
    User,
    UserProfile,
    UserSession,
    WritingStyleProfile,
)
from app.services.email_service import reset_email, send_email, verification_email

logger = logging.getLogger("careerpilot.auth")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def register_user(db: Session, email: str, password: str, display_name: str) -> User:
    email = normalize_email(email)
    if get_user_by_email(db, email):
        raise ConflictError("An account with that email already exists.", code="email_in_use")
    user = User(
        email=email,
        password_hash=hash_password(password),
        display_name=(display_name or "").strip()[:120],
        is_active=True,
        email_verified=False,
    )
    db.add(user)
    db.flush()
    db.add(UserProfile(user_id=user.id, preferred_name=user.display_name))
    db.add(CareerPreference(user_id=user.id))
    db.add(WritingStyleProfile(user_id=user.id))
    db.add(OnboardingDraft(user_id=user.id, step=1, data={}))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("An account with that email already exists.", code="email_in_use") from exc
    db.refresh(user)
    return user


def create_session(db: Session, user: User, user_agent: str = "", ip: str = "") -> tuple[UserSession, str, str]:
    settings = get_settings()
    raw_token = new_session_token()
    raw_csrf = secrets.token_urlsafe(32)
    now = utcnow()
    session = UserSession(
        user_id=user.id,
        token_hash=sha256(raw_token),
        csrf_hash=sha256(raw_csrf),
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(hours=settings.session_ttl_hours),
        ip_hash=sha256(ip)[:64] if ip else None,
        user_agent=(user_agent or "")[:300],
    )
    db.add(session)
    user.last_login_at = now
    db.commit()
    db.refresh(session)
    return session, raw_token, raw_csrf


def authenticate(db: Session, email: str, password: str) -> User:
    user = get_user_by_email(db, email)
    # Always run a hash verification to keep timing roughly consistent.
    dummy_hash = (
        "$argon2id$v=19$m=65536,t=3,p=2$c29tZXNhbHRzb21lc2FsdA$"
        "IxZ0m0h4nF0k1o4g0Ck8Qf3k5b1n8W0o6o5Q2m5m1oA"
    )
    password_hash = user.password_hash if user else dummy_hash
    valid = verify_password(password, password_hash)
    if not user or not valid:
        raise AuthError("Email or password is incorrect.", code="invalid_credentials")
    if not user.is_active:
        raise ForbiddenError("This account has been deactivated.")
    return user


def resolve_session(db: Session, raw_token: str | None) -> tuple[User, UserSession] | None:
    if not raw_token:
        return None
    session = db.scalar(select(UserSession).where(UserSession.token_hash == sha256(raw_token)))
    if not session:
        return None
    now = utcnow()
    if session.revoked_at or session.expires_at <= now:
        return None
    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        return None
    if now - session.last_seen_at > timedelta(minutes=5):
        session.last_seen_at = now
        db.commit()
    return user, session


def validate_csrf(session: UserSession, header_token: str | None, cookie_token: str | None) -> None:
    if not header_token or not cookie_token:
        raise AuthError("Missing CSRF token. Refresh the page and try again.", code="csrf_failed")
    if not constant_time_equals(header_token, cookie_token):
        raise AuthError("CSRF token mismatch. Refresh the page and try again.", code="csrf_failed")
    if not constant_time_equals(sha256(header_token), session.csrf_hash):
        raise AuthError("CSRF token is invalid. Sign in again.", code="csrf_failed")


def revoke_session(db: Session, session: UserSession) -> None:
    session.revoked_at = utcnow()
    db.commit()


def revoke_all_sessions(db: Session, user_id: str, except_session_id: str | None = None) -> int:
    sessions = db.scalars(
        select(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
    ).all()
    count = 0
    for session in sessions:
        if except_session_id and session.id == except_session_id:
            continue
        session.revoked_at = utcnow()
        count += 1
    db.commit()
    return count


def list_sessions(db: Session, user_id: str, current_id: str) -> list[UserSession]:
    return list(
        db.scalars(
            select(UserSession)
            .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None),
                   UserSession.expires_at > utcnow())
            .order_by(UserSession.last_seen_at.desc())
        ).all()
    )


def change_password(db: Session, user: User, current_password: str, new_password: str,
                    current_session_id: str) -> int:
    if not verify_password(current_password, user.password_hash):
        raise AuthError("Current password is incorrect.", code="invalid_password")
    if verify_password(new_password, user.password_hash):
        raise ValidationAppError("Choose a password you have not used before.")
    user.password_hash = hash_password(new_password)
    user.token_version += 1
    db.commit()
    return revoke_all_sessions(db, user.id, except_session_id=current_session_id)


def _create_token(db: Session, user: User, purpose: str, ttl: timedelta) -> str:
    raw = secrets.token_urlsafe(40)
    db.add(
        SecurityToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=sha256(raw),
            expires_at=utcnow() + ttl,
            created_at=utcnow(),
        )
    )
    db.commit()
    return raw


def create_verification_token(db: Session, user: User) -> str:
    return _create_token(db, user, "email_verification", timedelta(hours=24))


def _consume_token(db: Session, raw: str, purpose: str) -> SecurityToken:
    token = db.scalar(select(SecurityToken).where(SecurityToken.token_hash == sha256(raw)))
    now = utcnow()
    if not token or token.purpose != purpose or token.used_at or token.expires_at <= now:
        raise AuthError("This link is invalid or has expired. Request a new one.", code="invalid_token")
    return token


async def send_verification(db: Session, user: User, frontend_origin: str) -> str | None:
    settings = get_settings()
    if user.email_verified:
        return None
    raw = create_verification_token(db, user)
    link = f"{frontend_origin}/verify-email?token={quote(raw)}"
    subject, body = verification_email(user.display_name, link)
    await send_email(user.email, subject, body)
    return link if settings.dev_tokens_enabled else None


async def verify_email(db: Session, raw: str) -> User:
    token = _consume_token(db, raw, "email_verification")
    user = db.get(User, token.user_id)
    if not user:
        raise NotFoundError("Account not found")
    token.used_at = utcnow()
    user.email_verified = True
    user.email_verified_at = utcnow()
    db.commit()
    return user


async def request_password_reset(db: Session, email: str, frontend_origin: str) -> str | None:
    settings = get_settings()
    user = get_user_by_email(db, email)
    if not user:
        return None  # never reveal account existence
    raw = _create_token(db, user, "password_reset", timedelta(hours=1))
    link = f"{frontend_origin}/reset-password?token={quote(raw)}"
    subject, body = reset_email(user.display_name, link)
    await send_email(user.email, subject, body)
    return link if settings.dev_tokens_enabled else None


def reset_password(db: Session, raw: str, new_password: str) -> User:
    token = _consume_token(db, raw, "password_reset")
    user = db.get(User, token.user_id)
    if not user:
        raise NotFoundError("Account not found")
    token.used_at = utcnow()
    user.password_hash = hash_password(new_password)
    user.token_version += 1
    db.commit()
    revoke_all_sessions(db, user.id)
    return user


def delete_account(db: Session, user: User, password: str) -> None:
    from app.services.storage import delete_user_files

    if not verify_password(password, user.password_hash):
        raise AuthError("Password is incorrect.", code="invalid_password")
    user_id = user.id
    db.delete(user)
    db.commit()
    delete_user_files(user_id)


def assert_user_active(user: User) -> None:
    if not user.is_active:
        raise ForbiddenError("This account has been deactivated.")
