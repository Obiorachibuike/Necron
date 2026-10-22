"""Shared FastAPI dependencies: authenticated user, pagination, CSRF."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AuthError, ForbiddenError
from app.core.security import constant_time_equals, sha256
from app.database.session import get_db
from app.models import User, UserSession
from app.services.auth_service import resolve_session, validate_csrf

DbSession = Annotated[Session, Depends(get_db)]
MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


class AuthContext:
    def __init__(self, user: User, session: UserSession) -> None:
        self.user = user
        self.session = session


def get_auth_context(request: Request, db: DbSession) -> AuthContext:
    settings = get_settings()
    raw = request.cookies.get(settings.session_cookie_name)
    resolved = resolve_session(db, raw)
    if not resolved:
        raise AuthError("Please sign in to continue.")
    user, session = resolved
    if settings.require_email_verification and not user.email_verified:
        allowed = ("/api/v1/auth/", "/api/v1/health", "/api/v1/privacy")
        if not request.url.path.startswith(allowed):
            raise ForbiddenError("Verify your email address to continue.")
    if request.method in MUTATING:
        header_token = request.headers.get("x-csrf-token")
        cookie_token = request.cookies.get(settings.csrf_cookie_name)
        validate_csrf(session, header_token, cookie_token)
    return AuthContext(user=user, session=session)


def get_current_user(ctx: Annotated[AuthContext, Depends(get_auth_context)]) -> User:
    return ctx.user


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentAuth = Annotated[AuthContext, Depends(get_auth_context)]


class Pagination:
    def __init__(self, page: int = Query(1, ge=1, le=10_000),
                 page_size: int = Query(20, ge=1, le=100)) -> None:
        self.page = page
        self.page_size = page_size
        self.offset = (page - 1) * page_size


def csrf_cookie_token(request: Request) -> str:
    return request.cookies.get(get_settings().csrf_cookie_name, "")
