"""Dashboard, tasks, notifications, insights, privacy export, feedback and metadata."""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Query, Request, Response
from sqlalchemy import or_, select

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.errors import NotFoundError, ValidationAppError
from app.documents.content import TEMPLATE_INFO
from app.documents.service import DOC_STATUS_LABELS
from app.jobs.registry import PROVIDER_INFO
from app.models import (
    Application,
    BackgroundTask,
    Document,
    JobListing,
    User,
    UserFeedback,
)
from app.schemas.common import MessageResponse
from app.schemas.system import (
    BackgroundTaskOut,
    CareerInsightsOut,
    DashboardOut,
    DataExportOut,
    FeedbackIn,
    NotificationList,
    NotificationOut,
    PrivacySummary,
    WorkerStatusOut,
)
from app.services.auth_service import resolve_session
from app.services.dashboard import build_dashboard
from app.services.insights import dismiss_insight, generate_insights
from app.services.notifications import (
    clear_all,
    list_notifications,
    mark_all_read,
    mark_read,
    unread_count,
)
from app.services.privacy import export_user_data, privacy_summary
from app.tasks.queue import (
    cancel_task,
    get_task,
    list_tasks,
    retry_task,
    worker_status,
)

logger = logging.getLogger("careerpilot.api.system")

router = APIRouter(tags=["workspace"])


def _task_out(task: BackgroundTask) -> BackgroundTaskOut:
    payload = task.payload or {}
    summary = {key: payload[key] for key in ("doc_type", "job_id", "document_id", "search_id",
                                              "session_id") if key in payload}
    return BackgroundTaskOut(
        id=task.id, task_type=task.task_type, title=task.title, status=task.status,
        progress=task.progress, progress_note=task.progress_note, error=task.error,
        attempts=task.attempts, max_attempts=task.max_attempts, queued_at=task.queued_at,
        started_at=task.started_at, finished_at=task.finished_at, result=task.result or {},
        cancel_requested=bool(task.cancel_requested_at), payload_summary=summary,
    )


@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(user: CurrentUser, db: DbSession) -> DashboardOut:
    return DashboardOut(**build_dashboard(db, user))


@router.get("/tasks", response_model=list[BackgroundTaskOut])
async def tasks(user: CurrentUser, db: DbSession,
                limit: int = Query(20, ge=1, le=100)) -> list[BackgroundTaskOut]:
    return [_task_out(task) for task in list_tasks(db, user.id, limit=limit)]


@router.get("/tasks/worker-status", response_model=WorkerStatusOut)
async def worker_health(user: CurrentUser, db: DbSession) -> WorkerStatusOut:
    return WorkerStatusOut(**worker_status(db))


@router.get("/tasks/{task_id}", response_model=BackgroundTaskOut)
async def task_detail(task_id: str, user: CurrentUser, db: DbSession) -> BackgroundTaskOut:
    return _task_out(get_task(db, user.id, task_id))


@router.post("/tasks/{task_id}/cancel", response_model=BackgroundTaskOut)
async def cancel(task_id: str, user: CurrentUser, db: DbSession) -> BackgroundTaskOut:
    return _task_out(cancel_task(db, user.id, task_id))


@router.post("/tasks/{task_id}/retry", response_model=BackgroundTaskOut)
async def retry(task_id: str, user: CurrentUser, db: DbSession) -> BackgroundTaskOut:
    return _task_out(retry_task(db, user.id, task_id))


@router.get("/notifications", response_model=NotificationList)
async def notifications(user: CurrentUser, db: DbSession,
                        limit: int = Query(30, ge=1, le=100)) -> NotificationList:
    items, unread = list_notifications(db, user.id, limit=limit)
    return NotificationList(items=[NotificationOut.model_validate(n) for n in items], unread=unread)


@router.post("/notifications/read-all", response_model=MessageResponse)
async def read_all(user: CurrentUser, db: DbSession) -> MessageResponse:
    count = mark_all_read(db, user.id)
    return MessageResponse(message=f"{count} notification(s) marked as read.")


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
async def read_one(notification_id: str, user: CurrentUser, db: DbSession) -> NotificationOut:
    return NotificationOut.model_validate(mark_read(db, user.id, notification_id))


@router.delete("/notifications", response_model=MessageResponse)
async def delete_notifications(user: CurrentUser, db: DbSession) -> MessageResponse:
    count = clear_all(db, user.id)
    return MessageResponse(message=f"{count} notification(s) cleared.")


@router.get("/insights", response_model=CareerInsightsOut)
async def insights(user: CurrentUser, db: DbSession,
                   days: int = Query(90, ge=7, le=365)) -> CareerInsightsOut:
    return CareerInsightsOut(**generate_insights(db, user, days))


@router.post("/insights/dismiss", response_model=MessageResponse)
async def dismiss(payload: dict, user: CurrentUser, db: DbSession) -> MessageResponse:
    key = str(payload.get("key", "")).strip()
    if not key:
        raise ValidationAppError("Insight key is required.")
    dismiss_insight(db, user.id, key, bool(payload.get("dismissed", True)))
    return MessageResponse(message="Insight preference saved.")


@router.get("/privacy/summary", response_model=PrivacySummary)
async def privacy(user: CurrentUser) -> PrivacySummary:
    return PrivacySummary(**privacy_summary())


@router.get("/privacy/export")
async def export_data(user: CurrentUser, db: DbSession) -> Response:
    payload = export_user_data(db, user)
    body = json.dumps(payload, indent=2, ensure_ascii=False, default=str)
    return Response(
        content=body,
        media_type="application/json",
        headers={
            "Content-Disposition": 'attachment; filename="careerpilot-export.json"',
            "Cache-Control": "no-store, private",
        },
    )


@router.get("/search", response_model=dict)
async def search(user: CurrentUser, db: DbSession, q: str = Query(..., min_length=2, max_length=100)) -> dict:
    like = f"%{q.strip()}%"
    jobs = list(db.scalars(select(JobListing).where(
        JobListing.user_id == user.id,
        or_(JobListing.title.ilike(like), JobListing.company.ilike(like)))
        .order_by(JobListing.updated_at.desc()).limit(5)).all())
    documents = list(db.scalars(select(Document).where(
        Document.user_id == user.id, Document.title.ilike(like))
        .order_by(Document.updated_at.desc()).limit(5)).all())
    applications = list(db.scalars(select(Application).where(
        Application.user_id == user.id,
        or_(Application.company.ilike(like), Application.role_title.ilike(like)))
        .order_by(Application.updated_at.desc()).limit(5)).all())
    return {
        "jobs": [{"id": j.id, "title": j.title, "company": j.company} for j in jobs],
        "documents": [{"id": d.id, "title": d.title, "doc_type": d.doc_type,
                       "status": d.status} for d in documents],
        "applications": [{"id": a.id, "company": a.company, "role_title": a.role_title,
                          "status": a.status} for a in applications],
    }


@router.get("/meta", response_model=dict)
async def meta(request: Request, db: DbSession) -> dict:
    settings = get_settings()
    authenticated = False
    resolved = resolve_session(db, request.cookies.get(settings.session_cookie_name))
    if resolved:
        authenticated = True
    return {
        "app_name": settings.app_name,
        "tagline": "Your Career. Your Strategy. Your Next Opportunity.",
        "api_version": "v1",
        "environment": settings.app_env,
        "docs_url": "/api/v1/docs",
        "openapi_url": "/api/v1/openapi.json",
        "email_configured": settings.email_configured,
        "email_verification_required": settings.require_email_verification,
        "max_upload_mb": settings.max_upload_mb,
        "ai_defaults": {
            "daily_token_limit": settings.ai_daily_output_token_limit,
            "private_endpoints_allowed": settings.ai_allow_private_endpoints,
        },
        "providers": PROVIDER_INFO,
        "templates": TEMPLATE_INFO,
        "document_statuses": DOC_STATUS_LABELS,
        "application_statuses": [
            "saved", "planning", "documents_in_progress", "ready_to_apply", "applied",
            "assessment", "interview", "offer", "rejected", "withdrawn", "closed",
        ],
        "writing_styles": {
            "tone": ["professional", "conversational", "formal"],
            "length": ["concise", "balanced", "detailed"],
            "confidence": ["confident", "understated"],
            "technicality": ["technical", "accessible"],
            "directness": ["direct", "diplomatic"],
            "cover_letter_length": ["concise", "standard", "detailed"],
            "cv_style": [item["key"] for item in TEMPLATE_INFO],
        },
        "objectives": [
            {"key": "full_time", "label": "Full-time employment"},
            {"key": "remote_work", "label": "Remote work"},
            {"key": "internship", "label": "Internships"},
            {"key": "graduate", "label": "Graduate opportunities"},
            {"key": "contract", "label": "Contract work"},
            {"key": "freelance", "label": "Freelance clients"},
            {"key": "career_change", "label": "Career change"},
            {"key": "application_improvement", "label": "Application improvement"},
            {"key": "interview_preparation", "label": "Interview preparation"},
            {"key": "exploration", "label": "General exploration"},
        ],
        "authenticated": authenticated,
    }


@router.post("/feedback", response_model=MessageResponse)
async def submit_feedback(payload: FeedbackIn, request: Request, db: DbSession) -> MessageResponse:
    settings = get_settings()
    resolved = resolve_session(db, request.cookies.get(settings.session_cookie_name))
    email = payload.email.strip()
    user_id = resolved[0].id if resolved else None
    if user_id and not email:
        email = resolved[0].email
    feedback = UserFeedback(
        user_id=user_id, email=email[:320], category=payload.category[:60],
        message=payload.message[:5000], page=payload.page[:300],
    )
    db.add(feedback)
    db.commit()
    return MessageResponse(
        message="Thank you. Your message has been recorded for the support team.",
        code="feedback_received",
    )
