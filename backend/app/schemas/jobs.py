"""Job discovery, import, matching and saved-search schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator, model_validator

from app.core.errors import ValidationAppError
from app.core.net import validate_public_url
from app.schemas.common import AppSchema, ORMModel, OutSchema, validate_http_url


class JobListingIn(AppSchema):
    title: str = Field(min_length=1, max_length=250)
    company: str = Field("", max_length=250)
    location: str = Field("", max_length=250)
    work_arrangement: str = Field("unknown", max_length=20)
    employment_type: str = Field("unknown", max_length=40)
    experience_level: str = Field("unknown", max_length=40)
    description: str = Field("", max_length=60_000)
    requirements: list[str] = Field(default_factory=list, max_length=60)
    responsibilities: list[str] = Field(default_factory=list, max_length=60)
    skills: list[str] = Field(default_factory=list, max_length=80)
    technologies: list[str] = Field(default_factory=list, max_length=80)
    industry: str = Field("", max_length=120)
    salary_min: int | None = Field(None, ge=0, le=100_000_000)
    salary_max: int | None = Field(None, ge=0, le=100_000_000)
    salary_currency: str = Field("", max_length=8)
    salary_period: str = Field("annual", max_length=20)
    visa_sponsorship: bool | None = None
    relocation_support: bool | None = None
    source_url: str = Field("", max_length=2000)
    apply_url: str = Field("", max_length=2000)
    posted_at: datetime | None = None
    is_saved: bool = True

    @field_validator("work_arrangement")
    @classmethod
    def _arrangement(cls, value: str) -> str:
        allowed = {"remote", "hybrid", "onsite", "unknown"}
        if value not in allowed:
            raise ValueError("Work arrangement must be remote, hybrid, onsite or unknown")
        return value

    @field_validator("source_url", "apply_url")
    @classmethod
    def _urls(cls, value: str) -> str:
        value = validate_http_url(value)
        if not value:
            return value
        # Listings are rendered as clickable links and may later be re-fetched, so they must
        # point at public web destinations exactly like an imported URL would.
        try:
            return validate_public_url(value)
        except ValidationAppError as exc:
            raise ValueError(exc.message) from exc

    @field_validator("requirements", "responsibilities", "skills", "technologies")
    @classmethod
    def _lists(cls, value: list[str]) -> list[str]:
        return [v.strip()[:300] for v in value if v and v.strip()][:80]

    @model_validator(mode="after")
    def _salary(self):
        if self.salary_min is not None and self.salary_max is not None and self.salary_max < self.salary_min:
            raise ValueError("Maximum salary must be at least the minimum")
        return self


class JobListingOut(OutSchema):
    id: str
    provider: str
    company: str
    title: str
    location: str
    work_arrangement: str
    employment_type: str
    experience_level: str
    description: str
    requirements: list
    responsibilities: list
    skills: list
    technologies: list
    industry: str
    salary_min: int | None
    salary_max: int | None
    salary_currency: str
    salary_period: str
    visa_sponsorship: bool | None
    relocation_support: bool | None
    source_url: str
    apply_url: str
    posted_at: datetime | None
    first_seen_at: datetime | None
    last_verified_at: datetime | None
    listing_status: str
    is_saved: bool
    created_at: datetime
    updated_at: datetime
    match_score: float | None = None
    match_category: str | None = None
    has_match: bool = False
    has_application: bool = False
    source_name: str = ""


class JobBreakdownItem(AppSchema):
    category: str
    label: str
    weight: float
    score: float | None
    status: str
    evidence: list[str] = Field(default_factory=list)
    detail: str = ""


class JobMatchOut(OutSchema):
    id: str
    job_id: str
    overall_score: float
    category: str
    breakdown: list
    strong_matches: list
    partial_matches: list
    missing_requirements: list
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    disqualifiers: list
    unknowns: list
    suggestions: list
    explanation: str
    method: str
    ai_enhanced: bool
    model_used: str
    created_at: datetime
    updated_at: datetime


class JobDetailOut(JobListingOut):
    match: JobMatchOut | None = None
    application_id: str | None = None


class JobSourceIn(AppSchema):
    provider: str = Field(min_length=1, max_length=40)
    board_token: str = Field(min_length=1, max_length=200)
    company_name: str = Field("", max_length=200)
    display_name: str = Field("", max_length=250)

    @field_validator("provider")
    @classmethod
    def _provider(cls, value: str) -> str:
        if value not in {"greenhouse", "lever", "manual", "url"}:
            raise ValueError("Unsupported provider")
        return value

    @field_validator("board_token")
    @classmethod
    def _token(cls, value: str) -> str:
        cleaned = value.strip().strip("/")
        if not cleaned.replace("-", "").replace("_", "").replace(".", "").isalnum():
            raise ValueError("Board token may contain letters, numbers, dots, dashes and underscores")
        return cleaned


class JobSourceOut(OutSchema):
    id: str
    provider: str
    board_token: str
    company_name: str
    display_name: str
    is_global: bool
    enabled: bool
    health_status: str
    health_message: str
    last_checked_at: datetime | None
    last_items_count: int
    created_at: datetime
    updated_at: datetime


class ProviderInfo(AppSchema):
    provider: str
    label: str
    supports_search: bool
    supports_board: bool
    requires_token: bool
    notes: str
    documented: bool = True


class DiscoverRequest(AppSchema):
    search_id: str | None = None
    keywords: str = Field("", max_length=300)
    title: str = Field("", max_length=200)
    company: str = Field("", max_length=200)
    location: str = Field("", max_length=200)
    work_arrangements: list[str] = Field(default_factory=list, max_length=5)
    employment_types: list[str] = Field(default_factory=list, max_length=10)
    providers: list[str] = Field(default_factory=list, max_length=10)
    source_ids: list[str] = Field(default_factory=list, max_length=20)
    max_results: int = Field(50, ge=1, le=200)
    posted_within_days: int | None = Field(None, ge=1, le=90)
    remote_only: bool = False


class DiscoveryRunOut(AppSchema):
    task_id: str
    status: str
    message: str
    queued: bool = True


class DiscoveryRunResult(AppSchema):
    found: int
    created: int
    duplicates: int
    scored: int
    sources_used: list[str]
    source_errors: list[dict]
    message: str


class JobImportRequest(AppSchema):
    mode: str = Field("url", max_length=20)
    url: str = Field("", max_length=2000)
    description: str = Field("", max_length=60_000)
    title: str = Field("", max_length=250)
    company: str = Field("", max_length=250)
    analyze: bool = True
    save: bool = False

    @model_validator(mode="after")
    def _mode(self):
        if self.mode not in {"url", "manual"}:
            raise ValueError("Import mode must be 'url' or 'manual'")
        if self.mode == "url":
            if not self.url:
                raise ValueError("Enter a job posting URL")
            self.url = validate_http_url(self.url, allow_empty=False)
        else:
            if len(self.description.strip()) < 40:
                raise ValueError("Paste at least a short job description (40+ characters)")
        return self


class ExtractedJob(AppSchema):
    title: str = ""
    company: str = ""
    location: str = ""
    work_arrangement: str = "unknown"
    employment_type: str = "unknown"
    experience_level: str = "unknown"
    description: str = ""
    requirements: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    salary_min: int | None = None
    salary_max: int | None = None
    salary_currency: str = ""
    salary_period: str = "annual"
    source_url: str = ""
    apply_url: str = ""
    industry: str = ""
    posted_at: datetime | None = None
    provider: str = "manual"
    provider_job_id: str = ""
    confidence: dict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class JobImportOut(AppSchema):
    import_id: str | None = None
    status: str
    message: str
    extracted: dict
    job: JobDetailOut | None = None
    requires_manual_description: bool = False
    warnings: list[str] = Field(default_factory=list)


class JobImportConfirm(AppSchema):
    extracted: ExtractedJob
    save: bool = True
    analyze: bool = True


SEARCH_WORK_ARRANGEMENTS = {"remote", "hybrid", "onsite"}
SEARCH_EMPLOYMENT_TYPES = {"full_time", "part_time", "contract", "temporary",
                           "internship", "volunteer", "other"}
SEARCH_EXPERIENCE_LEVELS = {"internship", "entry", "junior", "mid", "senior", "lead",
                            "principal", "director", "executive", "unknown"}
SEARCH_PROVIDERS = {"greenhouse", "lever", "manual", "url"}


class SavedSearchIn(AppSchema):
    name: str = Field(min_length=1, max_length=200)
    keywords: str = Field("", max_length=300)
    title: str = Field("", max_length=200)
    countries: list[str] = Field(default_factory=list, max_length=20)
    cities: list[str] = Field(default_factory=list, max_length=20)
    work_arrangements: list[str] = Field(default_factory=list, max_length=5)
    employment_types: list[str] = Field(default_factory=list, max_length=10)
    experience_levels: list[str] = Field(default_factory=list, max_length=10)
    technologies: list[str] = Field(default_factory=list, max_length=40)
    industries: list[str] = Field(default_factory=list, max_length=20)
    salary_min: int | None = Field(None, ge=0, le=100_000_000)
    posted_within_days: int | None = Field(None, ge=1, le=90)
    min_match_score: int | None = Field(None, ge=0, le=100)
    source_providers: list[str] = Field(default_factory=list, max_length=10)
    is_favorite: bool = False
    schedule_enabled: bool = False
    schedule_frequency: str = Field("daily", max_length=20)
    schedule_hour_utc: int = Field(8, ge=0, le=23)
    schedule_max_results: int = Field(50, ge=1, le=200)
    notify: bool = True

    @field_validator("work_arrangements")
    @classmethod
    def _arrangements(cls, value: list[str]) -> list[str]:
        invalid = sorted({v for v in value if v not in SEARCH_WORK_ARRANGEMENTS})
        if invalid:
            raise ValueError(f"Unknown work arrangement: {', '.join(invalid)}")
        return value

    @field_validator("employment_types")
    @classmethod
    def _employment(cls, value: list[str]) -> list[str]:
        invalid = sorted({v for v in value if v not in SEARCH_EMPLOYMENT_TYPES})
        if invalid:
            raise ValueError(f"Unknown employment type: {', '.join(invalid)}")
        return value

    @field_validator("experience_levels")
    @classmethod
    def _levels(cls, value: list[str]) -> list[str]:
        invalid = sorted({v for v in value if v not in SEARCH_EXPERIENCE_LEVELS})
        if invalid:
            raise ValueError(f"Unknown experience level: {', '.join(invalid)}")
        return value

    @field_validator("source_providers")
    @classmethod
    def _providers(cls, value: list[str]) -> list[str]:
        invalid = sorted({v for v in value if v not in SEARCH_PROVIDERS})
        if invalid:
            raise ValueError(f"Unknown source provider: {', '.join(invalid)}")
        return value

    @field_validator("schedule_frequency")
    @classmethod
    def _freq(cls, value: str) -> str:
        if value not in {"daily", "weekly", "manual"}:
            raise ValueError("Schedule frequency must be daily, weekly or manual")
        return value

    @model_validator(mode="after")
    def _schedule(self):
        if self.schedule_enabled and self.schedule_frequency == "manual":
            raise ValueError("Choose daily or weekly for an enabled schedule")
        return self


class SavedSearchOut(OutSchema):
    id: str
    name: str
    keywords: str
    title: str
    countries: list
    cities: list
    work_arrangements: list
    employment_types: list
    experience_levels: list
    technologies: list
    industries: list
    salary_min: int | None
    posted_within_days: int | None
    min_match_score: int | None
    source_providers: list
    is_favorite: bool
    schedule_enabled: bool
    schedule_frequency: str
    schedule_hour_utc: int
    schedule_max_results: int
    notify: bool
    last_run_at: datetime | None
    next_run_at: datetime | None
    last_result_count: int
    last_error: str
    created_at: datetime
    updated_at: datetime
    worker_available: bool = True


class MatchRefreshOut(AppSchema):
    job_id: str
    match: JobMatchOut
    message: str


class AnalyzedMatch(AppSchema):
    job: JobListingOut
    match: JobMatchOut
    application_strategy_available: bool = True
