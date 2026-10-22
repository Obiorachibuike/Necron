"""AI configuration and usage, background tasks, notifications, feedback."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey


class AIProviderConfiguration(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "ai_provider_configurations"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    label: Mapped[str] = mapped_column(String(120), default="Default provider", nullable=False)
    provider: Mapped[str] = mapped_column(String(40), default="openai_compatible", nullable=False)
    base_url: Mapped[str] = mapped_column(String(500), default="https://api.openai.com/v1", nullable=False)
    model: Mapped[str] = mapped_column(String(160), default="gpt-4o-mini", nullable=False)
    api_key_ciphertext: Mapped[str | None] = mapped_column(Text)
    api_key_hint: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    local_endpoint: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    temperature: Mapped[float] = mapped_column(Float, default=0.3, nullable=False)
    max_output_tokens: Mapped[int] = mapped_column(Integer, default=1200, nullable=False)
    timeout_seconds: Mapped[float] = mapped_column(Float, default=60.0, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    task_models: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    fallback_model: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    monthly_usage_limit_tokens: Mapped[int | None] = mapped_column(Integer)
    last_test_status: Mapped[str] = mapped_column(String(30), default="untested", nullable=False)
    last_test_message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    last_tested_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    disclosure_accepted_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    __table_args__ = (Index("ix_ai_provider_configs_user_active", "user_id", "is_active"),)


class AIUsageRecord(Base, UUIDPrimaryKey):
    __tablename__ = "ai_usage_records"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    configuration_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("ai_provider_configurations.id", ondelete="SET NULL"), index=True
    )
    provider: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    model: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    task: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    endpoint_kind: Mapped[str] = mapped_column(String(20), default="cloud", nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    error_code: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    estimated_cost_usd: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)


class BackgroundTask(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "background_tasks"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    task_type: Mapped[str] = mapped_column(String(60), nullable=False)
    title: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="queued", nullable=False)
    progress: Mapped[int | None] = mapped_column(Integer)
    progress_note: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    payload: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    result: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    error: Mapped[str] = mapped_column(Text, default="", nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    queued_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    cancel_requested_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    worker_id: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(200), default="", nullable=False)

    __table_args__ = (
        Index("ix_background_tasks_status_queued", "status", "queued_at"),
        Index("ix_background_tasks_user_created", "user_id", "created_at"),
    )


class Notification(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "notifications"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(60), default="info", nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)
    link: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    email_sent_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    __table_args__ = (Index("ix_notifications_user_read", "user_id", "read_at"),)


class UserFeedback(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "user_feedback"

    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    email: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    category: Mapped[str] = mapped_column(String(60), default="general", nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    page: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="open", nullable=False)


__all__ = [
    "AIProviderConfiguration",
    "AIUsageRecord",
    "BackgroundTask",
    "Notification",
    "UserFeedback",
    "WorkerHeartbeat",
]


class WorkerHeartbeat(Base, UUIDPrimaryKey):
    """Lets the API report honestly whether a worker is actually running."""

    __tablename__ = "worker_heartbeats"

    worker_id: Mapped[str] = mapped_column(String(80), nullable=False)
    mode: Mapped[str] = mapped_column(String(30), default="inline", nullable=False)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True, nullable=False)
