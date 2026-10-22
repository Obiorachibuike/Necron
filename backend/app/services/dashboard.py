"""Dashboard aggregation built strictly from stored records."""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.service import get_active_config
from app.database.base import utcnow
from app.models import (
    Application,
    BackgroundTask,
    Document,
    InterviewSession,
    JobListing,
    JobMatch,
    Notification,
    Reminder,
    Skill,
    User,
    WorkExperience,
)
from app.services.applications import application_stats
from app.services.profile_service import compute_completeness, ensure_profile
from app.tasks.queue import list_tasks, worker_status


def _job_summary(job: JobListing, match: JobMatch | None) -> dict:
    return {
        "job_id": job.id, "title": job.title, "company": job.company,
        "location": job.location, "work_arrangement": job.work_arrangement,
        "source_url": job.source_url, "listing_status": job.listing_status,
        "score": match.overall_score if match else None,
        "category": match.category if match else None,
        "created_at": job.created_at.isoformat() if job.created_at else None,
    }


def build_dashboard(db: Session, user: User) -> dict:
    now = utcnow()
    profile = ensure_profile(db, user)
    completeness, _missing = compute_completeness(db, user.id)

    matches = list(db.scalars(select(JobMatch).where(
        JobMatch.user_id == user.id).order_by(JobMatch.overall_score.desc())).all())
    job_map = {job.id: job for job in db.scalars(select(JobListing).where(
        JobListing.user_id == user.id)).all()}
    applications = list(db.scalars(select(Application).where(
        Application.user_id == user.id)).all())
    applied_job_ids = {application.job_id for application in applications if application.job_id}

    saved_matches = [(job_map[m.job_id], m) for m in matches
                     if m.job_id in job_map and job_map[m.job_id].is_saved]
    new_matches = [(job, m) for job, m in saved_matches
                   if job.created_at and job.created_at >= now - timedelta(days=14)][:5]
    if not new_matches:
        new_matches = saved_matches[:3]
    recommended = [(job, m) for job, m in saved_matches
                   if m.overall_score >= 60 and job.id not in applied_job_ids][:5]

    stats = application_stats(db, user.id)

    upcoming_interviews: list[dict] = []
    for reminder in db.scalars(select(Reminder).where(
            Reminder.user_id == user.id, Reminder.kind == "interview",
            Reminder.completed_at.is_(None), Reminder.due_at >= now - timedelta(days=1),
            Reminder.due_at <= now + timedelta(days=45)).order_by(Reminder.due_at.asc())).all()[:5]:
        application = db.get(Application, reminder.application_id) if reminder.application_id else None
        upcoming_interviews.append({
            "title": reminder.title, "company": application.company if application else "",
            "role": application.role_title if application else "",
            "at": reminder.due_at, "application_id": reminder.application_id,
            "source": "reminder",
        })
    if len(upcoming_interviews) < 5:
        for application in [a for a in applications if a.status == "interview"][:3]:
            if any(item.get("application_id") == application.id for item in upcoming_interviews):
                continue
            when = application.next_action_at or application.deadline_at
            if when:
                upcoming_interviews.append({
                    "title": f"Interview stage: {application.role_title}",
                    "company": application.company, "role": application.role_title,
                    "at": when, "application_id": application.id, "source": "application",
                })
        upcoming_interviews.sort(key=lambda item: item["at"] or now)

    deadlines: list[dict] = []
    for application in applications:
        if application.deadline_at and application.status in {
                "saved", "planning", "documents_in_progress", "ready_to_apply", "applied", "assessment"}:
            if now - timedelta(days=1) <= application.deadline_at <= now + timedelta(days=45):
                deadlines.append({
                    "title": f"Application deadline: {application.role_title}",
                    "company": application.company, "at": application.deadline_at,
                    "application_id": application.id, "kind": "deadline",
                })
    for reminder in db.scalars(select(Reminder).where(
            Reminder.user_id == user.id, Reminder.completed_at.is_(None),
            Reminder.due_at >= now - timedelta(days=1),
            Reminder.due_at <= now + timedelta(days=45)).order_by(Reminder.due_at.asc())).all()[:8]:
        if reminder.kind == "interview":
            continue
        application = db.get(Application, reminder.application_id) if reminder.application_id else None
        deadlines.append({
            "title": reminder.title, "company": application.company if application else "",
            "at": reminder.due_at, "application_id": reminder.application_id,
            "kind": reminder.kind, "reminder_id": reminder.id,
        })
    deadlines.sort(key=lambda item: item["at"] or now)
    deadlines = deadlines[:8]

    recent_documents = []
    for document in db.scalars(select(Document).where(Document.user_id == user.id)
                               .order_by(Document.updated_at.desc()).limit(5)).all():
        job = job_map.get(document.job_id) if document.job_id else None
        recent_documents.append({
            "id": document.id, "title": document.title, "doc_type": document.doc_type,
            "status": document.status, "company": job.company if job else "",
            "role_title": job.title if job else "",
            "updated_at": document.updated_at.isoformat() if document.updated_at else None,
        })

    tasks = list_tasks(db, user.id, limit=5)
    tasks_out = [{
        "id": t.id, "task_type": t.task_type, "title": t.title, "status": t.status,
        "progress": t.progress, "progress_note": t.progress_note, "error": t.error,
        "attempts": t.attempts, "max_attempts": t.max_attempts, "queued_at": t.queued_at,
        "started_at": t.started_at, "finished_at": t.finished_at, "result": t.result or {},
        "cancel_requested": bool(t.cancel_requested_at), "payload_summary": {},
    } for t in tasks]

    unread = int(db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None))) or 0)
    worker = worker_status(db)
    has_data = bool(
        db.scalar(select(func.count()).select_from(WorkExperience).where(
            WorkExperience.user_id == user.id))
        or db.scalar(select(func.count()).select_from(Skill).where(Skill.user_id == user.id))
        or job_map or applications
    )
    ai_configured = get_active_config(db, user.id) is not None
    quick_actions = [
        {"label": "Find Jobs", "href": "/jobs", "description": "Search your configured job boards.",
         "requires_ai": False},
        {"label": "Analyze a Job", "href": "/jobs?import=1",
         "description": "Paste a URL or a description for an evidence-based match report.",
         "requires_ai": False},
        {"label": "Tailor My CV", "href": "/studio", "description": "Build a job-specific CV.",
         "requires_ai": False},
        {"label": "Generate a Cover Letter", "href": "/studio", "description": "Draft a tailored letter.",
         "requires_ai": False},
        {"label": "Prepare for an Interview", "href": "/interview-coach",
         "description": "Practise job-specific questions.", "requires_ai": False},
        {"label": "Add an Application", "href": "/applications", "description": "Track an application.",
         "requires_ai": False},
    ]
    return {
        "profile_completeness": completeness,
        "profile_headline": profile.professional_headline,
        "preferred_name": profile.preferred_name or user.display_name,
        "new_matches": [_job_summary(job, match) for job, match in new_matches[:5]],
        "recommended": [_job_summary(job, match) for job, match in recommended],
        "applications": {
            "total": stats["total"], "active": stats["active"],
            "by_status": stats["by_status"], "interviews": stats["interviews"],
            "offers": stats["offers"], "response_rate": stats["response_rate"],
        },
        "upcoming_interviews": upcoming_interviews[:5],
        "deadlines": deadlines,
        "recent_documents": recent_documents,
        "tasks": tasks_out,
        "quick_actions": quick_actions,
        "ai_configured": ai_configured,
        "onboarding_completed": user.onboarding_completed,
        "has_data": has_data,
        "unread_notifications": unread,
        "worker_available": worker["active_workers"] > 0,
    }
