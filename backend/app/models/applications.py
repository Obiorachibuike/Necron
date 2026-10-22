"""Application tracker, timeline events, reminders and interview coach records."""
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

APPLICATION_STATUSES = (
    "saved",
    "planning",
    "documents_in_progress",
    "ready_to_apply",
    "applied",
    "assessment",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
    "closed",
)

INTERVIEW_STATUSES = ("preparing", "in_progress", "completed", "abandoned")


class Application(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "applications"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    job_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("job_listings.id", ondelete="SET NULL"), index=True
    )
    company: Mapped[str] = mapped_column(String(250), default="", nullable=False)
    role_title: Mapped[str] = mapped_column(String(250), default="", nullable=False)
    location: Mapped[str] = mapped_column(String(250), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="saved", nullable=False)
    custom_status: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    source: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    application_url: Mapped[str] = mapped_column(String(2000), default="", nullable=False)
    applied_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    deadline_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    next_action_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    next_action_note: Mapped[str] = mapped_column(String(400), default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    outcome: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    salary_expectation: Mapped[int | None] = mapped_column(Integer)
    cv_document_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="SET NULL", use_alter=True,
                              name="fk_applications_cv_document")
    )
    cover_letter_document_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="SET NULL", use_alter=True,
                              name="fk_applications_cover_document")
    )
    status_changed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    events: Mapped[list["ApplicationEvent"]] = relationship(
        back_populates="application", cascade="all, delete-orphan", passive_deletes=True,
        order_by="ApplicationEvent.occurred_at",
    )
    reminders: Mapped[list["Reminder"]] = relationship(
        back_populates="application", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (
        Index("ix_applications_user_status", "user_id", "status"),
        Index("ix_applications_user_updated", "user_id", "updated_at"),
    )


class ApplicationEvent(Base, UUIDPrimaryKey):
    __tablename__ = "application_events"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    application_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="CASCADE"), index=True, nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(40), default="status_change", nullable=False)
    from_status: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    to_status: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)

    application: Mapped[Application] = relationship(back_populates="events")


class Reminder(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "reminders"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    application_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40), default="follow_up", nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    due_at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    notified_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    application: Mapped[Application | None] = relationship(back_populates="reminders")

    __table_args__ = (Index("ix_reminders_user_due", "user_id", "due_at"),)


class InterviewSession(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "interview_sessions"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    job_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("job_listings.id", ondelete="SET NULL"), index=True
    )
    application_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    mode: Mapped[str] = mapped_column(String(30), default="question_bank", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="preparing", nullable=False)
    questions_source: Mapped[str] = mapped_column(String(40), default="deterministic", nullable=False)
    current_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    overall_score: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    questions: Mapped[list["InterviewQuestion"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", passive_deletes=True,
        order_by="InterviewQuestion.sort_order",
    )


class InterviewQuestion(Base, UUIDPrimaryKey):
    __tablename__ = "interview_questions"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    category: Mapped[str] = mapped_column(String(60), default="behavioral", nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    guidance: Mapped[str] = mapped_column(Text, default="", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    session: Mapped[InterviewSession] = relationship(back_populates="questions")
    answer: Mapped["InterviewAnswer | None"] = relationship(
        back_populates="question", uselist=False, cascade="all, delete-orphan", passive_deletes=True
    )


class InterviewAnswer(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "interview_answers"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    question_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("interview_questions.id", ondelete="CASCADE"),
        unique=True, nullable=False
    )
    answer_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    feedback: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    score: Mapped[float | None] = mapped_column(Float)
    evaluator: Mapped[str] = mapped_column(String(40), default="deterministic", nullable=False)
    follow_up: Mapped[str] = mapped_column(Text, default="", nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    question: Mapped[InterviewQuestion] = relationship(back_populates="answer")


class InterviewNote(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "interview_notes"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    session_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(250), default="", nullable=False)
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)
    company: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    interview_date: Mapped[datetime | None] = mapped_column(UTCDateTime())


class InsightDismissal(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "insight_dismissals"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    insight_key: Mapped[str] = mapped_column(String(200), nullable=False)
    dismissed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
