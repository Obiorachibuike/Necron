"""Master CV, structured CV versions, generated documents and stored files."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
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

CV_TEMPLATES = (
    "ats",
    "modern_developer",
    "fullstack_engineer",
    "backend_engineer",
    "ai_engineer",
    "mobile_developer",
    "graduate",
    "academic",
)


class MasterCV(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "master_cvs"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), default="Master CV", nullable=False)
    template: Mapped[str] = mapped_column(String(40), default="ats", nullable=False)
    content: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    current_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    last_generated_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class CVVersion(Base, UUIDPrimaryKey):
    __tablename__ = "cv_versions"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    master_cv_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("master_cvs.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    template: Mapped[str] = mapped_column(String(40), default="ats", nullable=False)
    content: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    change_note: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)

    __table_args__ = (
        UniqueConstraint("master_cv_id", "version_number", name="uq_cv_versions_master_version"),
    )


class Document(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "documents"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    job_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("job_listings.id", ondelete="SET NULL"), index=True
    )
    application_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("applications.id", ondelete="SET NULL", use_alter=True,
                   name="fk_documents_application"),
        index=True,
    )
    doc_type: Mapped[str] = mapped_column(String(30), default="cv", nullable=False)  # cv | cover_letter
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    template: Mapped[str] = mapped_column(String(40), default="ats", nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="draft", nullable=False)
    current_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    source: Mapped[str] = mapped_column(String(30), default="ai", nullable=False)
    strategy_id: Mapped[str | None] = mapped_column(String(36))
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    exported_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    review_round: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    versions: Mapped[list["DocumentVersion"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="DocumentVersion.version_number",
    )
    files: Mapped[list["DocumentFile"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (Index("ix_documents_user_updated", "user_id", "updated_at"),)


class DocumentVersion(Base, UUIDPrimaryKey):
    __tablename__ = "document_versions"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    plain_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    change_note: Mapped[str] = mapped_column(String(400), default="", nullable=False)
    created_by: Mapped[str] = mapped_column(String(30), default="ai_drafter", nullable=False)
    review_status: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    review_findings: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    unresolved_critical: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)

    document: Mapped[Document] = relationship(back_populates="versions")

    __table_args__ = (
        UniqueConstraint("document_id", "version_number", name="uq_document_versions_doc_version"),
    )


class DocumentReview(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "document_reviews"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    reviewer: Mapped[str] = mapped_column(String(40), default="ai_reviewer", nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    findings: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    critical_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    warning_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    info_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    model_used: Mapped[str] = mapped_column(String(120), default="", nullable=False)


class ApplicationStrategy(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "application_strategies"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("job_listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    positioning: Mapped[str] = mapped_column(Text, default="", nullable=False)
    selected_experience_ids: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    selected_project_ids: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    selected_skill_ids: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    highlights: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    gaps: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    keywords: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    source: Mapped[str] = mapped_column(String(30), default="deterministic", nullable=False)


class DocumentFile(Base, UUIDPrimaryKey):
    __tablename__ = "document_files"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    fmt: Mapped[str] = mapped_column(String(10), nullable=False)  # pdf | docx | txt | tex
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    validated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    validation_message: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)

    document: Mapped[Document] = relationship(back_populates="files")

    __table_args__ = (
        UniqueConstraint("document_id", "version_number", "fmt", name="uq_document_files_doc_ver_fmt"),
    )


class UploadedFile(Base, UUIDPrimaryKey, TimestampMixin):
    """Imported source files (CV uploads), stored privately."""

    __tablename__ = "uploaded_files"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    original_name: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    import_status: Mapped[str] = mapped_column(String(30), default="uploaded", nullable=False)
    extracted_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    extracted_data: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
