"""Authentication and account endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Request, Response
from app.api.deps import CurrentAuth, CurrentUser, DbSession
from app.core.config import get_settings
from app.core.errors import AuthError, ConflictError
from app.database.base import utcnow
from app.models import User, UserSession
from app.schemas.auth import (
    AuthResponse,
    AuthUser,
    ChangePasswordRequest,
    DeleteAccountRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    SessionInfo,
    UpdateAccountRequest,
    VerifyEmailRequest,
    AIDisclosureRequest,
    OkResponse,
    LinkMessage,
)
from app.services.auth_service import (
    authenticate,
    change_password,
    create_session,
    delete_account,
    list_sessions,
    normalize_email,
    register_user,
    request_password_reset,
    reset_password,
    revoke_all_sessions,
    revoke_session,
    send_verification,
    verify_email,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


def set_auth_cookies(response: Response, token: str, csrf: str, expires) -> None:
    settings = get_settings()
    max_age = settings.session_ttl_hours * 3600
    response.set_cookie(
        settings.session_cookie_name, token, max_age=max_age, httponly=True,
        secure=settings.secure_cookies, samesite=settings.cookie_samesite, path="/",
        expires=expires,
    )
    response.set_cookie(
        settings.csrf_cookie_name, csrf, max_age=max_age, httponly=False,
        secure=settings.secure_cookies, samesite=settings.cookie_samesite, path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.delete_cookie(settings.csrf_cookie_name, path="/")


def _user_out(user: User) -> AuthUser:
    return AuthUser(
        id=user.id, email=user.email, display_name=user.display_name,
        email_verified=user.email_verified, onboarding_completed=user.onboarding_completed,
        onboarding_step=user.onboarding_step,
        ai_disclosure_accepted=user.ai_disclosure_accepted_at is not None,
        created_at=user.created_at,
    )


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(payload: RegisterRequest, request: Request, response: Response,
                   db: DbSession) -> AuthResponse:
    settings = get_settings()
    user = register_user(db, normalize_email(str(payload.email)), payload.password,
                         payload.display_name)
    dev_url = None
    if not user.email_verified:
        dev_url = await send_verification(db, user, settings.frontend_origin)
    session, token, csrf = create_session(
        db, user, user_agent=request.headers.get("user-agent", ""),
        ip=request.client.host if request.client else "",
    )
    set_auth_cookies(response, token, csrf, session.expires_at)
    return AuthResponse(
        user=_user_out(user), csrf_token=csrf, expires_at=session.expires_at,
        email_verification_required=settings.require_email_verification and not user.email_verified,
        dev_verification_url=dev_url,
    )


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, request: Request, response: Response,
                db: DbSession) -> AuthResponse:
    settings = get_settings()
    user = authenticate(db, str(payload.email), payload.password)
    session, token, csrf = create_session(
        db, user, user_agent=request.headers.get("user-agent", ""),
        ip=request.client.host if request.client else "",
    )
    set_auth_cookies(response, token, csrf, session.expires_at)
    return AuthResponse(
        user=_user_out(user), csrf_token=csrf, expires_at=session.expires_at,
        email_verification_required=settings.require_email_verification and not user.email_verified,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(ctx: CurrentAuth, response: Response, db: DbSession) -> MessageResponse:
    revoke_session(db, ctx.session)
    clear_auth_cookies(response)
    return MessageResponse(message="Signed out.")


@router.get("/me", response_model=AuthUser)
async def me(user: CurrentUser) -> AuthUser:
    return _user_out(user)


@router.patch("/account", response_model=AuthUser)
async def update_account(payload: UpdateAccountRequest, user: CurrentUser,
                         db: DbSession) -> AuthUser:
    user.display_name = payload.display_name.strip()[:120]
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.post("/change-password", response_model=MessageResponse)
async def update_password(payload: ChangePasswordRequest, ctx: CurrentAuth,
                          db: DbSession) -> MessageResponse:
    revoked = change_password(db, ctx.user, payload.current_password, payload.new_password,
                              ctx.session.id)
    return MessageResponse(
        message=f"Password updated. {revoked} other session(s) were signed out.")


@router.post("/forgot-password", response_model=LinkMessage)
async def forgot_password(payload: ForgotPasswordRequest, db: DbSession) -> LinkMessage:
    settings = get_settings()
    link = await request_password_reset(db, normalize_email(str(payload.email)),
                                        settings.frontend_origin)
    return LinkMessage(
        message=("If an account exists for that email, a reset link has been sent. "
                 "Check your spam folder if it does not arrive."),
        code="reset_requested",
        dev_reset_url=link,
    )


@router.post("/reset-password", response_model=MessageResponse)
async def complete_password_reset(payload: ResetPasswordRequest, response: Response,
                                  db: DbSession) -> MessageResponse:
    reset_password(db, payload.token, payload.new_password)
    clear_auth_cookies(response)
    return MessageResponse(message="Password reset. Sign in with your new password.")


@router.post("/verify-email", response_model=AuthUser)
async def verify(payload: VerifyEmailRequest, db: DbSession) -> AuthUser:
    user = await verify_email(db, payload.token)
    return _user_out(user)


@router.post("/resend-verification", response_model=LinkMessage)
async def resend(user: CurrentUser, db: DbSession) -> LinkMessage:
    settings = get_settings()
    if user.email_verified:
        return LinkMessage(message="This email address is already verified.")
    raw_link = await send_verification(db, user, settings.frontend_origin)
    return LinkMessage(
        message=("Verification email sent." if settings.email_configured
                 else "Email delivery is not configured on this deployment."),
        code="verification_sent" if settings.email_configured else "email_not_configured",
        dev_verification_url=raw_link,
    )


@router.get("/sessions", response_model=list[SessionInfo])
async def sessions(ctx: CurrentAuth, db: DbSession) -> list[SessionInfo]:
    items = list_sessions(db, ctx.user.id, ctx.session.id)
    return [
        SessionInfo(id=item.id, created_at=item.created_at, last_seen_at=item.last_seen_at,
                    expires_at=item.expires_at, current=item.id == ctx.session.id,
                    user_agent=item.user_agent)
        for item in items
    ]


@router.delete("/sessions/{session_id}", response_model=MessageResponse)
async def revoke_one(session_id: str, ctx: CurrentAuth, db: DbSession) -> MessageResponse:
    session = db.get(UserSession, session_id)
    if not session or session.user_id != ctx.user.id:
        raise AuthError("Session not found", code="not_found")
    if session.id == ctx.session.id:
        raise ConflictError("Use sign out to end the current session.")
    revoke_session(db, session)
    return MessageResponse(message="Session revoked.")


@router.post("/sessions/revoke-others", response_model=MessageResponse)
async def revoke_others(ctx: CurrentAuth, db: DbSession) -> MessageResponse:
    count = revoke_all_sessions(db, ctx.user.id, except_session_id=ctx.session.id)
    return MessageResponse(message=f"Signed out {count} other session(s).")


@router.post("/accept-ai-disclosure", response_model=OkResponse)
async def accept_ai_disclosure(payload: AIDisclosureRequest, user: CurrentUser,
                               db: DbSession) -> OkResponse:
    if payload.accepted:
        user.ai_disclosure_accepted_at = utcnow()
        db.commit()
    return OkResponse(ok=True)


@router.post("/delete-account", response_model=MessageResponse)
async def delete_my_account(payload: DeleteAccountRequest, ctx: CurrentAuth,
                            response: Response, db: DbSession) -> MessageResponse:
    delete_account(db, ctx.user, payload.password)
    clear_auth_cookies(response)
    return MessageResponse(message="Your account and associated data have been deleted.")
