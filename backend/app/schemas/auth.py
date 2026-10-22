"""Authentication, account and onboarding schemas."""
from __future__ import annotations

import re
from datetime import datetime

from pydantic import EmailStr, Field, field_validator, model_validator

from app.core.config import get_settings
from app.schemas.common import AppSchema, MessageResponse, ORMModel

BCRYPT_MAX = 128
PREDICTABLE = {"password123", "12345678910", "qwertyuiop1", "careerpilot123"}


def validate_password_strength(value: str) -> str:
    settings = get_settings()
    if len(value) < settings.password_min_length:
        raise ValueError(f"Password must be at least {settings.password_min_length} characters")
    if len(value) > BCRYPT_MAX:
        raise ValueError("Password is too long")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Include at least one letter and one number")
    if value.lower() in PREDICTABLE:
        raise ValueError("Choose a less predictable password")
    return value


class RegisterRequest(AppSchema):
    email: EmailStr
    password: str = Field(min_length=10, max_length=BCRYPT_MAX)
    display_name: str = Field(default="", max_length=120)
    accept_terms: bool = True

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        return validate_password_strength(value)

    @field_validator("accept_terms")
    @classmethod
    def _terms(cls, value: bool) -> bool:
        if not value:
            raise ValueError("You must accept the Terms of Service and Privacy Policy")
        return value


class LoginRequest(AppSchema):
    email: EmailStr
    password: str = Field(min_length=1, max_length=BCRYPT_MAX)


class AuthUser(AppSchema):
    id: str
    email: str
    display_name: str
    email_verified: bool
    onboarding_completed: bool
    onboarding_step: int
    ai_disclosure_accepted: bool = False
    created_at: datetime | None = None


class AuthResponse(AppSchema):
    user: AuthUser
    csrf_token: str
    expires_at: datetime
    email_verification_required: bool = False
    dev_verification_url: str | None = None
    dev_reset_url: str | None = None


class ForgotPasswordRequest(AppSchema):
    email: EmailStr


class ResetPasswordRequest(AppSchema):
    token: str = Field(min_length=10, max_length=300)
    new_password: str = Field(min_length=10, max_length=BCRYPT_MAX)

    @field_validator("new_password")
    @classmethod
    def _strength(cls, value: str) -> str:
        return validate_password_strength(value)


class ChangePasswordRequest(AppSchema):
    current_password: str = Field(min_length=1, max_length=BCRYPT_MAX)
    new_password: str = Field(min_length=10, max_length=BCRYPT_MAX)

    @field_validator("new_password")
    @classmethod
    def _strength(cls, value: str) -> str:
        return validate_password_strength(value)


class VerifyEmailRequest(AppSchema):
    token: str = Field(min_length=10, max_length=300)


class UpdateAccountRequest(AppSchema):
    display_name: str = Field(default="", max_length=120)


class DeleteAccountRequest(AppSchema):
    password: str = Field(min_length=1, max_length=BCRYPT_MAX)
    confirm: str = Field(default="", max_length=40)

    @model_validator(mode="after")
    def _confirm(self):
        if self.confirm.strip().upper() != "DELETE":
            raise ValueError('Type DELETE to confirm account deletion')
        return self


class SessionInfo(ORMModel):
    id: str
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    current: bool = False
    user_agent: str | None = None


class OnboardingDraftIn(AppSchema):
    step: int = Field(1, ge=1, le=11)
    data: dict = Field(default_factory=dict)


class OnboardingDraftOut(ORMModel):
    step: int
    data: dict
    cv_import: dict
    updated_at: datetime
    completed_at: datetime | None = None


class OnboardingCompleteIn(AppSchema):
    """Final submission of onboarding. Persists all approved information."""

    data: dict
    profile: dict = Field(default_factory=dict)
    experiences: list[dict] = Field(default_factory=list)
    education: list[dict] = Field(default_factory=list)
    skills: list[dict] = Field(default_factory=list)
    projects: list[dict] = Field(default_factory=list)
    certifications: list[dict] = Field(default_factory=list)
    achievements: list[dict] = Field(default_factory=list)
    preferences: dict = Field(default_factory=dict)
    writing_style: dict = Field(default_factory=dict)
    cv_import: dict = Field(default_factory=dict)


class OnboardingStatus(AppSchema):
    completed: bool
    step: int
    completeness: int
    missing: list[str]
    has_profile_data: bool
    email_verified: bool
    email_verification_required: bool
    ai_configured: bool
    draft: OnboardingDraftOut | None = None


class AIDisclosureRequest(AppSchema):
    accepted: bool


class OkResponse(AppSchema):
    ok: bool = True


class LinkMessage(MessageResponse):
    dev_reset_url: str | None = None
    dev_verification_url: str | None = None
