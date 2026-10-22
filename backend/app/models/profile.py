"""Career knowledge base: profile, experience, education, skills, projects, etc."""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    Float,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey

PROVENANCE_VALUES = (
    "user_confirmed",
    "imported_unconfirmed",
    "document_extracted",
    "ai_suggested",
    "unverified",
    "outdated",
)


class UserProfile(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    preferred_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    professional_headline: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    phone: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    country: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    city: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    work_locations: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    portfolio_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    github_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    linkedin_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    website_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    other_links: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    career_objectives: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    include_phone_in_documents: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    include_location_in_documents: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    onboarding_data: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    completeness: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    user: Mapped["User"] = relationship(back_populates="profile")  # noqa: F821


class WorkExperience(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "work_experiences"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    employer: Mapped[str] = mapped_column(String(200), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    employment_type: Mapped[str] = mapped_column(String(60), default="full_time", nullable=False)
    location: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    is_remote: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    achievements: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    tools: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    leadership: Mapped[str] = mapped_column(Text, default="", nullable=False)
    metrics: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    provenance: Mapped[str] = mapped_column(String(40), default="user_confirmed", nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (Index("ix_work_experiences_user_sort", "user_id", "sort_order"),)


class Education(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "education_records"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    institution: Mapped[str] = mapped_column(String(250), nullable=False)
    qualification: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    field_of_study: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    location: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(40), default="completed", nullable=False)
    coursework: Mapped[str] = mapped_column(Text, default="", nullable=False)
    achievements: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    provenance: Mapped[str] = mapped_column(String(40), default="user_confirmed", nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Skill(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "skills"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(120), default="General", nullable=False)
    proficiency: Mapped[str] = mapped_column(String(40), default="intermediate", nullable=False)
    years_experience: Mapped[float | None] = mapped_column(Float)
    last_used: Mapped[date | None] = mapped_column(Date)
    evidence: Mapped[str] = mapped_column(Text, default="", nullable=False)
    supporting_projects: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    provenance: Mapped[str] = mapped_column(String(40), default="user_confirmed", nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_skills_user_name"),)


class Project(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "projects"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    problem_solved: Mapped[str] = mapped_column(Text, default="", nullable=False)
    technologies: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    responsibilities: Mapped[str] = mapped_column(Text, default="", nullable=False)
    outcomes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    repo_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    demo_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    visibility: Mapped[str] = mapped_column(String(40), default="public", nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    provenance: Mapped[str] = mapped_column(String(40), default="user_confirmed", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Certification(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "certifications"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(250), nullable=False)
    issuer: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    issue_date: Mapped[date | None] = mapped_column(Date)
    expiry_date: Mapped[date | None] = mapped_column(Date)
    credential_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    provenance: Mapped[str] = mapped_column(String(40), default="user_confirmed", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Achievement(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "achievements"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    category: Mapped[str] = mapped_column(String(60), default="award", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    date: Mapped[date | None] = mapped_column(Date)
    evidence_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    provenance: Mapped[str] = mapped_column(String(40), default="user_confirmed", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class CareerPreference(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "career_preferences"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    desired_titles: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    industries: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    countries: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    work_arrangements: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    employment_types: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    experience_level: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    salary_min: Mapped[int | None] = mapped_column(Integer)
    salary_max: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(8), default="USD", nullable=False)
    salary_period: Mapped[str] = mapped_column(String(20), default="annual", nullable=False)
    relocation: Mapped[str] = mapped_column(String(40), default="maybe", nullable=False)
    preferred_technologies: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    work_authorization: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    visa_required: Mapped[bool | None] = mapped_column(Boolean)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)


class WritingStyleProfile(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "writing_style_profiles"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    tone: Mapped[str] = mapped_column(String(30), default="professional", nullable=False)
    length_preference: Mapped[str] = mapped_column(String(30), default="balanced", nullable=False)
    confidence: Mapped[str] = mapped_column(String(30), default="confident", nullable=False)
    technicality: Mapped[str] = mapped_column(String(30), default="technical", nullable=False)
    directness: Mapped[str] = mapped_column(String(30), default="direct", nullable=False)
    cv_style: Mapped[str] = mapped_column(String(40), default="ats", nullable=False)
    cover_letter_length: Mapped[str] = mapped_column(String(30), default="standard", nullable=False)
    avoid_words: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    writing_samples: Mapped[str] = mapped_column(Text, default="", nullable=False)
    sample_permission: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ProfileCorrection(Base, UUIDPrimaryKey, TimestampMixin):
    """Audit trail of user corrections to AI/imported content."""

    __tablename__ = "profile_corrections"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(36))
    field: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    previous_value: Mapped[str] = mapped_column(Text, default="", nullable=False)
    new_value: Mapped[str] = mapped_column(Text, default="", nullable=False)
    reason: Mapped[str] = mapped_column(Text, default="", nullable=False)


class OnboardingDraft(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "onboarding_drafts"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    step: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    data: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    cv_import: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
