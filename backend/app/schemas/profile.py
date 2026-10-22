"""Career knowledge base schemas."""
from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime

from pydantic import Field, field_validator, model_validator

from app.schemas.common import (
    AppSchema,
    DateRangeMixin,
    ORMModel,
    OutSchema,
    ProfileLinkMixin,
    validate_http_url,
)

PROVENANCE = {"user_confirmed", "imported_unconfirmed", "document_extracted",
              "ai_suggested", "unverified", "outdated"}
WORK_ARRANGEMENTS = {"remote", "hybrid", "onsite"}
PROFICIENCY = {"beginner", "intermediate", "advanced", "expert", "unspecified"}


class OptionalHttpUrl(str):
    pass


class ProfileBase(ProfileLinkMixin):
    preferred_name: str = Field("", max_length=120)
    professional_headline: str = Field("", max_length=200)
    summary: str = Field("", max_length=4000)
    phone: str = Field("", max_length=60)
    country: str = Field("", max_length=120)
    city: str = Field("", max_length=120)
    work_locations: list[str] = Field(default_factory=list, max_length=20)
    other_links: list[dict] = Field(default_factory=list, max_length=20)
    career_objectives: list[str] = Field(default_factory=list, max_length=20)
    include_phone_in_documents: bool = True
    include_location_in_documents: bool = True


class ProfileUpdate(ProfileBase):
    @field_validator("work_locations")
    @classmethod
    def _locs(cls, value: list[str]) -> list[str]:
        return [v.strip()[:120] for v in value if v and v.strip()][:20]

    @field_validator("other_links")
    @classmethod
    def _links(cls, value: list[dict]) -> list[dict]:
        cleaned = []
        for item in value[:20]:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label", ""))[:120]
            url = validate_http_url(str(item.get("url", "")))
            if url:
                cleaned.append({"label": label, "url": url})
        return cleaned

    @field_validator("career_objectives")
    @classmethod
    def _objectives(cls, value: list[str]) -> list[str]:
        return [v.strip()[:80] for v in value if v and v.strip()][:20]


class ProfileOut(OutSchema):
    id: str
    preferred_name: str
    professional_headline: str
    summary: str
    phone: str
    country: str
    city: str
    work_locations: list
    portfolio_url: str
    github_url: str
    linkedin_url: str
    website_url: str
    other_links: list
    career_objectives: list
    include_phone_in_documents: bool
    include_location_in_documents: bool
    completeness: int
    created_at: datetime
    updated_at: datetime


class ExperienceIn(DateRangeMixin):
    employer: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    employment_type: str = Field("full_time", max_length=60)
    location: str = Field("", max_length=200)
    is_remote: bool = False
    description: str = Field("", max_length=8000)
    achievements: list[str] = Field(default_factory=list, max_length=30)
    tools: list[str] = Field(default_factory=list, max_length=50)
    leadership: str = Field("", max_length=4000)
    metrics: list[str] = Field(default_factory=list, max_length=30)
    provenance: str = "user_confirmed"
    verified: bool = True

    @field_validator("achievements", "metrics")
    @classmethod
    def _bullets(cls, value: list[str]) -> list[str]:
        return [v.strip()[:500] for v in value if v and v.strip()][:30]

    @field_validator("tools")
    @classmethod
    def _tools(cls, value: list[str]) -> list[str]:
        return [v.strip()[:80] for v in value if v and v.strip()][:50]

    @field_validator("provenance")
    @classmethod
    def _prov(cls, value: str) -> str:
        if value not in PROVENANCE:
            raise ValueError("Invalid provenance value")
        return value

    @model_validator(mode="after")
    def _current(self):
        if self.is_current and self.end_date:
            raise ValueError("A current role cannot have an end date")
        return self


class ExperienceOut(OutSchema):
    id: str
    employer: str
    title: str
    employment_type: str
    location: str
    is_remote: bool
    start_date: date_cls | None
    end_date: date_cls | None
    is_current: bool
    description: str
    achievements: list
    tools: list
    leadership: str
    metrics: list
    provenance: str
    verified: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class EducationIn(DateRangeMixin):
    institution: str = Field(min_length=1, max_length=250)
    qualification: str = Field("", max_length=200)
    field_of_study: str = Field("", max_length=200)
    location: str = Field("", max_length=200)
    status: str = Field("completed", max_length=40)
    coursework: str = Field("", max_length=4000)
    achievements: list[str] = Field(default_factory=list, max_length=20)
    notes: str = Field("", max_length=4000)
    provenance: str = "user_confirmed"
    verified: bool = True


class EducationOut(OutSchema):
    id: str
    institution: str
    qualification: str
    field_of_study: str
    location: str
    start_date: date_cls | None
    end_date: date_cls | None
    status: str
    coursework: str
    achievements: list
    notes: str
    provenance: str
    verified: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class SkillIn(AppSchema):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field("General", max_length=120)
    proficiency: str = Field("intermediate", max_length=40)
    years_experience: float | None = Field(None, ge=0, le=60)
    last_used: date_cls | None = None
    evidence: str = Field("", max_length=2000)
    supporting_projects: list[str] = Field(default_factory=list, max_length=20)
    verified: bool = True
    provenance: str = "user_confirmed"

    @field_validator("proficiency")
    @classmethod
    def _prof(cls, value: str) -> str:
        if value not in PROFICIENCY:
            raise ValueError("Choose a valid proficiency level")
        return value

    @model_validator(mode="after")
    def _evidence_rules(self):
        if self.proficiency == "expert" and not self.evidence.strip():
            raise ValueError("Expert proficiency requires supporting evidence")
        if self.last_used and self.last_used > date_cls.today():
            raise ValueError("Last used date cannot be in the future")
        return self


class SkillOut(OutSchema):
    id: str
    name: str
    category: str
    proficiency: str
    years_experience: float | None
    last_used: date_cls | None
    evidence: str
    supporting_projects: list
    verified: bool
    provenance: str
    created_at: datetime
    updated_at: datetime


class ProjectIn(DateRangeMixin):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field("", max_length=6000)
    problem_solved: str = Field("", max_length=3000)
    technologies: list[str] = Field(default_factory=list, max_length=50)
    responsibilities: str = Field("", max_length=4000)
    outcomes: str = Field("", max_length=3000)
    repo_url: str = Field("", max_length=2000)
    demo_url: str = Field("", max_length=2000)
    visibility: str = Field("public", max_length=40)
    verified: bool = True
    provenance: str = "user_confirmed"

    @field_validator("repo_url", "demo_url")
    @classmethod
    def _urls(cls, value: str) -> str:
        return validate_http_url(value)

    @field_validator("technologies")
    @classmethod
    def _tech(cls, value: list[str]) -> list[str]:
        return [v.strip()[:80] for v in value if v and v.strip()][:50]


class ProjectOut(OutSchema):
    id: str
    name: str
    description: str
    problem_solved: str
    technologies: list
    responsibilities: str
    outcomes: str
    repo_url: str
    demo_url: str
    visibility: str
    start_date: date_cls | None
    end_date: date_cls | None
    verified: bool
    provenance: str
    sort_order: int
    created_at: datetime
    updated_at: datetime


class CertificationIn(AppSchema):
    name: str = Field(min_length=1, max_length=250)
    issuer: str = Field("", max_length=200)
    issue_date: date_cls | None = None
    expiry_date: date_cls | None = None
    credential_url: str = Field("", max_length=2000)
    notes: str = Field("", max_length=2000)
    verified: bool = True
    provenance: str = "user_confirmed"

    @field_validator("credential_url")
    @classmethod
    def _url(cls, value: str) -> str:
        return validate_http_url(value)

    @model_validator(mode="after")
    def _dates(self):
        if self.issue_date and self.expiry_date and self.expiry_date < self.issue_date:
            raise ValueError("Expiry date cannot be before the issue date")
        return self


class CertificationOut(OutSchema):
    id: str
    name: str
    issuer: str
    issue_date: date_cls | None
    expiry_date: date_cls | None
    credential_url: str
    notes: str
    verified: bool
    provenance: str
    sort_order: int
    created_at: datetime
    updated_at: datetime


class AchievementIn(AppSchema):
    title: str = Field(min_length=1, max_length=250)
    category: str = Field("award", max_length=60)
    description: str = Field("", max_length=3000)
    date: date_cls | None = None
    evidence_url: str = Field("", max_length=2000)
    verified: bool = True
    provenance: str = "user_confirmed"

    @field_validator("evidence_url")
    @classmethod
    def _url(cls, value: str) -> str:
        return validate_http_url(value)


class AchievementOut(OutSchema):
    id: str
    title: str
    category: str
    description: str
    date: date_cls | None
    evidence_url: str
    verified: bool
    provenance: str
    sort_order: int
    created_at: datetime
    updated_at: datetime


class CareerPreferenceIn(AppSchema):
    desired_titles: list[str] = Field(default_factory=list, max_length=20)
    industries: list[str] = Field(default_factory=list, max_length=20)
    countries: list[str] = Field(default_factory=list, max_length=20)
    work_arrangements: list[str] = Field(default_factory=list, max_length=5)
    employment_types: list[str] = Field(default_factory=list, max_length=10)
    experience_level: str = Field("", max_length=40)
    salary_min: int | None = Field(None, ge=0, le=100_000_000)
    salary_max: int | None = Field(None, ge=0, le=100_000_000)
    currency: str = Field("USD", max_length=8)
    salary_period: str = Field("annual", max_length=20)
    relocation: str = Field("maybe", max_length=40)
    preferred_technologies: list[str] = Field(default_factory=list, max_length=40)
    work_authorization: str = Field("", max_length=200)
    visa_required: bool | None = None
    notes: str = Field("", max_length=2000)

    @field_validator("work_arrangements")
    @classmethod
    def _arrangements(cls, value: list[str]) -> list[str]:
        invalid = [v for v in value if v not in WORK_ARRANGEMENTS]
        if invalid:
            raise ValueError("Work arrangements must be remote, hybrid or onsite")
        return value

    @model_validator(mode="after")
    def _salary(self):
        if self.salary_min is not None and self.salary_max is not None and self.salary_max < self.salary_min:
            raise ValueError("Maximum salary must be at least the minimum")
        return self


class CareerPreferenceOut(OutSchema):
    id: str
    desired_titles: list
    industries: list
    countries: list
    work_arrangements: list
    employment_types: list
    experience_level: str
    salary_min: int | None
    salary_max: int | None
    currency: str
    salary_period: str
    relocation: str
    preferred_technologies: list
    work_authorization: str
    visa_required: bool | None
    notes: str
    updated_at: datetime


class WritingStyleIn(AppSchema):
    tone: str = Field("professional", max_length=30)
    length_preference: str = Field("balanced", max_length=30)
    confidence: str = Field("confident", max_length=30)
    technicality: str = Field("technical", max_length=30)
    directness: str = Field("direct", max_length=30)
    cv_style: str = Field("ats", max_length=40)
    cover_letter_length: str = Field("standard", max_length=30)
    avoid_words: list[str] = Field(default_factory=list, max_length=50)
    writing_samples: str = Field("", max_length=6000)
    sample_permission: bool = False

    @field_validator("avoid_words")
    @classmethod
    def _avoid(cls, value: list[str]) -> list[str]:
        return [v.strip()[:60] for v in value if v and v.strip()][:50]


class WritingStyleOut(OutSchema):
    id: str
    tone: str
    length_preference: str
    confidence: str
    technicality: str
    directness: str
    cv_style: str
    cover_letter_length: str
    avoid_words: list
    writing_samples: str
    sample_permission: bool
    updated_at: datetime


class VerifyEntitiesRequest(AppSchema):
    entity_type: str = Field(max_length=40)
    entity_ids: list[str] = Field(min_length=1, max_length=200)
    verified: bool = True

    @field_validator("entity_type")
    @classmethod
    def _entity(cls, value: str) -> str:
        if value not in {"experience", "education", "skill", "project", "certification", "achievement"}:
            raise ValueError("Unknown entity type")
        return value


class CorrectionIn(AppSchema):
    entity_type: str = Field(max_length=60)
    entity_id: str | None = None
    field: str = Field("", max_length=80)
    previous_value: str = Field("", max_length=2000)
    new_value: str = Field("", max_length=2000)
    reason: str = Field("", max_length=1000)


class ProfileSummary(OutSchema):
    profile: ProfileOut | None
    experience_count: int
    education_count: int
    skill_count: int
    project_count: int
    certification_count: int
    achievement_count: int
    verified_experience_count: int
    unverified_items: int
    completeness: int
    missing_recommendations: list[str]
    career_objectives: list


class ProfileBundle(AppSchema):
    profile: ProfileOut | None
    experiences: list[ExperienceOut]
    education: list[EducationOut]
    skills: list[SkillOut]
    projects: list[ProjectOut]
    certifications: list[CertificationOut]
    achievements: list[AchievementOut]
    preferences: CareerPreferenceOut | None
    writing_style: WritingStyleOut | None
    completeness: int
    missing: list[str]
    summary: ProfileSummary
    unverified_counts: dict


class CVImportReview(AppSchema):
    upload_id: str
    filename: str
    extracted: dict
    warnings: list[str]
    suggestions: list[str]
    can_apply: bool = True
