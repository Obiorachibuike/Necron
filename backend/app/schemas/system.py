"""AI provider settings, usage, background tasks, notifications, insights, privacy."""
from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.common import AppSchema, ORMModel, OutSchema, validate_http_url

PROVIDERS = {"openai_compatible", "ollama", "openai"}


class ProviderConfigIn(AppSchema):
    label: str = Field("My AI provider", max_length=120)
    provider: str = Field("openai_compatible", max_length=40)
    base_url: str = Field("https://api.openai.com/v1", max_length=500)
    model: str = Field("gpt-4o-mini", max_length=160)
    api_key: str | None = Field(None, max_length=400)
    temperature: float = Field(0.3, ge=0, le=2)
    max_output_tokens: int = Field(1200, ge=64, le=8000)
    timeout_seconds: float = Field(60, ge=5, le=180)
    max_retries: int = Field(2, ge=0, le=4)
    task_models: dict = Field(default_factory=dict)
    fallback_model: str = Field("", max_length=160)
    monthly_usage_limit_tokens: int | None = Field(None, ge=1000, le=50_000_000)
    is_active: bool = True
    disclosure_accepted: bool = False

    @field_validator("provider")
    @classmethod
    def _provider(cls, value: str) -> str:
        if value not in PROVIDERS:
            raise ValueError("Unsupported AI provider")
        return value

    @field_validator("base_url")
    @classmethod
    def _url(cls, value: str) -> str:
        value = validate_http_url(value, allow_empty=False).rstrip("/")
        return value

    @field_validator("task_models")
    @classmethod
    def _tasks(cls, value: dict) -> dict:
        allowed = {"strategy", "cv", "cover_letter", "review", "revision", "interview",
                   "answer_feedback", "extraction", "match_explanation"}
        cleaned: dict[str, str] = {}
        for key, model in list(value.items())[:20]:
            if key in allowed and isinstance(model, str) and model.strip():
                cleaned[key] = model.strip()[:160]
        return cleaned


class ProviderConfigOut(OutSchema):
    id: str
    label: str
    provider: str
    base_url: str
    model: str
    has_api_key: bool
    api_key_hint: str
    is_active: bool
    local_endpoint: bool
    temperature: float
    max_output_tokens: int
    timeout_seconds: float
    max_retries: int
    task_models: dict
    fallback_model: str
    monthly_usage_limit_tokens: int | None
    last_test_status: str
    last_test_message: str
    last_tested_at: datetime | None
    disclosure_accepted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProviderTestRequest(AppSchema):
    config_id: str | None = Field(None, max_length=36)
    provider: str = Field("openai_compatible", max_length=40)
    base_url: str = Field("https://api.openai.com/v1", max_length=500)
    model: str = Field("gpt-4o-mini", max_length=160)
    api_key: str | None = Field(None, max_length=400)
    timeout_seconds: float = Field(30, ge=5, le=120)


class ProviderTestOut(AppSchema):
    ok: bool
    status: str
    message: str
    latency_ms: int = 0
    endpoint_kind: str = "cloud"
    models_available: list[str] = Field(default_factory=list)
    error_code: str = ""


class UsageRecordOut(OutSchema):
    id: str
    provider: str
    model: str
    task: str
    endpoint_kind: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    success: bool
    error_code: str
    estimated_cost_usd: float | None
    created_at: datetime


class UsageSummary(AppSchema):
    period_days: int
    requests: int
    successes: int
    failures: int
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float | None
    cost_note: str
    by_task: list[dict]
    by_day: list[dict]
    configured: bool
    provider_label: str = ""
    endpoint_kind: str = ""
    usage_limit_tokens: int | None = None
    recent: list[UsageRecordOut] = Field(default_factory=list)


class AIStatusOut(AppSchema):
    configured: bool
    provider: str = ""
    provider_label: str = ""
    model: str = ""
    endpoint_kind: str = ""
    local_endpoint: bool = False
    last_test_status: str = ""
    last_test_message: str = ""
    usage_limit_reached: bool = False
    daily_tokens_used: int = 0
    daily_token_limit: int = 0
    note: str = ""


class BackgroundTaskOut(OutSchema):
    id: str
    task_type: str
    title: str
    status: str
    progress: int | None
    progress_note: str
    error: str
    attempts: int
    max_attempts: int
    queued_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    result: dict
    cancel_requested: bool = False
    payload_summary: dict = Field(default_factory=dict)


class WorkerStatusOut(AppSchema):
    inline_worker_enabled: bool
    active_workers: int
    queued_tasks: int
    running_tasks: int
    failed_tasks: int
    last_worker_heartbeat: datetime | None
    message: str


class NotificationOut(OutSchema):
    id: str
    kind: str
    title: str
    body: str
    link: str
    read_at: datetime | None
    created_at: datetime


class NotificationList(AppSchema):
    items: list[NotificationOut]
    unread: int


class FeedbackIn(AppSchema):
    category: str = Field("general", max_length=60)
    message: str = Field(min_length=5, max_length=5000)
    page: str = Field("", max_length=300)
    email: str = Field("", max_length=320)


class DataExportOut(AppSchema):
    generated_at: datetime
    format: str
    user: dict
    profile: dict | None
    experiences: list
    education: list
    skills: list
    projects: list
    certifications: list
    achievements: list
    preferences: dict | None
    writing_style: dict | None
    documents: list
    jobs: list
    applications: list
    interviews: list
    reminders: list
    tasks: list
    notifications: list
    ai_usage: list
    exported_counts: dict
    notes: list[str] = Field(default_factory=list)


class PrivacySummary(AppSchema):
    data_categories: list[dict]
    retention: str
    account_deletion: str
    ai_transmission: str
    export_available: bool
    email_configured: bool
    email_note: str
    storage_note: str


class DeleteAccountConfirmation(AppSchema):
    password: str = Field(min_length=1, max_length=128)
    confirm: str = Field(max_length=40)


class InsightOut(AppSchema):
    key: str
    title: str
    insight: str
    evidence: list[str]
    calculation: str
    sample_size: int
    confidence: str
    actionable: bool = False
    dismissed: bool = False


class CareerInsightsOut(AppSchema):
    generated_at: datetime
    period_days: int
    data_points: dict
    insights: list[InsightOut]
    notes: list[str]


class DashboardOut(AppSchema):
    profile_completeness: int
    profile_headline: str
    preferred_name: str
    new_matches: list[dict]
    recommended: list[dict]
    applications: dict
    upcoming_interviews: list[dict]
    deadlines: list[dict]
    recent_documents: list[dict]
    tasks: list[BackgroundTaskOut]
    quick_actions: list[dict]
    ai_configured: bool
    onboarding_completed: bool
    has_data: bool
    unread_notifications: int
    worker_available: bool


class DashboardSparkPoint(AppSchema):
    date: str
    applications: int
    documents: int
    matches: int
