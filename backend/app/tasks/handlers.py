"""Task handlers. Each handler is sync and owns its DB transaction boundaries."""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.database.base import utcnow
from app.documents.service import (
    document_owned_or_404,
    generate_document,
    job_owned_or_404,
    revise_document,
    run_review,
)
from app.models import BackgroundTask, InterviewSession, JobSearch, Reminder, User
from app.services.interviews import generate_interview_questions
from app.services.jobs_service import compute_schedule, discover_jobs, refresh_listing_freshness
from app.services.notifications import create_notification
from app.services.jobs_service import source_query_from_search
from app.tasks.queue import TaskCancelled, TaskContext

logger = logging.getLogger("careerpilot.tasks.handlers")


def _run(coro):
    """Run an async service from the worker thread (no loop must be active)."""
    return asyncio.run(coro)


def _user(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if not user:
        raise AppError(404, "not_found", "User no longer exists")
    return user


def handle_document_generate(db: Session, task: BackgroundTask, ctx: TaskContext) -> dict:
    payload = task.payload or {}
    user = _user(db, payload["user_id"])
    ctx.progress(5, "Loading approved strategy")
    ctx.check_cancelled()
    job = job_owned_or_404(db, user.id, payload["job_id"])
    if payload.get("doc_type") == "cv":
        ctx.progress(20, "Drafting tailored CV")
    else:
        ctx.progress(20, "Drafting cover letter")
    ctx.check_cancelled()
    document = _run(generate_document(
        db, user, job.id,
        doc_type=payload.get("doc_type", "cv"),
        template=payload.get("template", "ats"),
        tone=payload.get("tone", "professional"),
        length=payload.get("length", "standard"),
        strategy_id=payload.get("strategy_id"),
        use_ai=bool(payload.get("use_ai", True)),
        run_review_now=False,
    ))
    ctx.progress(60, "Running independent review")
    ctx.check_cancelled()
    review = None
    if payload.get("run_review", True):
        review = _run(run_review(db, user, document, use_ai=bool(payload.get("use_ai", True))))
    ctx.progress(95, "Saving document")
    db.refresh(document)
    return {
        "document_id": document.id,
        "status": document.status,
        "review_id": review.id if review else None,
        "critical_findings": review.critical_count if review else 0,
    }


def handle_document_revision(db: Session, task: BackgroundTask, ctx: TaskContext) -> dict:
    payload = task.payload or {}
    user = _user(db, payload["user_id"])
    document = document_owned_or_404(db, user.id, payload["document_id"])
    ctx.progress(10, "Analyzing review findings")
    ctx.check_cancelled()
    ctx.progress(35, "Applying corrections")
    result = _run(revise_document(db, user, document, use_ai=bool(payload.get("use_ai", True)),
                                  max_rounds=int(payload.get("max_rounds", 2))))
    ctx.progress(95, "Saving revised version")
    db.refresh(document)
    review = result.get("review")
    return {
        "document_id": document.id,
        "rounds": result.get("rounds", 0),
        "status": document.status,
        "can_approve": result.get("can_approve", False),
        "remaining_critical": review.critical_count if review else 0,
    }


def handle_review(db: Session, task: BackgroundTask, ctx: TaskContext) -> dict:
    payload = task.payload or {}
    user = _user(db, payload["user_id"])
    document = document_owned_or_404(db, user.id, payload["document_id"])
    ctx.progress(30, "Reading document and verified evidence")
    ctx.check_cancelled()
    review = _run(run_review(db, user, document, use_ai=bool(payload.get("use_ai", True))))
    ctx.progress(95, "Saving review findings")
    return {"document_id": document.id, "review_id": review.id,
            "critical": review.critical_count, "warnings": review.warning_count,
            "status": document.status}


def handle_discovery(db: Session, task: BackgroundTask, ctx: TaskContext) -> dict:
    payload = task.payload or {}
    user = _user(db, payload["user_id"])
    search = None
    if payload.get("search_id"):
        search = db.get(JobSearch, payload["search_id"])
        if not search or search.user_id != user.id:
            search = None
    query = source_query_from_search(search, payload.get("query"))
    ctx.progress(5, "Preparing job search")
    ctx.check_cancelled()

    def progress(percent: int, note: str) -> None:
        ctx.check_cancelled()
        ctx.progress(percent, note)

    # discover_jobs runs its own asyncio loop for provider calls.
    result = discover_jobs(db, user, query, source_ids=payload.get("source_ids"),
                           search=search, max_results=int(payload.get("max_results", 50)),
                           progress=progress)
    ctx.progress(100, "Discovery finished")
    return result


def handle_interview_prepare(db: Session, task: BackgroundTask, ctx: TaskContext) -> dict:
    payload = task.payload or {}
    user = _user(db, payload["user_id"])
    session = db.get(InterviewSession, payload["session_id"])
    if not session or session.user_id != user.id:
        raise AppError(404, "not_found", "Interview session no longer exists")
    ctx.progress(20, "Selecting relevant questions")
    ctx.check_cancelled()
    _run(generate_interview_questions(
        db, user, session, use_ai=bool(payload.get("use_ai", True)),
        count=int(payload.get("count", 10)),
        categories=payload.get("categories") or None,
    ))
    ctx.progress(100, "Questions ready")
    return {"session_id": session.id, "question_count": len(session.questions),
            "source": session.questions_source}


def handle_revalidate_jobs(db: Session, task: BackgroundTask, ctx: TaskContext) -> dict:
    payload = task.payload or {}
    user = _user(db, payload["user_id"])
    ctx.progress(20, "Re-checking saved provider listings")
    checked = refresh_listing_freshness(db, user.id, limit=int(payload.get("limit", 25)))
    ctx.progress(95, "Updating listing status")
    return {"checked": checked}


def handle_scheduled_search(db: Session, task: BackgroundTask, ctx: TaskContext) -> dict:
    payload = task.payload or {}
    user = _user(db, payload["user_id"])
    search = db.get(JobSearch, payload["search_id"])
    if not search or search.user_id != user.id:
        raise AppError(404, "not_found", "Saved search no longer exists")
    if not search.schedule_enabled:
        return {"skipped": True, "reason": "Schedule disabled"}
    query = source_query_from_search(search)
    ctx.progress(10, f"Running scheduled search: {search.name}")
    result = discover_jobs(db, user, query, search=search,
                           max_results=search.schedule_max_results,
                           progress=lambda p, n: ctx.progress(p, n))
    if search.notify and result.get("created"):
        create_notification(
            db, user.id, "scheduled_search",
            f"Scheduled search “{search.name}” found {result['created']} new job(s)",
            result.get("message", ""), "/jobs?tab=discovered",
        )
    return result


HANDLERS = {
    "document_generate": handle_document_generate,
    "document_revision": handle_document_revision,
    "document_review": handle_review,
    "job_discovery": handle_discovery,
    "interview_prepare": handle_interview_prepare,
    "revalidate_jobs": handle_revalidate_jobs,
    "scheduled_search": handle_scheduled_search,
}

TASK_TITLES = {
    "document_generate": "Generating application document",
    "document_revision": "Revising document from review findings",
    "document_review": "Reviewing document",
    "job_discovery": "Discovering jobs",
    "interview_prepare": "Preparing interview questions",
    "revalidate_jobs": "Re-checking job listings",
    "scheduled_search": "Running scheduled job search",
}


def execute_task(db: Session, task: BackgroundTask) -> None:
    ctx = TaskContext(db, task)
    handler = HANDLERS.get(task.task_type)
    if not handler:
        task.status = "failed"
        task.error = "No handler is registered for this task type."
        task.finished_at = utcnow()
        db.commit()
        return
    task.progress = None
    task.progress_note = "Running"
    db.commit()
    try:
        result = handler(db, task, ctx)
        db.refresh(task)
        if task.cancel_requested_at is not None:
            task.status = "cancelled"
            task.progress_note = "Cancelled by the user"
        else:
            task.status = "completed"
            task.result = result if isinstance(result, dict) else {}
            task.progress = 100
            task.progress_note = "Completed"
        task.error = ""
        task.finished_at = utcnow()
        db.commit()
    except TaskCancelled:
        task.status = "cancelled"
        task.finished_at = utcnow()
        task.progress_note = "Cancelled by the user"
        db.commit()
    except AppError as exc:
        db.rollback()
        _fail_task(db, task, exc.message[:1000])
    except Exception as exc:  # noqa: BLE001 - worker must not die on handler failure
        db.rollback()
        logger.exception("task_handler_failed task_id=%s type=%s", task.id, task.task_type)
        _fail_task(db, task, "The task failed unexpectedly. Check the server logs for details.")


def _fail_task(db: Session, task: BackgroundTask, message: str) -> None:
    settings = get_settings()
    db.refresh(task)
    task.error = message[:2000]
    task.finished_at = utcnow()
    if task.attempts < task.max_attempts and task.cancel_requested_at is None:
        task.status = "queued"
        task.queued_at = utcnow()
        task.progress_note = f"Retrying ({task.attempts}/{task.max_attempts}) after: {message[:150]}"
    else:
        task.status = "failed"
        task.progress_note = "Failed"
    db.commit()
    if task.status == "failed" and task.user_id:
        create_notification(
            db, task.user_id, "task_failed", f"Task failed: {task.title}",
            message[:500], "/settings?tab=tasks",
        )


def run_schedule_once(db: Session) -> dict:
    """Enqueue one scheduled task per due saved search and send due reminders."""
    from app.tasks.queue import enqueue

    settings = get_settings()
    now = utcnow()
    due_searches = list(db.scalars(select(JobSearch).where(
        JobSearch.schedule_enabled.is_(True),
        JobSearch.next_run_at.is_not(None),
        JobSearch.next_run_at <= now,
    ).limit(10)).all())
    enqueued = 0
    for search in due_searches:
        if search.user_id:
            enqueue(db, search.user_id, "scheduled_search", f"Scheduled search: {search.name}",
                    {"user_id": search.user_id, "search_id": search.id},
                    dedupe_key=f"scheduled_search:{search.id}:{now.date()}")
            search.next_run_at = compute_schedule(search)
            enqueued += 1
    db.commit()

    due_reminders = list(db.scalars(select(Reminder).where(
        Reminder.completed_at.is_(None),
        Reminder.notified_at.is_(None),
        Reminder.due_at <= now,
    ).limit(50)).all())
    notified = 0
    for reminder in due_reminders:
        reminder.notified_at = now
        create_notification(
            db, reminder.user_id, "reminder", f"Reminder: {reminder.title}",
            f"Due {reminder.due_at:%Y-%m-%d %H:%M} UTC. {reminder.notes[:300]}",
            "/applications", send_email_too=bool(settings.email_configured),
        )
        notified += 1
    db.commit()
    return {"scheduled_searches": enqueued, "reminders": notified}
