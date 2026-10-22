"""Guided onboarding with resumable drafts and safe CV import."""
from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, File, UploadFile
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.errors import ValidationAppError
from app.database.base import utcnow
from app.documents.extract import extract_text, parse_resume_text
from app.models import (
    Achievement,
    CareerPreference,
    Certification,
    Education,
    JobImport,
    OnboardingDraft,
    Project,
    Skill,
    UploadedFile,
    User,
    WorkExperience,
    WritingStyleProfile,
)
from app.schemas.auth import (
    LinkMessage,
    OnboardingCompleteIn,
    OnboardingDraftIn,
    OnboardingDraftOut,
    OnboardingStatus,
)
from app.schemas.profile import (
    AchievementIn,
    CareerPreferenceIn,
    CertificationIn,
    EducationIn,
    ExperienceIn,
    ProjectIn,
    ProfileUpdate,
    SkillIn,
    WritingStyleIn,
)
from app.services.notifications import create_notification
from app.services.profile_service import (
    build_snapshot,
    compute_completeness,
    ensure_preferences,
    ensure_profile,
    ensure_writing_style,
    list_owned,
    next_sort_order,
)
from app.services.storage import delete_stored, save_upload
from app.ai.service import get_active_config

logger = logging.getLogger("careerpilot.onboarding")

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

OBJECTIVES = {
    "full_time", "remote_work", "internship", "graduate", "contract", "freelance",
    "career_change", "application_improvement", "interview_preparation", "exploration",
}


def _deep_merge(base: dict, incoming: dict) -> dict:
    """Merge nested objects so a stale tab cannot wipe another tab's fields.

    Lists are replaced wholesale: removing an experience must persist as a removal.
    """
    merged = dict(base)
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _get_draft(db, user_id: str) -> OnboardingDraft | None:
    return db.scalar(select(OnboardingDraft).where(OnboardingDraft.user_id == user_id))


def _draft_out(draft: OnboardingDraft | None) -> OnboardingDraftOut | None:
    if not draft:
        return None
    return OnboardingDraftOut(step=draft.step, data=draft.data or {}, cv_import=draft.cv_import or {},
                              updated_at=draft.updated_at, completed_at=draft.completed_at)


def _status(db, user: User) -> OnboardingStatus:
    draft = _get_draft(db, user.id)
    completeness, missing = compute_completeness(db, user.id)
    profile = ensure_profile(db, user)
    snapshot = build_snapshot(db, user)
    has_data = bool(snapshot.experiences or snapshot.skills or snapshot.education
                    or profile.summary or profile.professional_headline)
    from app.core.config import get_settings

    settings = get_settings()
    return OnboardingStatus(
        completed=user.onboarding_completed,
        step=max(user.onboarding_step, draft.step if draft else 1),
        completeness=completeness, missing=missing, has_profile_data=has_data,
        email_verified=user.email_verified,
        email_verification_required=settings.require_email_verification,
        ai_configured=get_active_config(db, user.id) is not None,
        draft=_draft_out(draft),
    )


@router.get("", response_model=OnboardingStatus)
@router.get("/status", response_model=OnboardingStatus)
async def status(user: CurrentUser, db: DbSession) -> OnboardingStatus:
    return _status(db, user)


@router.put("/draft", response_model=OnboardingDraftOut)
async def save_draft(payload: OnboardingDraftIn, user: CurrentUser, db: DbSession) -> OnboardingDraftOut:
    draft = _get_draft(db, user.id)
    if not draft:
        draft = OnboardingDraft(user_id=user.id, data={})
        db.add(draft)
    draft.data = _deep_merge(dict(draft.data or {}), payload.data or {})
    draft.step = payload.step
    if payload.step > user.onboarding_step:
        user.onboarding_step = payload.step
    db.commit()
    db.refresh(draft)
    return _draft_out(draft)


@router.post("/import-cv", response_model=dict)
async def import_cv(user: CurrentUser, db: DbSession, file: UploadFile = File(...)) -> dict:
    from app.core.config import get_settings

    settings = get_settings()
    if not file.filename:
        raise ValidationAppError("Choose a PDF or DOCX file.")
    data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise ValidationAppError(f"Files must be {settings.max_upload_mb} MB or smaller.")
    stored = save_upload(user.id, data, file.filename, file.content_type or "")
    try:
        text = extract_text(data, stored["fmt"])
        extracted = parse_resume_text(text)
    except ValidationAppError:
        delete_stored(stored["storage_path"])
        raise
    upload = UploadedFile(
        user_id=user.id, original_name=stored["original_name"],
        content_type=stored["content_type"], storage_path=stored["storage_path"],
        size_bytes=stored["size_bytes"], sha256=stored["sha256"],
        import_status="awaiting_review", extracted_text=text[:120_000],
        extracted_data=extracted,
    )
    db.add(upload)
    draft = _get_draft(db, user.id)
    if draft:
        draft.cv_import = {"upload_id": upload.id, "filename": stored["original_name"],
                           "warnings": extracted.get("warnings", []),
                           "requires_review": True}
    db.commit()
    db.refresh(upload)
    return {
        "upload_id": upload.id, "filename": stored["original_name"],
        "extracted": extracted, "warnings": extracted.get("warnings", []),
        "suggestions": extracted.get("suggestions", []),
        "message": ("Details were extracted for review. Nothing has been saved to your profile; "
                    "confirm each item you want to keep."),
        "can_apply": True,
    }


# Provenance/verification are decided by the onboarding flow, not copied from the payload,
# so they must be stripped before the validated fields are expanded into the model.
_MANAGED_FIELDS = {"provenance", "verified"}


def _prov(item: dict, default: str = "user_confirmed") -> tuple[str, bool]:
    provenance = item.get("provenance")
    if provenance not in {"user_confirmed", "imported_unconfirmed", "document_extracted",
                          "ai_suggested", "unverified", "outdated"}:
        provenance = default
    verified = item.get("verified")
    if verified is None:
        verified = provenance == "user_confirmed"
    return provenance, bool(verified)


def _parse_date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _existing_keys(db, user_id: str) -> dict:
    experiences = {(e.employer.strip().lower(), e.title.strip().lower())
                   for e in db.scalars(select(WorkExperience).where(WorkExperience.user_id == user_id))}
    education = {(e.institution.strip().lower(), (e.qualification or "").strip().lower())
                 for e in db.scalars(select(Education).where(Education.user_id == user_id))}
    skills = {s.name.strip().lower() for s in
              db.scalars(select(Skill).where(Skill.user_id == user_id))}
    projects = {p.name.strip().lower() for p in
                db.scalars(select(Project).where(Project.user_id == user_id))}
    certifications = {(c.name.strip().lower(), (c.issuer or "").strip().lower()) for c in
                      db.scalars(select(Certification).where(Certification.user_id == user_id))}
    achievements = {a.title.strip().lower() for a in
                    db.scalars(select(Achievement).where(Achievement.user_id == user_id))}
    return {"experience": experiences, "education": education, "skill": skills,
            "project": projects, "certification": certifications, "achievement": achievements}


@router.post("/complete", response_model=OnboardingStatus)
async def complete(payload: OnboardingCompleteIn, user: CurrentUser, db: DbSession) -> OnboardingStatus:
    """Persist approved onboarding data. Never overwrites existing records."""
    profile_data = payload.profile or {}
    objectives = profile_data.get("career_objectives") or payload.data.get("objectives") or []
    style_data = payload.writing_style or payload.data.get("writing_style") or {}
    clean_objectives = [str(item) for item in objectives if str(item) in OBJECTIVES][:10]

    profile_update = ProfileUpdate(**{**profile_data, "career_objectives": clean_objectives})
    profile = ensure_profile(db, user)
    for field, value in profile_update.model_dump(exclude={"career_objectives"}).items():
        setattr(profile, field, value)
    profile.career_objectives = clean_objectives
    prefs_payload = payload.preferences or {}
    if prefs_payload:
        prefs = ensure_preferences(db, user)
        validated = CareerPreferenceIn(**prefs_payload)
        for field, value in validated.model_dump().items():
            setattr(prefs, field, value)
    if style_data:
        style = ensure_writing_style(db, user)
        validated_style = WritingStyleIn(**style_data)
        for field, value in validated_style.model_dump().items():
            setattr(style, field, value)
    db.flush()

    keys = _existing_keys(db, user.id)
    counts = {"experiences": 0, "education": 0, "skills": 0, "projects": 0,
              "certifications": 0, "achievements": 0, "skipped_duplicates": 0}

    for item in payload.experiences:
        try:
            validated = ExperienceIn(**_clean_item(item))
        except Exception as exc:
            raise ValidationAppError(f"Invalid experience entry: {str(exc).splitlines()[0][:200]}")
        key = (validated.employer.strip().lower(), validated.title.strip().lower())
        if key in keys["experience"]:
            counts["skipped_duplicates"] += 1
            continue
        provenance, verified = _prov(item, item.get("provenance", "user_confirmed"))
        record = WorkExperience(
            user_id=user.id,
            **validated.model_dump(exclude={"start_date", "end_date"} | _MANAGED_FIELDS),
            start_date=validated.start_date, end_date=validated.end_date,
            provenance=provenance, verified=verified,
            sort_order=next_sort_order(db, WorkExperience, user.id),
        )
        db.add(record)
        keys["experience"].add(key)
        counts["experiences"] += 1

    for item in payload.education:
        try:
            validated = EducationIn(**_clean_item(item))
        except Exception as exc:
            raise ValidationAppError(f"Invalid education entry: {str(exc).splitlines()[0][:200]}")
        key = (validated.institution.strip().lower(), (validated.qualification or "").strip().lower())
        if key in keys["education"]:
            counts["skipped_duplicates"] += 1
            continue
        provenance, verified = _prov(item, item.get("provenance", "user_confirmed"))
        edu_data = validated.model_dump(
            exclude={"start_date", "end_date", "is_current"} | _MANAGED_FIELDS)
        if validated.is_current:
            edu_data["status"] = "in_progress"
        record = Education(
            user_id=user.id, **edu_data,
            start_date=validated.start_date, end_date=validated.end_date,
            provenance=provenance, verified=verified,
            sort_order=next_sort_order(db, Education, user.id),
        )
        db.add(record)
        keys["education"].add(key)
        counts["education"] += 1

    for item in payload.skills:
        try:
            validated = SkillIn(**_clean_item(item))
        except Exception as exc:
            raise ValidationAppError(f"Invalid skill: {str(exc).splitlines()[0][:200]}")
        if validated.name.strip().lower() in keys["skill"]:
            counts["skipped_duplicates"] += 1
            continue
        provenance, verified = _prov(item, item.get("provenance", "user_confirmed"))
        db.add(Skill(
            user_id=user.id, **validated.model_dump(exclude={"last_used"} | _MANAGED_FIELDS),
            last_used=validated.last_used, provenance=provenance, verified=verified,
        ))
        keys["skill"].add(validated.name.strip().lower())
        counts["skills"] += 1

    for item in payload.projects:
        try:
            validated = ProjectIn(**_clean_item(item))
        except Exception as exc:
            raise ValidationAppError(f"Invalid project: {str(exc).splitlines()[0][:200]}")
        if validated.name.strip().lower() in keys["project"]:
            counts["skipped_duplicates"] += 1
            continue
        provenance, verified = _prov(item, item.get("provenance", "user_confirmed"))
        db.add(Project(
            user_id=user.id, **validated.model_dump(
                exclude={"start_date", "end_date", "is_current"} | _MANAGED_FIELDS),
            start_date=validated.start_date, end_date=validated.end_date,
            provenance=provenance, verified=verified,
            sort_order=next_sort_order(db, Project, user.id),
        ))
        keys["project"].add(validated.name.strip().lower())
        counts["projects"] += 1

    for item in payload.certifications:
        try:
            validated = CertificationIn(**_clean_item(item))
        except Exception as exc:
            raise ValidationAppError(f"Invalid certification: {str(exc).splitlines()[0][:200]}")
        key = (validated.name.strip().lower(), (validated.issuer or "").strip().lower())
        if key in keys["certification"]:
            counts["skipped_duplicates"] += 1
            continue
        provenance, verified = _prov(item, item.get("provenance", "user_confirmed"))
        db.add(Certification(
            user_id=user.id, **validated.model_dump(exclude=_MANAGED_FIELDS),
            provenance=provenance, verified=verified,
            sort_order=next_sort_order(db, Certification, user.id),
        ))
        keys["certification"].add(key)
        counts["certifications"] += 1

    for item in payload.achievements:
        try:
            validated = AchievementIn(**_clean_item(item))
        except Exception as exc:
            raise ValidationAppError(f"Invalid achievement: {str(exc).splitlines()[0][:200]}")
        if validated.title.strip().lower() in keys["achievement"]:
            counts["skipped_duplicates"] += 1
            continue
        provenance, verified = _prov(item, item.get("provenance", "user_confirmed"))
        db.add(Achievement(
            user_id=user.id, **validated.model_dump(exclude=_MANAGED_FIELDS),
            provenance=provenance, verified=verified,
            sort_order=next_sort_order(db, Achievement, user.id),
        ))
        keys["achievement"].add(validated.title.strip().lower())
        counts["achievements"] += 1

    upload_id = (payload.cv_import or {}).get("upload_id") or \
        (payload.data.get("cv_import") or {}).get("upload_id")
    if upload_id:
        upload = db.get(UploadedFile, upload_id)
        if upload and upload.user_id == user.id:
            upload.import_status = "applied_and_reviewed"

    user.onboarding_completed = True
    user.onboarding_step = 11
    draft = _get_draft(db, user.id)
    if draft:
        draft.completed_at = utcnow()
        draft.step = 11
        draft.cv_import = {**(draft.cv_import or {}), "applied_at": utcnow().isoformat()}
    db.commit()
    compute_completeness(db, user.id)
    create_notification(
        db, user.id, "onboarding",
        "Welcome to CareerPilot AI",
        "Your career profile is ready. Add a job or run a discovery search to see your first match report.",
        "/dashboard",
    )
    db.commit()
    logger.info("onboarding_completed user=%s counts=%s", user.id, counts)
    status_payload = _status(db, user)
    status_payload.missing = status_payload.missing[:10]
    return status_payload


def _clean_item(item: dict) -> dict:
    """Drop keys that are not part of validated input schemas and normalize dates."""
    allowed_common = {"provenance", "verified"}
    output = {key: value for key, value in (item or {}).items()
              if key not in {"id", "created_at", "updated_at", "user_id", "sort_order"}
              and value is not None or key in allowed_common}
    for key in ("start_date", "end_date", "issue_date", "expiry_date", "date", "last_used"):
        if key in output:
            output[key] = _parse_date(output[key])
    return output


@router.get("/imports", response_model=list[dict])
async def list_imports(user: CurrentUser, db: DbSession) -> list[dict]:
    uploads = list(db.scalars(select(UploadedFile).where(
        UploadedFile.user_id == user.id).order_by(UploadedFile.created_at.desc())).all())
    return [{
        "id": upload.id, "filename": upload.original_name, "status": upload.import_status,
        "size_bytes": upload.size_bytes, "created_at": upload.created_at,
        "extracted": upload.extracted_data,
    } for upload in uploads]
