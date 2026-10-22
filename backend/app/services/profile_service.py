"""Career knowledge base operations, verification rules and completeness scoring."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models import (
    Achievement,
    CareerPreference,
    Certification,
    Education,
    ProfileCorrection,
    Project,
    Skill,
    User,
    UserProfile,
    WorkExperience,
    WritingStyleProfile,
)

MODEL_BY_ENTITY = {
    "experience": WorkExperience,
    "education": Education,
    "skill": Skill,
    "project": Project,
    "certification": Certification,
    "achievement": Achievement,
}


def ensure_profile(db: Session, user: User) -> UserProfile:
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    if not profile:
        profile = UserProfile(user_id=user.id, preferred_name=user.display_name)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def ensure_preferences(db: Session, user: User) -> CareerPreference:
    prefs = db.scalar(select(CareerPreference).where(CareerPreference.user_id == user.id))
    if not prefs:
        prefs = CareerPreference(user_id=user.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs


def ensure_writing_style(db: Session, user: User) -> WritingStyleProfile:
    style = db.scalar(select(WritingStyleProfile).where(WritingStyleProfile.user_id == user.id))
    if not style:
        style = WritingStyleProfile(user_id=user.id)
        db.add(style)
        db.commit()
        db.refresh(style)
    return style


def owned_or_404(db: Session, model, user_id: str, entity_id: str):
    entity = db.get(model, entity_id)
    if not entity or getattr(entity, "user_id", None) != user_id:
        raise NotFoundError("That record could not be found.")
    return entity


def list_owned(db: Session, model, user_id: str, order=None) -> list:
    stmt = select(model).where(model.user_id == user_id)
    if order is not None:
        stmt = stmt.order_by(order)
    elif hasattr(model, "sort_order"):
        stmt = stmt.order_by(model.sort_order, model.created_at)
    return list(db.scalars(stmt).all())


def record_correction(db: Session, user_id: str, entity_type: str, entity_id: str | None,
                      field_name: str, previous: str, new: str, reason: str = "") -> None:
    db.add(ProfileCorrection(
        user_id=user_id, entity_type=entity_type, entity_id=entity_id, field=field_name,
        previous_value=(previous or "")[:2000], new_value=(new or "")[:2000],
        reason=(reason or "")[:1000],
    ))


def next_sort_order(db: Session, model, user_id: str) -> int:
    current = db.scalar(select(func.max(model.sort_order)).where(model.user_id == user_id))
    return int(current or 0) + 1


def compute_completeness(db: Session, user_id: str) -> tuple[int, list[str]]:
    """Weighted completeness score with actionable missing items."""
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
    exp_count = db.scalar(select(func.count()).select_from(WorkExperience).where(WorkExperience.user_id == user_id)) or 0
    edu_count = db.scalar(select(func.count()).select_from(Education).where(Education.user_id == user_id)) or 0
    skill_count = db.scalar(select(func.count()).select_from(Skill).where(Skill.user_id == user_id)) or 0
    project_count = db.scalar(select(func.count()).select_from(Project).where(Project.user_id == user_id)) or 0
    cert_count = db.scalar(select(func.count()).select_from(Certification).where(Certification.user_id == user_id)) or 0
    prefs = db.scalar(select(CareerPreference).where(CareerPreference.user_id == user_id))

    checks: list[tuple[bool, int, str]] = [
        (bool(profile and profile.preferred_name), 8, "Add your preferred name"),
        (bool(profile and profile.professional_headline), 8, "Add a professional headline"),
        (bool(profile and profile.summary.strip()), 10, "Write a short professional summary"),
        (bool(profile and (profile.city or profile.country)), 4, "Add your location"),
        (exp_count > 0, 20, "Add at least one work experience"),
        (edu_count > 0, 8, "Add your education"),
        (skill_count >= 5, 14, "Add at least five skills"),
        (skill_count >= 5 and bool(db.scalar(
            select(func.count()).select_from(Skill).where(Skill.user_id == user_id, Skill.verified.is_(True))
        )), 4, "Verify your skills"),
        (project_count > 0, 8, "Add a project"),
        (bool(prefs and prefs.desired_titles), 8, "Add target job titles"),
        (bool(profile and (profile.github_url or profile.linkedin_url or profile.portfolio_url)), 4, "Add a professional link"),
        (cert_count > 0, 2, "Add a certification (optional)"),
        (bool(profile and profile.career_objectives), 2, "Choose your career objectives"),
    ]
    total = sum(weight for _ok, weight, _ in checks)
    earned = sum(weight for ok, weight, _ in checks if ok)
    completeness = int(round(earned / total * 100)) if total else 0
    missing = [label for ok, _weight, label in checks if not ok]
    if profile:
        profile.completeness = completeness
        db.commit()
    return completeness, missing


def verified_skills(db: Session, user_id: str) -> list[Skill]:
    return list(db.scalars(
        select(Skill).where(Skill.user_id == user_id, Skill.verified.is_(True))
    ).all())


def unverified_counts(db: Session, user_id: str) -> int:
    total = 0
    for model in (WorkExperience, Education, Skill, Project, Certification, Achievement):
        total += int(db.scalar(
            select(func.count()).select_from(model).where(
                model.user_id == user_id, model.verified.is_(False))
        ) or 0)
    return total


def years_of_experience(db: Session, user_id: str) -> float:
    records = list(db.scalars(
        select(WorkExperience).where(WorkExperience.user_id == user_id)
    ).all())
    months = 0
    intervals: list[tuple[date, date]] = []
    today = date.today()
    for record in records:
        start = record.start_date
        if not start:
            continue
        end = today if record.is_current or not record.end_date else record.end_date
        if end < start:
            continue
        intervals.append((start, end))
    # Merge overlapping intervals so concurrent roles don't double-count.
    intervals.sort()
    merged: list[list[date]] = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    for start, end in merged:
        months += (end.year - start.year) * 12 + (end.month - start.month)
    return round(months / 12, 1)


def derive_seniority(db: Session, user_id: str) -> str:
    years = years_of_experience(db, user_id)
    titles = [r.title.lower() for r in db.scalars(
        select(WorkExperience).where(WorkExperience.user_id == user_id)).all() if r.title]
    if any(word in " ".join(titles) for word in ("principal", "staff", "head of", "director")):
        return "lead"
    if any(word in " ".join(titles) for word in ("lead", "manager")):
        return "lead"
    if years >= 8:
        return "lead"
    if years >= 4:
        return "senior"
    if years >= 1.5:
        return "mid"
    if years > 0 or titles:
        return "junior"
    return "unknown"


@dataclass
class ProfileSnapshot:
    user_id: str
    name: str
    email: str
    headline: str
    summary: str
    phone: str
    city: str
    country: str
    links: dict
    experiences: list[WorkExperience] = field(default_factory=list)
    education: list[Education] = field(default_factory=list)
    skills: list[Skill] = field(default_factory=list)
    projects: list[Project] = field(default_factory=list)
    certifications: list[Certification] = field(default_factory=list)
    achievements: list[Achievement] = field(default_factory=list)
    preferences: CareerPreference | None = None
    writing_style: WritingStyleProfile | None = None
    years_experience: float = 0.0
    seniority: str = "unknown"
    completeness: int = 0

    @property
    def skill_names(self) -> list[str]:
        return [skill.name for skill in self.skills]

    def verified_experiences(self) -> list[WorkExperience]:
        return [e for e in self.experiences if e.verified or e.provenance == "user_confirmed"]


def build_snapshot(db: Session, user: User) -> ProfileSnapshot:
    profile = ensure_profile(db, user)
    prefs = ensure_preferences(db, user)
    style = ensure_writing_style(db, user)
    return ProfileSnapshot(
        user_id=user.id,
        name=profile.preferred_name or user.display_name,
        email=user.email,
        headline=profile.professional_headline,
        summary=profile.summary,
        phone=profile.phone,
        city=profile.city,
        country=profile.country,
        links={
            "github": profile.github_url,
            "linkedin": profile.linkedin_url,
            "portfolio": profile.portfolio_url,
            "website": profile.website_url,
            "other": profile.other_links or [],
        },
        experiences=list_owned(db, WorkExperience, user.id),
        education=list_owned(db, Education, user.id),
        skills=list_owned(db, Skill, user.id),
        projects=list_owned(db, Project, user.id),
        certifications=list_owned(db, Certification, user.id),
        achievements=list_owned(db, Achievement, user.id),
        preferences=prefs,
        writing_style=style,
        years_experience=years_of_experience(db, user.id),
        seniority=derive_seniority(db, user.id),
    )
