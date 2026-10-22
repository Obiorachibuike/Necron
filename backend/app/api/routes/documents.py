"""Master CV, tailored documents, review workflow, approval and downloads."""
from __future__ import annotations

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Query, Request
from fastapi.responses import Response
from sqlalchemy import func, or_, select

from app.ai.service import ensure_ai_ready
from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.errors import AppError, ConflictError, NotFoundError, ValidationAppError
from app.core.security import safe_filename, verify_download_token
from app.core.text import strip_control_characters
from app.database.base import utcnow
from app.documents.content import TEMPLATE_INFO, docs_text_for_review
from app.documents.renderers import RenderError, render_document
from app.documents.service import (
    approve_document,
    document_detail,
    document_owned_or_404,
    export_document,
    get_or_create_master_cv,
    job_owned_or_404,
    rebuild_master_cv,
    restore_master_version,
    update_master_cv,
)
from app.models import (
    Application,
    ApplicationStrategy,
    CVVersion,
    Document,
    DocumentFile,
    DocumentVersion,
    JobListing,
    MasterCV,
)
from app.schemas.common import MessageResponse
from app.schemas.documents import (
    ApprovalRequest,
    CVUpdate,
    DocumentContentUpdate,
    DocumentDetailOut,
    DocumentGenerateRequest,
    DocumentOut,
    DocumentReviewRequest,
    DocumentVersionOut,
    ExportOut,
    ExportRequest,
    GenerateAccepted,
    MasterCVOut,
    RevisionRequest,
    TemplateInfo,
)
from app.services.auth_service import resolve_session
from app.services.storage import read_stored
from app.tasks.queue import enqueue

logger = logging.getLogger("careerpilot.api.documents")

router = APIRouter(tags=["documents"])

MAX_CONTENT_BYTES = 200_000


def _sanitize(value, depth: int = 0):
    if depth > 6:
        return ""
    if isinstance(value, str):
        return strip_control_characters(value)[:5000]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    if isinstance(value, list):
        return [_sanitize(item, depth + 1) for item in value[:80]]
    if isinstance(value, dict):
        return {str(key)[:80]: _sanitize(item, depth + 1)
                for key, item in list(value.items())[:80]}
    return str(value)[:1000]


def _validate_content(content: dict, doc_type: str) -> dict:
    raw = json.dumps(content)
    if len(raw.encode("utf-8")) > MAX_CONTENT_BYTES:
        raise ValidationAppError("That document content is too large.")
    if not isinstance(content, dict) or "header" not in content:
        raise ValidationAppError("Document content must include a header section.")
    sanitized = _sanitize(content)
    if doc_type == "cover_letter":
        paragraphs = sanitized.get("paragraphs")
        if not isinstance(paragraphs, list) or not paragraphs:
            raise ValidationAppError("A cover letter needs at least one paragraph.")
    else:
        sections = sanitized.get("sections")
        if not isinstance(sections, list):
            raise ValidationAppError("CV content must include sections.")
    return sanitized


def _document_out(db, document: Document, job: JobListing | None = None) -> DocumentOut:
    job = job or (db.get(JobListing, document.job_id) if document.job_id else None)
    current = db.scalar(select(DocumentVersion).where(
        DocumentVersion.document_id == document.id,
        DocumentVersion.version_number == document.current_version))
    return DocumentOut(
        id=document.id, job_id=document.job_id, application_id=document.application_id,
        doc_type=document.doc_type, title=document.title, template=document.template,
        status=document.status, current_version=document.current_version, source=document.source,
        approved_at=document.approved_at, exported_at=document.exported_at,
        review_round=document.review_round, created_at=document.created_at,
        updated_at=document.updated_at, company=job.company if job else "",
        role_title=job.title if job else "",
        unresolved_critical=current.unresolved_critical if current else 0,
    )


@router.get("/documents/templates", response_model=list[TemplateInfo])
async def templates() -> list[TemplateInfo]:
    return [TemplateInfo(**item) for item in TEMPLATE_INFO]


@router.get("/documents", response_model=dict)
async def list_documents(
    user: CurrentUser, db: DbSession,
    doc_type: str | None = Query(None, pattern="^(cv|cover_letter)$"),
    status: str | None = Query(None, max_length=40),
    q: str = Query("", max_length=200),
    page: int = Query(1, ge=1, le=1000),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    stmt = select(Document).where(Document.user_id == user.id)
    if doc_type:
        stmt = stmt.where(Document.doc_type == doc_type)
    if status:
        stmt = stmt.where(Document.status == status)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Document.title.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    documents = list(db.scalars(stmt.order_by(Document.updated_at.desc())
                                .limit(page_size).offset((page - 1) * page_size)).all())
    jobs = {j.id: j for j in db.scalars(select(JobListing).where(
        JobListing.user_id == user.id, JobListing.id.in_(
            [d.job_id for d in documents if d.job_id]))).all()} if documents else {}
    items = [_document_out(db, d, jobs.get(d.job_id)).model_dump() for d in documents]
    from app.schemas.common import page_envelope

    return page_envelope(items, int(total), page, page_size)


@router.post("/documents/generate", response_model=GenerateAccepted, status_code=202)
async def generate(payload: DocumentGenerateRequest, user: CurrentUser, db: DbSession) -> GenerateAccepted:
    job = job_owned_or_404(db, user.id, payload.job_id)
    if payload.use_ai:
        ensure_ai_ready(db, user.id)
    strategy = None
    if payload.strategy_id:
        strategy = db.get(ApplicationStrategy, payload.strategy_id)
        if not strategy or strategy.user_id != user.id or strategy.job_id != job.id:
            raise NotFoundError("Application strategy not found for this job")
    else:
        strategy = db.scalar(select(ApplicationStrategy).where(
            ApplicationStrategy.user_id == user.id,
            ApplicationStrategy.job_id == job.id).order_by(
            ApplicationStrategy.updated_at.desc()))
    if not strategy:
        raise ConflictError("Create an application strategy for this job first, then approve it.",
                            code="strategy_required")
    if not strategy.approved:
        raise ConflictError("Approve the application strategy before generating documents.",
                            code="strategy_unapproved")
    task = enqueue(
        db, user.id, "document_generate",
        f"{'CV' if payload.doc_type == 'cv' else 'Cover letter'} for {job.title} at {job.company}",
        {"user_id": user.id, "job_id": job.id, "doc_type": payload.doc_type,
         "template": payload.template, "tone": payload.tone, "length": payload.length,
         "strategy_id": strategy.id, "use_ai": payload.use_ai,
         "run_review": payload.run_review},
    )
    return GenerateAccepted(task_id=task.id, status=task.status,
                            message=("Generation queued. The draft will appear with review findings "
                                     "as soon as the worker finishes."))


@router.get("/documents/{document_id}", response_model=DocumentDetailOut)
async def get_document(document_id: str, user: CurrentUser, db: DbSession) -> DocumentDetailOut:
    document = document_owned_or_404(db, user.id, document_id)
    return DocumentDetailOut(**document_detail(db, user, document))


@router.patch("/documents/{document_id}", response_model=DocumentDetailOut)
async def edit_document(document_id: str, payload: DocumentContentUpdate, user: CurrentUser,
                        db: DbSession) -> DocumentDetailOut:
    document = document_owned_or_404(db, user.id, document_id)
    content = _validate_content(payload.content, document.doc_type)
    plain = payload.plain_text[:60_000] if payload.plain_text else docs_text_for_review(
        content, document.doc_type)
    document.current_version += 1
    document.status = "draft"
    document.approved_at = None
    db.add(DocumentVersion(
        user_id=user.id, document_id=document.id, version_number=document.current_version,
        content=content, plain_text=plain,
        change_note=(payload.change_note or "Manual edit")[:400], created_by="manual",
        created_at=utcnow(),
    ))
    db.commit()
    db.refresh(document)
    return DocumentDetailOut(**document_detail(db, user, document))


@router.delete("/documents/{document_id}", response_model=MessageResponse)
async def delete_document(document_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    document = document_owned_or_404(db, user.id, document_id)
    db.delete(document)
    db.commit()
    return MessageResponse(message="Document deleted.")


@router.post("/documents/{document_id}/review", response_model=GenerateAccepted, status_code=202)
async def review(document_id: str, payload: DocumentReviewRequest, user: CurrentUser,
                 db: DbSession) -> GenerateAccepted:
    document = document_owned_or_404(db, user.id, document_id)
    task = enqueue(db, user.id, "document_review", f"Reviewing: {document.title}",
                   {"user_id": user.id, "document_id": document.id, "use_ai": payload.use_ai},
                   dedupe_key=f"review:{document.id}:{document.current_version}")
    document.status = "under_review"
    db.commit()
    return GenerateAccepted(task_id=task.id, status=task.status,
                            message="Independent review queued.")


@router.post("/documents/{document_id}/revise", response_model=GenerateAccepted, status_code=202)
async def revise(document_id: str, payload: RevisionRequest, user: CurrentUser,
                 db: DbSession) -> GenerateAccepted:
    document = document_owned_or_404(db, user.id, document_id)
    task = enqueue(db, user.id, "document_revision", f"Revising: {document.title}",
                   {"user_id": user.id, "document_id": document.id, "use_ai": payload.use_ai,
                    "max_rounds": payload.max_rounds},
                   dedupe_key=f"revision:{document.id}:{document.current_version}")
    return GenerateAccepted(task_id=task.id, status=task.status,
                            message="Revision queued. Review findings are applied without adding new facts.")


@router.post("/documents/{document_id}/approve", response_model=DocumentOut)
async def approve(document_id: str, payload: ApprovalRequest, user: CurrentUser,
                  db: DbSession) -> DocumentOut:
    document = document_owned_or_404(db, user.id, document_id)
    approve_document(db, user, document, acknowledge_warnings=payload.acknowledge_warnings)
    return _document_out(db, document)


@router.post("/documents/{document_id}/export", response_model=ExportOut)
async def export(document_id: str, payload: ExportRequest, user: CurrentUser,
                 db: DbSession) -> ExportOut:
    document = document_owned_or_404(db, user.id, document_id)
    files = export_document(db, user, document, payload.formats)
    db.refresh(document)
    return ExportOut(document_id=document.id, version=document.current_version, files=files,
                     message=("Exports generated and validated. Download links expire shortly; "
                              "re-export if a link expires."))


@router.post("/documents/{document_id}/link-application", response_model=DocumentOut)
async def link_application(document_id: str, payload: dict, user: CurrentUser,
                           db: DbSession) -> DocumentOut:
    document = document_owned_or_404(db, user.id, document_id)
    application_id = payload.get("application_id")
    if application_id:
        application = db.get(Application, application_id)
        if not application or application.user_id != user.id:
            raise NotFoundError("Application not found")
        document.application_id = application.id
        if document.doc_type == "cv":
            application.cv_document_id = document.id
        else:
            application.cover_letter_document_id = document.id
        db.commit()
    return _document_out(db, document)


def _download_response(data: bytes, filename: str, media_type: str) -> Response:
    return Response(
        content=data, media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{safe_filename(filename)}\"; "
                                   f"filename*=UTF-8''{safe_filename(filename)}",
            "Cache-Control": "no-store, private",
            "X-Content-Type-Options": "nosniff",
        },
    )


MEDIA_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain; charset=utf-8",
    "tex": "application/x-tex; charset=utf-8",
}


@router.get("/documents/{document_id}/files/{file_id}/download")
async def download_file(document_id: str, file_id: str, request: Request, db: DbSession,
                        token: str = ""):
    file = db.get(DocumentFile, file_id)
    if not file or file.document_id != document_id:
        raise NotFoundError("File not found")
    document = db.get(Document, document_id)
    if not document:
        raise NotFoundError("Document not found")
    authorized = False
    if token:
        claims = verify_download_token(token, get_settings().encryption_key_material)
        if claims and claims["user_id"] == file.user_id \
                and claims["document_id"] == document_id \
                and int(claims["version"]) == file.version_number and claims["fmt"] == file.fmt:
            authorized = True
    if not authorized:
        # Fall back to an authenticated session (safe for GET; no CSRF mutation).
        settings = get_settings()
        resolved = resolve_session(db, request.cookies.get(settings.session_cookie_name))
        if resolved and resolved[0].id == file.user_id:
            authorized = True
    if not authorized:
        raise AppError(401, "unauthenticated",
                       "This download link has expired. Export the document again.")
    data = read_stored(file.storage_path, file.user_id)
    fmt = file.fmt
    filename = f"{document.title} v{file.version_number}.{fmt}"
    return _download_response(data, filename, MEDIA_TYPES.get(fmt, "application/octet-stream"))


@router.get("/documents/{document_id}/download/{fmt}")
async def download_current(document_id: str, fmt: str, user: CurrentUser, db: DbSession,
                           token: str = ""):
    """Authenticated download; renders the current version if no stored export exists."""
    document = document_owned_or_404(db, user.id, document_id)
    if fmt not in MEDIA_TYPES:
        raise ValidationAppError("Unsupported format")
    file = db.scalar(select(DocumentFile).where(
        DocumentFile.document_id == document.id,
        DocumentFile.version_number == document.current_version,
        DocumentFile.fmt == fmt))
    if file:
        data = read_stored(file.storage_path, user.id)
    else:
        version = db.scalar(select(DocumentVersion).where(
            DocumentVersion.document_id == document.id,
            DocumentVersion.version_number == document.current_version))
        if not version:
            raise NotFoundError("Document version not found")
        if document.status not in {"approved", "exported"}:
            raise ConflictError("Approve this document before downloading it.",
                                code="not_approved")
        try:
            data, _message = render_document(version.content, document.doc_type, fmt)
        except RenderError as exc:
            raise ValidationAppError(str(exc)) from exc
    filename = f"{document.title} v{document.current_version}.{fmt}"
    return _download_response(data, filename, MEDIA_TYPES[fmt])


# --------------------------------------------------------------------------- master CV


@router.get("/master-cv", response_model=MasterCVOut)
async def get_master(user: CurrentUser, db: DbSession) -> MasterCVOut:
    master = get_or_create_master_cv(db, user)
    versions = list(db.scalars(select(CVVersion).where(CVVersion.master_cv_id == master.id)
                               .order_by(CVVersion.version_number.desc()).limit(30)).all())
    return MasterCVOut(
        id=master.id, title=master.title, template=master.template, content=master.content,
        current_version=master.current_version, last_generated_at=master.last_generated_at,
        created_at=master.created_at, updated_at=master.updated_at,
        versions=[{"id": v.id, "version_number": v.version_number, "template": v.template,
                   "content": v.content, "change_note": v.change_note,
                   "created_at": v.created_at} for v in versions],
    )


@router.patch("/master-cv", response_model=MasterCVOut)
async def update_master(payload: CVUpdate, user: CurrentUser, db: DbSession) -> MasterCVOut:
    content = _validate_content(payload.content, "cv") if payload.content is not None else None
    update_master_cv(db, user, content=content, template=payload.template,
                     title=payload.title, change_note="Manual edit of master CV")
    return await get_master(user, db)


@router.post("/master-cv/rebuild", response_model=MasterCVOut)
async def rebuild_master(payload: CVUpdate, user: CurrentUser, db: DbSession) -> MasterCVOut:
    rebuild_master_cv(db, user, payload.template, "Rebuilt from verified profile")
    return await get_master(user, db)


@router.post("/master-cv/restore/{version_id}", response_model=MasterCVOut)
async def restore_master(version_id: str, user: CurrentUser, db: DbSession) -> MasterCVOut:
    restore_master_version(db, user, version_id)
    return await get_master(user, db)


@router.get("/master-cv/download/{fmt}")
async def download_master(fmt: str, user: CurrentUser, db: DbSession):
    if fmt not in MEDIA_TYPES:
        raise ValidationAppError("Unsupported format")
    master = get_or_create_master_cv(db, user)
    try:
        data, _message = render_document(master.content, "cv", fmt)
    except RenderError as exc:
        raise ValidationAppError(str(exc)) from exc
    return _download_response(data, f"{master.title} v{master.current_version}.{fmt}",
                              MEDIA_TYPES[fmt])
