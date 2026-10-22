"""Application tracker, timeline, reminders and interview schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator, model_validator

from app.schemas.common import AppSchema, ORMModel, OutSchema, validate_http_url

STATUSES = {
    "saved", "planning", "documents_in_progress", "ready_to_apply", "applied",
    "assessment", "interview", "offer", "rejected", "withdrawn", "closed",
}


class ApplicationIn(AppSchema):
    job_id: str | None = Field(None, max_length=36)
    company: str = Field("", max_length=250)
    role_title: str = Field("", max_length=250)
    location: str = Field("", max_length=250)
    status: str = Field("saved", max_length=40)
    source: str = Field("", max_length=120)
    application_url: str = Field("", max_length=2000)
    applied_at: datetime | None = None
    deadline_at: datetime | None = None
    next_action_at: datetime | None = None
    next_action_note: str = Field("", max_length=400)
    notes: str = Field("", max_length=20_000)
    salary_expectation: int | None = Field(None, ge=0, le=100_000_000)
    cv_document_id: str | None = Field(None, max_length=36)
    cover_letter_document_id: str | None = Field(None, max_length=36)

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        if value not in STATUSES:
            raise ValueError("Invalid application status")
        return value

    @field_validator("application_url")
    @classmethod
    def _url(cls, value: str) -> str:
        return validate_http_url(value)

    @model_validator(mode="after")
    def _identity(self):
        if not self.job_id and not (self.company.strip() and self.role_title.strip()):
            raise ValueError("Provide a company and role, or link an existing job")
        return self


class ApplicationUpdate(AppSchema):
    company: str | None = Field(None, max_length=250)
    role_title: str | None = Field(None, max_length=250)
    location: str | None = Field(None, max_length=250)
    status: str | None = None
    custom_status: str | None = Field(None, max_length=80)
    source: str | None = Field(None, max_length=120)
    application_url: str | None = Field(None, max_length=2000)
    applied_at: datetime | None = None
    deadline_at: datetime | None = None
    next_action_at: datetime | None = None
    next_action_note: str | None = Field(None, max_length=400)
    notes: str | None = Field(None, max_length=20_000)
    outcome: str | None = Field(None, max_length=60)
    salary_expectation: int | None = Field(None, ge=0, le=100_000_000)
    cv_document_id: str | None = Field(None, max_length=36)
    cover_letter_document_id: str | None = Field(None, max_length=36)
    status_note: str = Field("", max_length=1000)

    @field_validator("status")
    @classmethod
    def _status(cls, value: str | None) -> str | None:
        if value is not None and value not in STATUSES:
            raise ValueError("Invalid application status")
        return value

    @field_validator("application_url")
    @classmethod
    def _url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_http_url(value)


class ApplicationEventOut(OutSchema):
    id: str
    event_type: str
    from_status: str
    to_status: str
    note: str
    occurred_at: datetime


class ReminderOut(OutSchema):
    id: str
    application_id: str | None
    kind: str
    title: str
    due_at: datetime
    completed_at: datetime | None
    notified_at: datetime | None
    notes: str
    created_at: datetime
    overdue: bool = False


class ApplicationOut(OutSchema):
    id: str
    job_id: str | None
    company: str
    role_title: str
    location: str
    status: str
    custom_status: str
    source: str
    application_url: str
    applied_at: datetime | None
    deadline_at: datetime | None
    next_action_at: datetime | None
    next_action_note: str
    notes: str
    outcome: str
    salary_expectation: int | None
    cv_document_id: str | None
    cover_letter_document_id: str | None
    status_changed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    reminder_count: int = 0
    next_reminder_at: datetime | None = None
    overdue: bool = False


class ApplicationDetailOut(ApplicationOut):
    events: list[ApplicationEventOut] = Field(default_factory=list)
    reminders: list[ReminderOut] = Field(default_factory=list)


class StatusChangeRequest(AppSchema):
    status: str
    note: str = Field("", max_length=1000)

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        if value not in STATUSES:
            raise ValueError("Invalid application status")
        return value


class ReminderIn(AppSchema):
    application_id: str | None = Field(None, max_length=36)
    kind: str = Field("follow_up", max_length=40)
    title: str = Field(min_length=1, max_length=300)
    due_at: datetime
    notes: str = Field("", max_length=4000)

    @field_validator("kind")
    @classmethod
    def _kind(cls, value: str) -> str:
        if value not in {"deadline", "interview", "assessment", "follow_up", "custom"}:
            raise ValueError("Invalid reminder type")
        return value


class ReminderUpdate(AppSchema):
    title: str | None = Field(None, max_length=300)
    due_at: datetime | None = None
    notes: str | None = Field(None, max_length=4000)
    completed: bool | None = None


class ApplicationStats(AppSchema):
    total: int
    by_status: dict
    active: int
    interviews: int
    offers: int
    responses: int
    response_rate: float | None
    upcoming: list[ApplicationOut]
    weekly_activity: list[dict]
    source_breakdown: list[dict]


class InterviewQuestionOut(OutSchema):
    id: str
    category: str
    question: str
    guidance: str
    sort_order: int
    has_answer: bool = False


class InterviewAnswerOut(OutSchema):
    id: str
    question_id: str
    answer_text: str
    feedback: dict
    score: float | None
    evaluator: str
    follow_up: str
    submitted_at: datetime | None


class InterviewSessionIn(AppSchema):
    job_id: str | None = Field(None, max_length=36)
    application_id: str | None = Field(None, max_length=36)
    title: str = Field("", max_length=300)
    question_count: int = Field(10, ge=3, le=25)
    categories: list[str] = Field(default_factory=list, max_length=10)
    use_ai: bool = True


class InterviewSessionOut(OutSchema):
    id: str
    job_id: str | None
    application_id: str | None
    title: str
    mode: str
    status: str
    questions_source: str
    current_index: int
    summary: str
    overall_score: float | None
    notes: str
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    question_count: int = 0
    answered_count: int = 0


class InterviewSessionDetailOut(InterviewSessionOut):
    questions: list[InterviewQuestionOut] = Field(default_factory=list)
    answers: list[InterviewAnswerOut] = Field(default_factory=list)


class AnswerIn(AppSchema):
    question_id: str = Field(min_length=1, max_length=36)
    answer_text: str = Field(min_length=1, max_length=12_000)


class AnswerFeedback(AppSchema):
    answer: InterviewAnswerOut
    session_progress: dict


class FollowUpIn(AppSchema):
    question_id: str = Field(min_length=1, max_length=36)
    use_ai: bool = True


class FollowUpOut(AppSchema):
    follow_up: str


class SessionNoteIn(AppSchema):
    notes: str = Field("", max_length=20_000)


class InterviewSummaryOut(AppSchema):
    session: InterviewSessionDetailOut
    strengths: list[str]
    improvements: list[str]
    next_steps: list[str]
    average_score: float | None
