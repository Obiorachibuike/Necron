"""Career knowledge base API: profile, experience, education, skills and more."""
from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.errors import NotFoundError
from app.models import (
    Achievement,
    Certification,
    Education,
    Project,
    Skill,
    WorkExperience,
)
from app.schemas.common import AppSchema, MessageResponse
from app.schemas.profile import (
    AchievementIn,
    AchievementOut,
    CareerPreferenceIn,
    CareerPreferenceOut,
    CertificationIn,
    CertificationOut,
    CorrectionIn,
    CVImportReview,
    EducationIn,
    EducationOut,
    ExperienceIn,
    ExperienceOut,
    ProfileBundle,
    ProfileOut,
    ProfileSummary,
    ProfileUpdate,
    ProjectIn,
    ProjectOut,
    SkillIn,
    SkillOut,
    VerifyEntitiesRequest,
    WritingStyleIn,
    WritingStyleOut,
)
from app.services.profile_service import (
    MODEL_BY_ENTITY,
    build_snapshot,
    compute_completeness,
    ensure_preferences,
    ensure_profile,
    ensure_writing_style,
    list_owned,
    next_sort_order,
    record_correction,
    unverified_counts,
    verified_skills,
)

router = APIRouter(prefix="/profile", tags=["career profile"])

ENTITY_MODELS = {
    "experiences": ("experience", WorkExperience),
    "education": ("education", Education),
    "skills": ("skill", Skill),
    "projects": ("project", Project),
    "certifications": ("certification", Certification),
    "achievements": ("achievement", Achievement),
}


def _owned(db, model, user_id: str, entity_id: str):
    record = db.get(model, entity_id)
    if not record or record.user_id != user_id:
        raise NotFoundError("Record not found")
    return record


def _summary(db, user) -> ProfileSummary:
    profile = ensure_profile(db, user)
    snapshot = build_snapshot(db, user)
    completeness, missing = compute_completeness(db, user.id)
    return ProfileSummary(
        profile=ProfileOut.model_validate(profile),
        experience_count=len(snapshot.experiences),
        education_count=len(snapshot.education),
        skill_count=len(snapshot.skills),
        project_count=len(snapshot.projects),
        certification_count=len(snapshot.certifications),
        achievement_count=len(snapshot.achievements),
        verified_experience_count=len([e for e in snapshot.experiences if e.verified]),
        unverified_items=unverified_counts(db, user.id),
        completeness=completeness,
        missing_recommendations=missing,
        career_objectives=profile.career_objectives or [],
    )


@router.get("", response_model=ProfileBundle)
async def get_profile(user: CurrentUser, db: DbSession) -> ProfileBundle:
    profile = ensure_profile(db, user)
    prefs = ensure_preferences(db, user)
    style = ensure_writing_style(db, user)
    snapshot = build_snapshot(db, user)
    completeness, missing = compute_completeness(db, user.id)
    counts = {}
    for key, model in (("experience", WorkExperience), ("education", Education), ("skill", Skill),
                       ("project", Project), ("certification", Certification),
                       ("achievement", Achievement)):
        counts[key] = len([record for record in getattr(snapshot, {
            "experience": "experiences", "education": "education", "skill": "skills",
            "project": "projects", "certification": "certifications",
            "achievement": "achievements"}[key]) if not record.verified])
    return ProfileBundle(
        profile=ProfileOut.model_validate(profile),
        experiences=[ExperienceOut.model_validate(x) for x in snapshot.experiences],
        education=[EducationOut.model_validate(x) for x in snapshot.education],
        skills=[SkillOut.model_validate(x) for x in snapshot.skills],
        projects=[ProjectOut.model_validate(x) for x in snapshot.projects],
        certifications=[CertificationOut.model_validate(x) for x in snapshot.certifications],
        achievements=[AchievementOut.model_validate(x) for x in snapshot.achievements],
        preferences=CareerPreferenceOut.model_validate(prefs) if prefs else None,
        writing_style=WritingStyleOut.model_validate(style) if style else None,
        completeness=completeness, missing=missing,
        summary=_summary(db, user), unverified_counts=counts,
    )


@router.patch("", response_model=ProfileOut)
async def update_profile(payload: ProfileUpdate, user: CurrentUser, db: DbSession) -> ProfileOut:
    profile = ensure_profile(db, user)
    for field, value in payload.model_dump().items():
        setattr(profile, field, value)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(profile)
    return ProfileOut.model_validate(profile)


@router.get("/summary", response_model=ProfileSummary)
async def summary(user: CurrentUser, db: DbSession) -> ProfileSummary:
    return _summary(db, user)


@router.get("/completeness", response_model=dict)
async def completeness(user: CurrentUser, db: DbSession) -> dict:
    score, missing = compute_completeness(db, user.id)
    return {"completeness": score, "missing": missing}


@router.get("/verified-skills", response_model=list[SkillOut])
async def verified_skill_list(user: CurrentUser, db: DbSession) -> list[SkillOut]:
    return [SkillOut.model_validate(s) for s in verified_skills(db, user.id)]


@router.put("/preferences", response_model=CareerPreferenceOut)
async def update_preferences(payload: CareerPreferenceIn, user: CurrentUser,
                             db: DbSession) -> CareerPreferenceOut:
    prefs = ensure_preferences(db, user)
    for field, value in payload.model_dump().items():
        setattr(prefs, field, value)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(prefs)
    return CareerPreferenceOut.model_validate(prefs)


@router.put("/writing-style", response_model=WritingStyleOut)
async def update_writing_style(payload: WritingStyleIn, user: CurrentUser,
                               db: DbSession) -> WritingStyleOut:
    style = ensure_writing_style(db, user)
    for field, value in payload.model_dump().items():
        setattr(style, field, value)
    db.commit()
    db.refresh(style)
    return WritingStyleOut.model_validate(style)


class ReorderRequest(AppSchema):
    entity_type: str = Field(pattern="^(experience|education|skill|project|certification|achievement)$")
    ordered_ids: list[str] = Field(min_length=1, max_length=200)


@router.post("/reorder", response_model=MessageResponse)
async def reorder(payload: ReorderRequest, user: CurrentUser, db: DbSession) -> MessageResponse:
    model = MODEL_BY_ENTITY[payload.entity_type]
    records = {record.id: record for record in db.scalars(
        select(model).where(model.user_id == user.id)).all()}
    position = 0
    for entity_id in payload.ordered_ids:
        record = records.get(entity_id)
        if record:
            record.sort_order = position
            position += 1
    db.commit()
    return MessageResponse(message="Order updated.")


@router.post("/verify", response_model=MessageResponse)
async def verify_entities(payload: VerifyEntitiesRequest, user: CurrentUser,
                          db: DbSession) -> MessageResponse:
    model = MODEL_BY_ENTITY[payload.entity_type]
    records = list(db.scalars(select(model).where(
        model.user_id == user.id, model.id.in_(payload.entity_ids))).all())
    for record in records:
        record.verified = payload.verified
        if payload.verified and record.provenance in {"imported_unconfirmed", "document_extracted",
                                                      "ai_suggested", "unverified"}:
            record.provenance = "user_confirmed"
    db.commit()
    compute_completeness(db, user.id)
    return MessageResponse(message=f"{len(records)} record(s) updated.")


@router.post("/corrections", response_model=MessageResponse)
async def add_correction(payload: CorrectionIn, user: CurrentUser, db: DbSession) -> MessageResponse:
    record_correction(db, user.id, payload.entity_type, payload.entity_id, payload.field,
                      payload.previous_value, payload.new_value, payload.reason)
    db.commit()
    return MessageResponse(message="Correction recorded.")


# --------------------------------------------------------------------------- experiences


@router.post("/experiences", response_model=ExperienceOut, status_code=201)
async def create_experience(payload: ExperienceIn, user: CurrentUser, db: DbSession) -> ExperienceOut:
    record = WorkExperience(user_id=user.id, **payload.model_dump(),
                            sort_order=next_sort_order(db, WorkExperience, user.id))
    db.add(record)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(record)
    return ExperienceOut.model_validate(record)


@router.put("/experiences/{entity_id}", response_model=ExperienceOut)
async def update_experience(entity_id: str, payload: ExperienceIn, user: CurrentUser,
                            db: DbSession) -> ExperienceOut:
    record = _owned(db, WorkExperience, user.id, entity_id)
    for field, value in payload.model_dump().items():
        setattr(record, field, value)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(record)
    return ExperienceOut.model_validate(record)


@router.delete("/experiences/{entity_id}", response_model=MessageResponse)
async def delete_experience(entity_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    record = _owned(db, WorkExperience, user.id, entity_id)
    db.delete(record)
    db.commit()
    compute_completeness(db, user.id)
    return MessageResponse(message="Experience deleted.")


# --------------------------------------------------------------------------- education


@router.post("/education", response_model=EducationOut, status_code=201)
async def create_education(payload: EducationIn, user: CurrentUser, db: DbSession) -> EducationOut:
    data = payload.model_dump()
    is_current = data.pop("is_current", False)
    if is_current:
        data["status"] = "in_progress"
    record = Education(user_id=user.id, **data,
                       sort_order=next_sort_order(db, Education, user.id))
    db.add(record)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(record)
    return EducationOut.model_validate(record)


@router.put("/education/{entity_id}", response_model=EducationOut)
async def update_education(entity_id: str, payload: EducationIn, user: CurrentUser,
                           db: DbSession) -> EducationOut:
    record = _owned(db, Education, user.id, entity_id)
    data = payload.model_dump()
    is_current = data.pop("is_current", False)
    if is_current:
        data["status"] = "in_progress"
    for field, value in data.items():
        setattr(record, field, value)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(record)
    return EducationOut.model_validate(record)


@router.delete("/education/{entity_id}", response_model=MessageResponse)
async def delete_education(entity_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    record = _owned(db, Education, user.id, entity_id)
    db.delete(record)
    db.commit()
    compute_completeness(db, user.id)
    return MessageResponse(message="Education record deleted.")


# --------------------------------------------------------------------------- skills


@router.post("/skills", response_model=SkillOut, status_code=201)
async def create_skill(payload: SkillIn, user: CurrentUser, db: DbSession) -> SkillOut:
    existing = db.scalar(select(Skill).where(Skill.user_id == user.id,
                                             Skill.name.ilike(payload.name.strip())))
    if existing:
        for field, value in payload.model_dump().items():
            setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return SkillOut.model_validate(existing)
    record = Skill(user_id=user.id, **payload.model_dump())
    db.add(record)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(record)
    return SkillOut.model_validate(record)


@router.put("/skills/{entity_id}", response_model=SkillOut)
async def update_skill(entity_id: str, payload: SkillIn, user: CurrentUser, db: DbSession) -> SkillOut:
    record = _owned(db, Skill, user.id, entity_id)
    duplicate = db.scalar(select(Skill).where(
        Skill.user_id == user.id, Skill.id != entity_id, Skill.name.ilike(payload.name.strip())))
    if duplicate:
        raise NotFoundError("A skill with that name already exists.")
    for field, value in payload.model_dump().items():
        setattr(record, field, value)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(record)
    return SkillOut.model_validate(record)


@router.delete("/skills/{entity_id}", response_model=MessageResponse)
async def delete_skill(entity_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    record = _owned(db, Skill, user.id, entity_id)
    db.delete(record)
    db.commit()
    compute_completeness(db, user.id)
    return MessageResponse(message="Skill deleted.")


# --------------------------------------------------------------------------- projects


@router.post("/projects", response_model=ProjectOut, status_code=201)
async def create_project(payload: ProjectIn, user: CurrentUser, db: DbSession) -> ProjectOut:
    data = payload.model_dump()
    data.pop("is_current", None)
    record = Project(user_id=user.id, **data,
                     sort_order=next_sort_order(db, Project, user.id))
    db.add(record)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(record)
    return ProjectOut.model_validate(record)


@router.put("/projects/{entity_id}", response_model=ProjectOut)
async def update_project(entity_id: str, payload: ProjectIn, user: CurrentUser,
                         db: DbSession) -> ProjectOut:
    record = _owned(db, Project, user.id, entity_id)
    data = payload.model_dump()
    data.pop("is_current", None)
    for field, value in data.items():
        setattr(record, field, value)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(record)
    return ProjectOut.model_validate(record)


@router.delete("/projects/{entity_id}", response_model=MessageResponse)
async def delete_project(entity_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    record = _owned(db, Project, user.id, entity_id)
    db.delete(record)
    db.commit()
    compute_completeness(db, user.id)
    return MessageResponse(message="Project deleted.")


# --------------------------------------------------------------------------- certifications


@router.post("/certifications", response_model=CertificationOut, status_code=201)
async def create_certification(payload: CertificationIn, user: CurrentUser,
                               db: DbSession) -> CertificationOut:
    record = Certification(user_id=user.id, **payload.model_dump(),
                           sort_order=next_sort_order(db, Certification, user.id))
    db.add(record)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(record)
    return CertificationOut.model_validate(record)


@router.put("/certifications/{entity_id}", response_model=CertificationOut)
async def update_certification(entity_id: str, payload: CertificationIn, user: CurrentUser,
                               db: DbSession) -> CertificationOut:
    record = _owned(db, Certification, user.id, entity_id)
    for field, value in payload.model_dump().items():
        setattr(record, field, value)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(record)
    return CertificationOut.model_validate(record)


@router.delete("/certifications/{entity_id}", response_model=MessageResponse)
async def delete_certification(entity_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    record = _owned(db, Certification, user.id, entity_id)
    db.delete(record)
    db.commit()
    compute_completeness(db, user.id)
    return MessageResponse(message="Certification deleted.")


# --------------------------------------------------------------------------- achievements


@router.post("/achievements", response_model=AchievementOut, status_code=201)
async def create_achievement(payload: AchievementIn, user: CurrentUser, db: DbSession) -> AchievementOut:
    record = Achievement(user_id=user.id, **payload.model_dump(),
                         sort_order=next_sort_order(db, Achievement, user.id))
    db.add(record)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(record)
    return AchievementOut.model_validate(record)


@router.put("/achievements/{entity_id}", response_model=AchievementOut)
async def update_achievement(entity_id: str, payload: AchievementIn, user: CurrentUser,
                             db: DbSession) -> AchievementOut:
    record = _owned(db, Achievement, user.id, entity_id)
    for field, value in payload.model_dump().items():
        setattr(record, field, value)
    db.commit()
    compute_completeness(db, user.id)
    db.refresh(record)
    return AchievementOut.model_validate(record)


@router.delete("/achievements/{entity_id}", response_model=MessageResponse)
async def delete_achievement(entity_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    record = _owned(db, Achievement, user.id, entity_id)
    db.delete(record)
    db.commit()
    compute_completeness(db, user.id)
    return MessageResponse(message="Achievement deleted.")
