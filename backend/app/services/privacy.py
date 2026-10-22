"""User data export and privacy disclosures."""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.service import get_active_config
from app.core.config import get_settings
from app.database.base import utcnow
from app.models import (
    Achievement,
    AIProviderConfiguration,
    AIUsageRecord,
    Application,
    ApplicationEvent,
    ApplicationStrategy,
    BackgroundTask,
    CareerPreference,
    Certification,
    Document,
    DocumentFile,
    DocumentReview,
    DocumentVersion,
    Education,
    InterviewAnswer,
    InterviewNote,
    InterviewQuestion,
    InterviewSession,
    JobImport,
    JobListing,
    JobMatch,
    JobSearch,
    JobSource,
    MasterCV,
    Notification,
    OnboardingDraft,
    Project,
    Reminder,
    Skill,
    UploadedFile,
    User,
    UserFeedback,
    UserProfile,
    WorkExperience,
    WritingStyleProfile,
)


def _json(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json(item) for item in value]
    return value


def _fields(obj, exclude: set[str]) -> dict:
    if obj is None:
        return {}
    data = {}
    for column in obj.__table__.columns:
        if column.name in exclude:
            continue
        data[column.name] = _json(getattr(obj, column.name))
    return data


def export_user_data(db: Session, user: User) -> dict:
    settings = get_settings()
    user_id = user.id
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
    prefs = db.scalar(select(CareerPreference).where(CareerPreference.user_id == user_id))
    style = db.scalar(select(WritingStyleProfile).where(WritingStyleProfile.user_id == user_id))
    master = db.scalar(select(MasterCV).where(MasterCV.user_id == user_id))
    draft = db.scalar(select(OnboardingDraft).where(OnboardingDraft.user_id == user_id))

    documents = list(db.scalars(select(Document).where(Document.user_id == user_id)).all())
    doc_rows = []
    for document in documents:
        versions = list(db.scalars(select(DocumentVersion).where(
            DocumentVersion.document_id == document.id)).all())
        reviews = list(db.scalars(select(DocumentReview).where(
            DocumentReview.document_id == document.id)).all())
        files = list(db.scalars(select(DocumentFile).where(
            DocumentFile.document_id == document.id)).all())
        doc_rows.append({
            **_fields(document, set()),
            "versions": [_fields(v, set()) for v in versions],
            "reviews": [_fields(r, set()) for r in reviews],
            "files": [_fields(f, {"storage_path"}) for f in files],
        })

    jobs = list(db.scalars(select(JobListing).where(JobListing.user_id == user_id)).all())
    job_rows = []
    for job in jobs:
        match = db.scalar(select(JobMatch).where(
            JobMatch.user_id == user_id, JobMatch.job_id == job.id))
        job_rows.append({**_fields(job, set()),
                         "match": _fields(match, set()) if match else None,
                         "strategies": [_fields(s, set()) for s in db.scalars(
                             select(ApplicationStrategy).where(
                                 ApplicationStrategy.user_id == user_id,
                                 ApplicationStrategy.job_id == job.id)).all()]})

    applications = list(db.scalars(select(Application).where(
        Application.user_id == user_id)).all())
    application_rows = []
    for application in applications:
        events = list(db.scalars(select(ApplicationEvent).where(
            ApplicationEvent.application_id == application.id)).all())
        application_rows.append({**_fields(application, set()),
                                 "events": [_fields(e, set()) for e in events]})

    sessions = list(db.scalars(select(InterviewSession).where(
        InterviewSession.user_id == user_id)).all())
    interview_rows = []
    for session in sessions:
        questions = list(db.scalars(select(InterviewQuestion).where(
            InterviewQuestion.session_id == session.id)).all())
        interview_rows.append({
            **_fields(session, set()),
            "questions": [{**_fields(q, set()),
                           "answer": _fields(q.answer, set()) if q.answer else None}
                          for q in questions],
        })

    configs = list(db.scalars(select(AIProviderConfiguration).where(
        AIProviderConfiguration.user_id == user_id)).all())
    usage = list(db.scalars(select(AIUsageRecord).where(
        AIUsageRecord.user_id == user_id)).all())
    tasks = list(db.scalars(select(BackgroundTask).where(
        BackgroundTask.user_id == user_id)).all())
    notifications = list(db.scalars(select(Notification).where(
        Notification.user_id == user_id)).all())
    feedback = list(db.scalars(select(UserFeedback).where(
        UserFeedback.user_id == user_id)).all())
    uploads = list(db.scalars(select(UploadedFile).where(
        UploadedFile.user_id == user_id)).all())

    export = {
        "generated_at": utcnow().isoformat(),
        "format": "careerpilot-export-v1",
        "user": _fields(user, {"password_hash", "token_version"}),
        "profile": _fields(profile, set()),
        "onboarding_draft": _fields(draft, set()),
        "experiences": [_fields(e, set()) for e in db.scalars(
            select(WorkExperience).where(WorkExperience.user_id == user_id)).all()],
        "education": [_fields(e, set()) for e in db.scalars(
            select(Education).where(Education.user_id == user_id)).all()],
        "skills": [_fields(s, set()) for s in db.scalars(
            select(Skill).where(Skill.user_id == user_id)).all()],
        "projects": [_fields(p, set()) for p in db.scalars(
            select(Project).where(Project.user_id == user_id)).all()],
        "certifications": [_fields(c, set()) for c in db.scalars(
            select(Certification).where(Certification.user_id == user_id)).all()],
        "achievements": [_fields(a, set()) for a in db.scalars(
            select(Achievement).where(Achievement.user_id == user_id)).all()],
        "preferences": _fields(prefs, set()),
        "writing_style": _fields(style, set()),
        "master_cv": _fields(master, set()),
        "documents": doc_rows,
        "uploaded_files": [_fields(u, {"storage_path"}) for u in uploads],
        "job_sources": [_fields(s, set()) for s in db.scalars(
            select(JobSource).where(JobSource.user_id == user_id)).all()],
        "jobs": job_rows,
        "job_imports": [_fields(i, {"raw_excerpt"}) for i in db.scalars(
            select(JobImport).where(JobImport.user_id == user_id)).all()],
        "saved_searches": [_fields(s, set()) for s in db.scalars(
            select(JobSearch).where(JobSearch.user_id == user_id)).all()],
        "applications": application_rows,
        "interviews": interview_rows,
        "interview_notes": [_fields(n, set()) for n in db.scalars(
            select(InterviewNote).where(InterviewNote.user_id == user_id)).all()],
        "reminders": [_fields(r, set()) for r in db.scalars(
            select(Reminder).where(Reminder.user_id == user_id)).all()],
        "tasks": [_fields(t, set()) for t in tasks],
        "notifications": [_fields(n, set()) for n in notifications],
        "ai_configurations": [_fields(c, {"api_key_ciphertext"}) for c in configs],
        "ai_usage": [_fields(u, set()) for u in usage],
        "feedback": [_fields(f, set()) for f in feedback],
        "privacy": privacy_summary(db),
        "notes": [
            "Passwords, session tokens, one-time security tokens and encrypted API keys are "
            "deliberately excluded from this export.",
            "Document files themselves are not embedded; their metadata is listed. Download files "
            "from the Documents library while signed in.",
            f"Export generated {utcnow().isoformat()} UTC.",
        ],
    }
    export["exported_counts"] = {
        "experiences": len(export["experiences"]), "education": len(export["education"]),
        "skills": len(export["skills"]), "projects": len(export["projects"]),
        "documents": len(documents), "jobs": len(jobs), "applications": len(applications),
        "interviews": len(sessions), "reminders": len(export["reminders"]),
        "notifications": len(notifications), "tasks": len(tasks),
    }
    export["active_ai"] = _fields(get_active_config(db, user_id), {"api_key_ciphertext"})
    export["settings"] = {
        "email_verification_required": settings.require_email_verification,
        "email_configured": settings.email_configured,
        "ai_private_endpoints_allowed": settings.ai_allow_private_endpoints,
        "storage": "Private server-side storage (not publicly accessible).",
    }
    return export


def privacy_summary(db: Session | None = None) -> dict:
    settings = get_settings()
    return {
        "data_categories": [
            {"category": "Account", "data": "Email, display name, password hash, session metadata",
             "purpose": "Authentication and account security"},
            {"category": "Career profile", "data": "Experience, education, skills, projects, links, "
             "preferences, writing style", "purpose": "Powering career features you request"},
            {"category": "Jobs and applications", "data": "Saved jobs, match results, applications, "
             "reminders, notes", "purpose": "Job discovery and tracking"},
            {"category": "Documents", "data": "Master CV, tailored documents, review findings, exports",
             "purpose": "Document preparation you initiate"},
            {"category": "AI metadata", "data": "Provider label, model, token usage, error codes",
             "purpose": "Cost transparency and troubleshooting"},
            {"category": "Background tasks", "data": "Task type, status, errors, results",
             "purpose": "Reliable long-running operations"},
        ],
        "retention": ("Career data is stored until you delete it. Account deletion removes your "
                      "profile, jobs, documents, applications and files. Database backups held by a "
                      "managed provider follow that provider's retention window and are not "
                      "controlled by this application."),
        "account_deletion": "Immediate and irreversible once confirmed with your password.",
        "ai_transmission": ("Nothing is sent to an AI provider until you configure one and use an "
                            "AI-powered action. Only the profile evidence and job text needed for that "
                            "task are sent. Deterministic matching, tracking and exports never call AI."),
        "export_available": True,
        "email_configured": settings.email_configured,
        "email_note": ("Transactional email is only sent when an SMTP provider is configured. "
                       "In-app notifications always work."),
        "storage_note": ("Uploaded CVs and generated files are stored privately on the server; "
                         "they are only downloadable through authenticated, expiring links."),
    }
