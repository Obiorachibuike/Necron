"""Master CV, document, review and export schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator, model_validator

from app.schemas.common import AppSchema, ORMModel, OutSchema

DOC_TYPES = {"cv", "cover_letter"}
DOC_STATUSES = {
    "draft", "under_review", "needs_user_confirmation", "revision_required",
    "ready_for_approval", "approved", "exported",
}
TEMPLATES = {
    "ats", "modern_developer", "fullstack_engineer", "backend_engineer",
    "ai_engineer", "mobile_developer", "graduate", "academic",
}
SEVERITIES = {"critical", "warning", "info"}


class CVUpdate(AppSchema):
    title: str | None = Field(None, max_length=200)
    template: str | None = Field(None, max_length=40)
    content: dict | None = None

    @field_validator("template")
    @classmethod
    def _template(cls, value: str | None) -> str | None:
        if value is not None and value not in TEMPLATES:
            raise ValueError("Unknown CV template")
        return value


class CVBuildRequest(AppSchema):
    job_id: str | None = None
    template: str = Field("ats", max_length=40)
    tone: str = Field("professional", max_length=30)

    @field_validator("template")
    @classmethod
    def _template(cls, value: str) -> str:
        if value not in TEMPLATES:
            raise ValueError("Unknown CV template")
        return value


class CVVersionOut(OutSchema):
    id: str
    version_number: int
    template: str
    content: dict
    change_note: str
    created_at: datetime


class MasterCVOut(OutSchema):
    id: str
    title: str
    template: str
    content: dict
    current_version: int
    last_generated_at: datetime | None
    created_at: datetime
    updated_at: datetime
    versions: list[CVVersionOut] = Field(default_factory=list)


class TemplateInfo(AppSchema):
    key: str
    label: str
    description: str
    best_for: str
    ats_safe: bool


class StrategyIn(AppSchema):
    positioning: str = Field("", max_length=4000)
    selected_experience_ids: list[str] = Field(default_factory=list, max_length=50)
    selected_project_ids: list[str] = Field(default_factory=list, max_length=50)
    selected_skill_ids: list[str] = Field(default_factory=list, max_length=100)
    highlights: list[str] = Field(default_factory=list, max_length=20)
    gaps: list[str] = Field(default_factory=list, max_length=20)
    keywords: list[str] = Field(default_factory=list, max_length=40)
    approved: bool = False


class StrategyOut(OutSchema):
    id: str
    job_id: str
    positioning: str
    selected_experience_ids: list
    selected_project_ids: list
    selected_skill_ids: list
    highlights: list
    gaps: list
    keywords: list
    approved: bool
    approved_at: datetime | None
    source: str
    created_at: datetime
    updated_at: datetime
    generated_by_ai: bool = False
    ai_message: str = ""


class DocumentVersionOut(OutSchema):
    id: str
    version_number: int
    content: dict
    plain_text: str
    change_note: str
    created_by: str
    review_status: str
    review_findings: list
    unresolved_critical: int
    created_at: datetime


class FileOut(OutSchema):
    id: str
    version_number: int
    fmt: str
    size_bytes: int
    validated: bool
    validation_message: str
    created_at: datetime
    download_url: str = ""


class ReviewOut(OutSchema):
    id: str
    document_id: str
    version_number: int
    reviewer: str
    summary: str
    findings: list
    critical_count: int
    warning_count: int
    info_count: int
    model_used: str
    created_at: datetime


class DocumentOut(OutSchema):
    id: str
    job_id: str | None
    application_id: str | None
    doc_type: str
    title: str
    template: str
    status: str
    current_version: int
    source: str
    approved_at: datetime | None
    exported_at: datetime | None
    review_round: int
    created_at: datetime
    updated_at: datetime
    company: str = ""
    role_title: str = ""
    unresolved_critical: int = 0


class DocumentDetailOut(DocumentOut):
    versions: list[DocumentVersionOut] = Field(default_factory=list)
    current_content: dict = Field(default_factory=dict)
    reviews: list[ReviewOut] = Field(default_factory=list)
    files: list[FileOut] = Field(default_factory=list)
    can_approve: bool = False
    approval_blockers: list[str] = Field(default_factory=list)


class DocumentGenerateRequest(AppSchema):
    job_id: str = Field(min_length=1, max_length=36)
    doc_type: str = Field("cv", max_length=20)
    template: str = Field("ats", max_length=40)
    tone: str = Field("professional", max_length=30)
    length: str = Field("standard", max_length=20)
    strategy_id: str | None = None
    use_ai: bool = True
    async_mode: bool = False
    run_review: bool = True

    @field_validator("doc_type")
    @classmethod
    def _type(cls, value: str) -> str:
        if value not in DOC_TYPES:
            raise ValueError("Document type must be cv or cover_letter")
        return value

    @field_validator("template")
    @classmethod
    def _template(cls, value: str) -> str:
        if value not in TEMPLATES:
            raise ValueError("Unknown CV template")
        return value

    @field_validator("length")
    @classmethod
    def _length(cls, value: str) -> str:
        if value not in {"concise", "standard", "detailed"}:
            raise ValueError("Length must be concise, standard or detailed")
        return value


class DocumentContentUpdate(AppSchema):
    content: dict
    change_note: str = Field("Manual edit", max_length=400)
    plain_text: str | None = Field(None, max_length=60_000)


class DocumentReviewRequest(AppSchema):
    use_ai: bool = True
    round: int | None = Field(None, ge=1, le=5)


class RevisionRequest(AppSchema):
    use_ai: bool = True
    max_rounds: int = Field(2, ge=1, le=3)


class ApprovalRequest(AppSchema):
    acknowledge_warnings: bool = False


class ExportRequest(AppSchema):
    formats: list[str] = Field(default_factory=lambda: ["pdf", "docx", "txt"], max_length=4)

    @field_validator("formats")
    @classmethod
    def _formats(cls, value: list[str]) -> list[str]:
        allowed = {"pdf", "docx", "txt", "tex"}
        invalid = set(value) - allowed
        if invalid:
            raise ValueError(f"Unsupported formats: {', '.join(sorted(invalid))}")
        if not value:
            raise ValueError("Choose at least one format")
        return list(dict.fromkeys(value))


class ExportOut(AppSchema):
    document_id: str
    version: int
    files: list[FileOut]
    message: str
    download_token: str | None = None


class DocumentListOut(OutSchema):
    pass


class GenerateAccepted(AppSchema):
    task_id: str
    status: str
    message: str


class GenerateResult(AppSchema):
    document: DocumentDetailOut
    review: ReviewOut | None = None
    ai_used: bool
    ai_message: str
    quality_gate: str


class FindFinding(AppSchema):
    severity: str = "info"
    category: str = ""
    location: str = ""
    excerpt: str = ""
    explanation: str = ""
    recommendation: str = ""
    requires_confirmation: bool = False


class GenerateParamsPublic(AppSchema):
    templates: list[TemplateInfo]
    default_template: str
    default_tone: str = "professional"
