"""Job sources, listings, saved searches, matches and imported descriptions."""
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
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey


class JobSource(Base, UUIDPrimaryKey, TimestampMixin):
    """A discovery provider, either a platform provider or a user (or global) board."""

    __tablename__ = "job_sources"

    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(40), nullable=False)  # greenhouse | lever | manual | url
    board_token: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    company_name: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    display_name: Mapped[str] = mapped_column(String(250), default="", nullable=False)
    is_global: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    health_status: Mapped[str] = mapped_column(String(30), default="unknown", nullable=False)
    health_message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    last_checked_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    last_items_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "provider", "board_token", name="uq_job_sources_user_provider_board"),
        Index("ix_job_sources_global", "is_global", "enabled"),
    )


class JobListing(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "job_listings"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    source_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("job_sources.id", ondelete="SET NULL"), index=True
    )
    provider: Mapped[str] = mapped_column(String(40), default="manual", nullable=False)
    provider_job_id: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    company: Mapped[str] = mapped_column(String(250), default="", nullable=False)
    title: Mapped[str] = mapped_column(String(250), default="", nullable=False)
    location: Mapped[str] = mapped_column(String(250), default="", nullable=False)
    work_arrangement: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)
    employment_type: Mapped[str] = mapped_column(String(40), default="unknown", nullable=False)
    experience_level: Mapped[str] = mapped_column(String(40), default="unknown", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    requirements: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    responsibilities: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    skills: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    technologies: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    industry: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    salary_min: Mapped[int | None] = mapped_column(Integer)
    salary_max: Mapped[int | None] = mapped_column(Integer)
    salary_currency: Mapped[str] = mapped_column(String(8), default="", nullable=False)
    salary_period: Mapped[str] = mapped_column(String(20), default="annual", nullable=False)
    visa_sponsorship: Mapped[bool | None] = mapped_column(Boolean)
    relocation_support: Mapped[bool | None] = mapped_column(Boolean)
    source_url: Mapped[str] = mapped_column(String(2000), default="", nullable=False)
    apply_url: Mapped[str] = mapped_column(String(2000), default="", nullable=False)
    url_normalized: Mapped[str] = mapped_column(String(2048), default="", index=True, nullable=False)
    dedupe_hash: Mapped[str] = mapped_column(String(64), default="", index=True, nullable=False)
    posted_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    first_seen_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    last_verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    listing_status: Mapped[str] = mapped_column(String(30), default="not_recently_verified", nullable=False)
    is_saved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    raw_metadata: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)

    source: Mapped[JobSource | None] = relationship()
    matches: Mapped[list["JobMatch"]] = relationship(
        back_populates="job", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (
        Index("ix_job_listings_user_created", "user_id", "created_at"),
        Index("ix_job_listings_user_status", "user_id", "listing_status"),
        UniqueConstraint("user_id", "dedupe_hash", name="uq_job_listings_user_dedupe"),
    )


class JobMatch(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "job_matches"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("job_listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    overall_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    category: Mapped[str] = mapped_column(String(30), default="low_match", nullable=False)
    breakdown: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    strong_matches: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    partial_matches: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    missing_requirements: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    matched_skills: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    missing_skills: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    disqualifiers: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    unknowns: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    suggestions: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, default="", nullable=False)
    method: Mapped[str] = mapped_column(String(60), default="deterministic_v1", nullable=False)
    ai_enhanced: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    model_used: Mapped[str] = mapped_column(String(120), default="", nullable=False)

    job: Mapped[JobListing] = relationship(back_populates="matches")

    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_job_matches_user_job"),)


class JobSearch(Base, UUIDPrimaryKey, TimestampMixin):
    """Saved search plus optional recurring discovery schedule."""

    __tablename__ = "job_searches"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    keywords: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    title: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    countries: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    cities: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    work_arrangements: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    employment_types: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    experience_levels: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    technologies: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    industries: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    salary_min: Mapped[int | None] = mapped_column(Integer)
    posted_within_days: Mapped[int | None] = mapped_column(Integer)
    min_match_score: Mapped[int | None] = mapped_column(Integer)
    source_providers: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    schedule_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    schedule_frequency: Mapped[str] = mapped_column(String(20), default="daily", nullable=False)
    schedule_hour_utc: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    schedule_max_results: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    notify: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    next_run_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), index=True)
    last_result_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str] = mapped_column(Text, default="", nullable=False)


class JobImport(Base, UUIDPrimaryKey, TimestampMixin):
    """Raw import attempts (URL fetch or pasted text) retained for auditability."""

    __tablename__ = "job_imports"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    source_url: Mapped[str] = mapped_column(String(2000), default="", nullable=False)
    mode: Mapped[str] = mapped_column(String(20), default="url", nullable=False)  # url | manual | provider
    fetcher: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False)
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    extracted: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    raw_excerpt: Mapped[str] = mapped_column(Text, default="", nullable=False)
    job_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("job_listings.id", ondelete="SET NULL")
    )
