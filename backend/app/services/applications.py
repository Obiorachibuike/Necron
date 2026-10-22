"""Application tracker: records, timeline, reminders and analytics from real data."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError, ValidationAppError
from app.database.base import utcnow
from app.models import (
    APPLICATION_STATUSES,
    Application,
    ApplicationEvent,
    Document,
    InterviewSession,
    JobListing,
    Reminder,
    User,
)

RESPONSE_STATUSES = {"assessment", "interview", "offer", "rejected"}
ACTIVE_STATUSES = {"saved", "planning", "documents_in_progress", "ready_to_apply", "applied",
                   "assessment", "interview"}


def application_owned_or_404(db: Session, user_id: str, application_id: str) -> Application:
    application = db.get(Application, application_id)
    if not application or application.user_id != user_id:
        raise NotFoundError("Application not found")
    return application


def reminder_owned_or_404(db: Session, user_id: str, reminder_id: str) -> Reminder:
    reminder = db.get(Reminder, reminder_id)
    if not reminder or reminder.user_id != user_id:
        raise NotFoundError("Reminder not found")
    return reminder


def _assert_document(db: Session, user_id: str, document_id: str | None, expected: str) -> Document | None:
    if not document_id:
        return None
    document = db.get(Document, document_id)
    if not document or document.user_id != user_id:
        raise NotFoundError("Linked document not found")
    if document.doc_type != expected:
        raise ValidationAppError(f"That document is not a {expected.replace('_', ' ')}.")
    return document


def create_application(db: Session, user: User, data: dict) -> Application:
    job = None
    if data.get("job_id"):
        job = db.get(JobListing, data["job_id"])
        if not job or job.user_id != user.id:
            raise NotFoundError("Linked job not found")
    cv = _assert_document(db, user.id, data.get("cv_document_id"), "cv")
    letter = _assert_document(db, user.id, data.get("cover_letter_document_id"), "cover_letter")
    company = (data.get("company") or (job.company if job else "")).strip()
    role = (data.get("role_title") or (job.title if job else "")).strip()
    if not company or not role:
        raise ValidationAppError("Provide both a company and a role.")
    application = Application(
        user_id=user.id,
        job_id=job.id if job else None,
        company=company[:250],
        role_title=role[:250],
        location=(data.get("location") or (job.location if job else ""))[:250],
        status=data.get("status", "saved"),
        source=(data.get("source") or (job.provider if job else "manual"))[:120],
        application_url=(data.get("application_url") or (job.apply_url if job else ""))[:2000],
        applied_at=data.get("applied_at"),
        deadline_at=data.get("deadline_at"),
        next_action_at=data.get("next_action_at"),
        next_action_note=data.get("next_action_note", "")[:400],
        notes=data.get("notes", "")[:20_000],
        salary_expectation=data.get("salary_expectation"),
        cv_document_id=cv.id if cv else None,
        cover_letter_document_id=letter.id if letter else None,
        status_changed_at=utcnow(),
    )
    if application.status == "applied" and not application.applied_at:
        application.applied_at = utcnow()
    db.add(application)
    db.flush()
    db.add(ApplicationEvent(
        user_id=user.id, application_id=application.id, event_type="created",
        from_status="", to_status=application.status,
        note="Application added to the tracker", occurred_at=utcnow(),
    ))
    for document in (cv, letter):
        if document:
            document.application_id = application.id
    db.commit()
    db.refresh(application)
    return application


def update_application(db: Session, user: User, application: Application, data: dict) -> Application:
    allowed = {
        "company": 250, "role_title": 250, "location": 250, "custom_status": 80,
        "source": 120, "application_url": 2000, "next_action_note": 400,
        "notes": 20_000, "outcome": 60,
    }
    for field, limit in allowed.items():
        if field in data and data[field] is not None:
            setattr(application, field, str(data[field])[:limit])
    for field in ("applied_at", "deadline_at", "next_action_at"):
        if field in data:
            setattr(application, field, data[field])
    if "salary_expectation" in data:
        application.salary_expectation = data["salary_expectation"]
    if data.get("cv_document_id") is not None:
        cv = _assert_document(db, user.id, data["cv_document_id"], "cv")
        application.cv_document_id = cv.id if cv else None
        if cv:
            cv.application_id = application.id
    if data.get("cover_letter_document_id") is not None:
        letter = _assert_document(db, user.id, data["cover_letter_document_id"], "cover_letter")
        application.cover_letter_document_id = letter.id if letter else None
        if letter:
            letter.application_id = application.id
    new_status = data.get("status")
    if new_status and new_status != application.status:
        change_status(db, user, application, new_status, data.get("status_note", ""), commit=False)
    db.commit()
    db.refresh(application)
    return application


def change_status(db: Session, user: User, application: Application, new_status: str,
                  note: str = "", *, commit: bool = True) -> Application:
    if new_status not in APPLICATION_STATUSES:
        raise ValidationAppError("Unknown application status")
    previous = application.status
    if previous == new_status:
        if note:
            db.add(ApplicationEvent(
                user_id=user.id, application_id=application.id, event_type="note",
                from_status=previous, to_status=new_status, note=note[:1000],
                occurred_at=utcnow(),
            ))
            db.commit()
        return application
    application.status = new_status
    application.status_changed_at = utcnow()
    if new_status == "applied" and not application.applied_at:
        application.applied_at = utcnow()
    if new_status in {"offer", "rejected", "withdrawn", "closed"} and not application.outcome:
        application.outcome = new_status
    db.add(ApplicationEvent(
        user_id=user.id, application_id=application.id, event_type="status_change",
        from_status=previous, to_status=new_status, note=note[:1000], occurred_at=utcnow(),
    ))
    if commit:
        db.commit()
        db.refresh(application)
    return application


def delete_application(db: Session, application: Application) -> None:
    db.delete(application)
    db.commit()


def add_event_note(db: Session, user: User, application: Application, note: str) -> ApplicationEvent:
    event = ApplicationEvent(
        user_id=user.id, application_id=application.id, event_type="note",
        from_status=application.status, to_status=application.status, note=note[:2000],
        occurred_at=utcnow(),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_applications(db: Session, user_id: str, *, status: str | None = None,
                      search: str = "", limit: int = 100, offset: int = 0) -> tuple[list[Application], int]:
    stmt = select(Application).where(Application.user_id == user_id)
    if status:
        stmt = stmt.where(Application.status == status)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(Application.company.ilike(like), Application.role_title.ilike(like),
                              Application.notes.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(db.scalars(stmt.order_by(Application.updated_at.desc()).limit(limit).offset(offset)).all())
    return items, int(total)


def application_detail(db: Session, application: Application) -> dict:
    events = list(db.scalars(select(ApplicationEvent).where(
        ApplicationEvent.application_id == application.id
    ).order_by(ApplicationEvent.occurred_at.desc())).all())
    reminders = list(db.scalars(select(Reminder).where(
        Reminder.application_id == application.id
    ).order_by(Reminder.due_at.asc())).all())
    now = utcnow()
    return {
        **application_out(application),
        "events": [{"id": e.id, "event_type": e.event_type, "from_status": e.from_status,
                    "to_status": e.to_status, "note": e.note, "occurred_at": e.occurred_at}
                   for e in events],
        "reminders": [reminder_out(r, now) for r in reminders],
    }


def reminder_out(reminder: Reminder, now: datetime | None = None) -> dict:
    now = now or utcnow()
    return {
        "id": reminder.id, "application_id": reminder.application_id, "kind": reminder.kind,
        "title": reminder.title, "due_at": reminder.due_at,
        "completed_at": reminder.completed_at, "notified_at": reminder.notified_at,
        "notes": reminder.notes, "created_at": reminder.created_at,
        "overdue": bool(not reminder.completed_at and reminder.due_at < now),
    }


def application_out(application: Application) -> dict:
    now = utcnow()
    return {
        "id": application.id, "job_id": application.job_id, "company": application.company,
        "role_title": application.role_title, "location": application.location,
        "status": application.status, "custom_status": application.custom_status,
        "source": application.source, "application_url": application.application_url,
        "applied_at": application.applied_at, "deadline_at": application.deadline_at,
        "next_action_at": application.next_action_at,
        "next_action_note": application.next_action_note, "notes": application.notes,
        "outcome": application.outcome, "salary_expectation": application.salary_expectation,
        "cv_document_id": application.cv_document_id,
        "cover_letter_document_id": application.cover_letter_document_id,
        "status_changed_at": application.status_changed_at,
        "created_at": application.created_at, "updated_at": application.updated_at,
        "reminder_count": len([r for r in (application.reminders or [])
                               if not r.completed_at]),
        "next_reminder_at": min((r.due_at for r in (application.reminders or [])
                                 if not r.completed_at), default=None),
        "overdue": bool(application.deadline_at and application.deadline_at < now
                        and application.status in ACTIVE_STATUSES),
    }


def create_reminder(db: Session, user_id: str, data: dict) -> Reminder:
    application_id = data.get("application_id")
    if application_id:
        application_owned_or_404(db, user_id, application_id)
    reminder = Reminder(
        user_id=user_id, application_id=application_id, kind=data.get("kind", "follow_up"),
        title=data["title"][:300], due_at=data["due_at"], notes=data.get("notes", "")[:4000],
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return reminder


def list_reminders(db: Session, user_id: str, *, include_completed: bool = False,
                   limit: int = 100) -> list[Reminder]:
    stmt = select(Reminder).where(Reminder.user_id == user_id)
    if not include_completed:
        stmt = stmt.where(Reminder.completed_at.is_(None))
    return list(db.scalars(stmt.order_by(Reminder.due_at.asc()).limit(limit)).all())


def update_reminder(db: Session, reminder: Reminder, data: dict) -> Reminder:
    if data.get("title") is not None:
        reminder.title = str(data["title"])[:300]
    if data.get("due_at") is not None:
        reminder.due_at = data["due_at"]
    if data.get("notes") is not None:
        reminder.notes = str(data["notes"])[:4000]
    if data.get("completed") is not None:
        reminder.completed_at = utcnow() if data["completed"] else None
    db.commit()
    db.refresh(reminder)
    return reminder


def delete_reminder(db: Session, reminder: Reminder) -> None:
    db.delete(reminder)
    db.commit()


def application_stats(db: Session, user_id: str) -> dict:
    applications = list(db.scalars(select(Application).where(
        Application.user_id == user_id)).all())
    now = utcnow()
    by_status = {status: 0 for status in APPLICATION_STATUSES}
    for application in applications:
        by_status[application.status] = by_status.get(application.status, 0) + 1
    applied = [a for a in applications if a.applied_at is not None]
    events = list(db.scalars(select(ApplicationEvent).where(
        ApplicationEvent.user_id == user_id,
        ApplicationEvent.to_status.in_(RESPONSE_STATUSES),
    )).all())
    responded_ids = {event.application_id for event in events}
    responded_ids |= {a.id for a in applications if a.status in RESPONSE_STATUSES}
    responses = len(responded_ids)
    response_rate = round(responses / len(applied) * 100, 1) if applied else None
    upcoming = sorted(
        [a for a in applications
         if a.status in ACTIVE_STATUSES and (
             (a.deadline_at and now <= a.deadline_at <= now + timedelta(days=30)) or
             (a.next_action_at and now - timedelta(days=1) <= a.next_action_at <= now + timedelta(days=30)))],
        key=lambda a: a.deadline_at or a.next_action_at or now,
    )[:8]
    # Weekly activity from real creation and application dates.
    weeks = []
    for index in range(7, -1, -1):
        start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0,
                                                             microsecond=0) - timedelta(weeks=index)
        end = start + timedelta(weeks=1)
        weeks.append({
            "week_start": start.date().isoformat(),
            "added": len([a for a in applications if start <= a.created_at < end]),
            "applied": len([a for a in applied if start <= (a.applied_at or now) < end]),
            "responses": len([e for e in events if start <= e.occurred_at < end]),
        })
    source_counts: dict[str, int] = {}
    for application in applications:
        label = (application.source or "manual").strip().title()
        source_counts[label] = source_counts.get(label, 0) + 1
    source_breakdown = [{"source": source, "count": count}
                        for source, count in sorted(source_counts.items(), key=lambda i: -i[1])]
    return {
        "total": len(applications), "by_status": by_status,
        "active": len([a for a in applications if a.status in ACTIVE_STATUSES]),
        "interviews": by_status.get("interview", 0), "offers": by_status.get("offer", 0),
        "responses": responses, "response_rate": response_rate,
        "upcoming": [application_out(a) for a in upcoming],
        "weekly_activity": weeks, "source_breakdown": source_breakdown,
    }


def calendar_items(db: Session, user_id: str, start: datetime, end: datetime) -> list[dict]:
    items: list[dict] = []
    for application in db.scalars(select(Application).where(Application.user_id == user_id)).all():
        if application.deadline_at and start <= application.deadline_at <= end:
            items.append({"kind": "deadline", "title": f"Deadline: {application.role_title}",
                          "company": application.company, "at": application.deadline_at,
                          "application_id": application.id})
        if application.next_action_at and start <= application.next_action_at <= end:
            items.append({"kind": "next_action", "title": application.next_action_note or
                          f"Next action: {application.role_title}",
                          "company": application.company, "at": application.next_action_at,
                          "application_id": application.id})
    for reminder in db.scalars(select(Reminder).where(
            Reminder.user_id == user_id, Reminder.completed_at.is_(None),
            Reminder.due_at >= start, Reminder.due_at <= end)).all():
        items.append({"kind": "reminder", "title": reminder.title,
                      "company": "", "at": reminder.due_at,
                      "application_id": reminder.application_id, "reminder_id": reminder.id})
    for session in db.scalars(select(InterviewSession).where(
            InterviewSession.user_id == user_id,
            InterviewSession.completed_at.is_not(None),
            InterviewSession.completed_at >= start,
            InterviewSession.completed_at <= end)).all():
        items.append({"kind": "interview_session", "title": session.title or "Mock interview",
                      "company": "", "at": session.completed_at,
                      "session_id": session.id})
    items.sort(key=lambda item: item["at"])
    return items
