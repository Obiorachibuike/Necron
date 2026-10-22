"""Application configuration, loaded from environment variables only."""
from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_MEDIA_ROOT = BASE_DIR / "media"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CP_", env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "CareerPilot AI"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    debug: bool = False

    # Security
    secret_key: str = Field(default="dev-only-insecure-secret-change-me")
    ai_encryption_key: str | None = None
    session_cookie_name: str = "cp_session"
    csrf_cookie_name: str = "cp_csrf"
    theme_cookie_name: str = "cp_theme"
    session_ttl_hours: int = 24 * 7
    cookie_secure: bool | None = None
    cookie_domain: str | None = None
    cookie_samesite: str = "lax"
    frontend_origin: str = "http://localhost:3000"
    allowed_hosts: str = "localhost,127.0.0.1,testserver"
    # Explicit opt-in escape hatch for ephemeral preview/tunnel hosts. Never enable in production.
    trust_all_hosts: bool = False
    expose_dev_tokens: bool | None = None
    require_email_verification: bool = False
    password_min_length: int = 10
    max_request_bytes: int = 2 * 1024 * 1024

    # Database
    database_url: str = "sqlite:///./careerpilot.db"
    auto_create_schema: bool = True
    db_echo: bool = False

    # File storage
    media_root: Path = DEFAULT_MEDIA_ROOT
    max_upload_mb: int = 10
    export_link_ttl_seconds: int = 300

    # Email (SMTP). When unset, emails are logged in development and never claimed to be sent.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = True
    email_from: str = "CareerPilot AI <no-reply@careerpilot.local>"

    # Background worker
    enable_inline_worker: bool = True
    task_poll_seconds: float = 1.5
    task_max_attempts: int = 3
    reminder_scan_seconds: int = 300

    # AI
    ai_timeout_seconds: float = 60.0
    ai_max_retries: int = 2
    ai_daily_output_token_limit: int = 100_000
    ai_request_timeout_cap: float = 180.0
    ai_allow_private_endpoints: bool = False
    ai_pricing_json: str = "{}"

    # Rate limiting
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 180
    login_rate_limit_per_minute: int = 10

    # Outbound job fetching
    job_fetch_timeout_seconds: float = 12.0
    job_fetch_max_bytes: int = 2_000_000
    job_fetch_allow_private_hosts: bool = False
    job_discovery_user_agent: str = "CareerPilotAI/1.0 (+job-import; contact: support@careerpilot.local)"

    log_level: str = "INFO"

    @field_validator("secret_key")
    @classmethod
    def _secret_strength(cls, v: str) -> str:
        if len(v) < 16:
            raise ValueError("CP_SECRET_KEY must be at least 16 characters")
        return v

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    @property
    def secure_cookies(self) -> bool:
        if self.cookie_secure is not None:
            return self.cookie_secure
        return self.is_production

    @property
    def dev_tokens_enabled(self) -> bool:
        if self.expose_dev_tokens is not None:
            return self.expose_dev_tokens
        return not self.is_production

    @property
    def host_list(self) -> list[str]:
        return [h.strip() for h in self.allowed_hosts.split(",") if h.strip()]

    @property
    def effective_allowed_hosts(self) -> list[str]:
        """Host allowlist for TrustedHostMiddleware.

        ``*`` is an allow-everything wildcard, so it is only honoured when the operator
        explicitly sets ``CP_TRUST_ALL_HOSTS=true``. In production a stray ``*`` is a
        startup error rather than a silent hole; in development it is dropped with a
        warning.
        """
        hosts = self.host_list
        if "*" not in hosts:
            return hosts or ["localhost", "127.0.0.1"]
        if self.trust_all_hosts:
            return ["*"]
        cleaned = [host for host in hosts if host != "*"]
        if self.is_production:
            raise RuntimeError(
                "CP_ALLOWED_HOSTS contains '*' in production. List explicit hostnames, or set "
                "CP_TRUST_ALL_HOSTS=true only if you deliberately accept any Host header."
            )
        import logging

        logging.getLogger("careerpilot.config").warning(
            "ignoring '*' in CP_ALLOWED_HOSTS (set CP_TRUST_ALL_HOSTS=true to allow any host)")
        return cleaned or ["localhost", "127.0.0.1"]

    @property
    def email_configured(self) -> bool:
        return bool(self.smtp_host)

    @property
    def encryption_key_material(self) -> str:
        return self.ai_encryption_key or self.secret_key


@lru_cache
def get_settings() -> Settings:
    return Settings()


def generate_secret() -> str:
    """Helper for operators generating a strong secret (used by scripts)."""
    return secrets.token_urlsafe(48)
