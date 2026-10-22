"""Evidence-based career insights computed from the user's stored records."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.text import normalize_skill
from app.database.base import utcnow
from app.models import (
    Application,
    DocumentReview,
    InsightDismissal,
    JobListing,
    JobMatch,
    Skill,
    User,
)
from app.services.matching import job_skill_requirements
from app.services.profile_service import ensure_profile

MIN_SAMPLE = 5


def _confidence(sample: int) -> str:
    if sample >= 10:
        return "moderate"
    if sample >= MIN_SAMPLE:
        return "low"
    return "insufficient"


def generate_insights(db: Session, user: User, period_days: int = 90) -> dict:
    since = utcnow() - timedelta(days=period_days)
    jobs = list(db.scalars(select(JobListing).where(
        JobListing.user_id == user.id, JobListing.is_saved.is_(True))).all())
    matches = {m.job_id: m for m in db.scalars(select(JobMatch).where(
        JobMatch.user_id == user.id)).all()}
    profile = ensure_profile(db, user)
    user_skills = {normalize_skill(s.name) for s in db.scalars(
        select(Skill).where(Skill.user_id == user.id, Skill.verified.is_(True))).all()}
    dismissals = {d.insight_key for d in db.scalars(select(InsightDismissal).where(
        InsightDismissal.user_id == user.id, InsightDismissal.dismissed.is_(True))).all()}

    required = Counter()
    jobs_by_skill: dict[str, list[JobListing]] = defaultdict(list)
    for job in jobs:
        skills, _preferred, _structured = job_skill_requirements(job)
        for skill in skills:
            required[skill] += 1
            jobs_by_skill[skill].append(job)
    insights: list[dict] = []
    top_skills = required.most_common(12)
    for skill, count in top_skills[:6]:
        covered = skill in user_skills
        insights.append({
            "key": f"skill_demand:{skill}",
            "title": f"{skill} appears in {count} of your saved jobs",
            "insight": (f"{skill} is requested by {count} of the {len(jobs)} saved listings "
                        f"({count / max(1, len(jobs)) * 100:.0f}%). "
                        + ("Your verified profile lists it." if covered
                           else "Your verified profile does not list it.")),
            "evidence": [f"{job.title} at {job.company}" for job in jobs_by_skill[skill][:5]],
            "calculation": ("Counted how many saved job descriptions and requirement lists mention "
                            "the skill (normalized names and aliases). Missing skills are not assumed "
                            "to be disqualifying."),
            "sample_size": len(jobs),
            "confidence": _confidence(len(jobs)),
            "actionable": not covered,
            "dismissed": f"skill_demand:{skill}" in dismissals,
        })

    # Industries with strong matches.
    by_industry: dict[str, list[float]] = defaultdict(list)
    for job in jobs:
        if job.industry and job.id in matches:
            by_industry[job.industry].append(matches[job.id].overall_score)
    industry_rows = [{"industry": industry, "avg": sum(scores) / len(scores), "count": len(scores)}
                     for industry, scores in by_industry.items() if scores]
    industry_rows.sort(key=lambda row: (-row["avg"], -row["count"]))
    for row in industry_rows[:3]:
        insights.append({
            "key": f"industry:{row['industry'].lower()}",
            "title": f"Strongest industry signal: {row['industry']}",
            "insight": (f"Your average match score for {row['count']} saved listing(s) in "
                        f"{row['industry']} is {row['avg']:.0f}/100. This describes your saved "
                        f"listings, not the whole market."),
            "evidence": [f"{row['count']} saved listing(s) in this industry"],
            "calculation": "Averaged deterministic match scores for saved listings with a stated industry.",
            "sample_size": row["count"], "confidence": _confidence(row["count"]),
            "actionable": True,
            "dismissed": f"industry:{row['industry'].lower()}" in dismissals,
        })

    # Titles producing relevant opportunities.
    title_rows: dict[str, list[float]] = defaultdict(list)
    for job in jobs:
        key = (job.title or "").strip().lower()
        if key and job.id in matches:
            title_rows[key].append(matches[job.id].overall_score)
    ranked_titles = sorted(
        [{"title": title, "avg": sum(scores) / len(scores), "count": len(scores),
          "samples": [j for j in jobs if (j.title or "").strip().lower() == title][:3]}
         for title, scores in title_rows.items() if scores and sum(scores) / len(scores) >= 55],
        key=lambda row: (-row["avg"], -row["count"]))[:3]
    for row in ranked_titles:
        display = row["samples"][0].title if row["samples"] else row["title"]
        insights.append({
            "key": f"title:{row['title']}",
            "title": f"Relevant opportunities under “{display}”",
            "insight": (f"{row['count']} saved listing(s) with this title average "
                        f"{row['avg']:.0f}/100 against your verified profile."),
            "evidence": [f"{j.title} at {j.company}" for j in row["samples"]],
            "calculation": "Grouped saved listings by exact normalized title and averaged match scores.",
            "sample_size": row["count"], "confidence": _confidence(row["count"]),
            "actionable": True, "dismissed": f"title:{row['title']}" in dismissals,
        })

    # Skill gaps that recur.
    gaps = [(skill, count) for skill, count in required.most_common(20) if skill not in user_skills]
    for skill, count in gaps[:4]:
        insights.append({
            "key": f"gap:{skill}",
            "title": f"Recurring gap: {skill}",
            "insight": (f"{skill} is requested by {count} saved listing(s) but has no evidence in "
                        f"your verified profile. Only pursue it if it matches your direction."),
            "evidence": [f"{job.title} at {job.company}" for job in jobs_by_skill[skill][:5]],
            "calculation": "Compared normalized required skills with your verified skill names.",
            "sample_size": len(jobs), "confidence": _confidence(len(jobs)),
            "actionable": True, "dismissed": f"gap:{skill}" in dismissals,
        })

    # Sources producing interviews (applications only, not saved listings).
    applications = list(db.scalars(select(Application).where(
        Application.user_id == user.id)).all())
    source_rows: dict[str, dict] = defaultdict(lambda: {"applications": 0, "interviews": 0,
                                                        "offers": 0})
    for application in applications:
        label = (application.source or "manual").strip().title()
        source_rows[label]["applications"] += 1
        if application.status in {"interview", "offer"}:
            source_rows[label]["interviews"] += 1
        if application.status == "offer":
            source_rows[label]["offers"] += 1
    for label, row in sorted(source_rows.items(), key=lambda item: -item[1]["interviews"])[:3]:
        if row["interviews"] == 0:
            continue
        insights.append({
            "key": f"source:{label.lower()}",
            "title": f"{label}: {row['interviews']} interview(s) from {row['applications']} application(s)",
            "insight": (f"Applications sourced from {label} have reached the interview stage "
                        f"{row['interviews']} time(s). Small samples are not evidence of causation."),
            "evidence": [f"{row['applications']} tracked application(s)"],
            "calculation": ("Counted tracked applications by source and their current status. "
                            "Applications still in progress may change the result later."),
            "sample_size": row["applications"], "confidence": _confidence(row["applications"]),
            "actionable": False, "dismissed": f"source:{label.lower()}" in dismissals,
        })

    # Recurring document-review weaknesses.
    findings = []
    for review in db.scalars(select(DocumentReview).where(
            DocumentReview.user_id == user.id,
            DocumentReview.created_at >= since)).all():
        findings.extend(review.findings or [])
    category_counts = Counter(f.get("category", "other") for f in findings
                              if f.get("severity") in {"critical", "warning"})
    for category, count in category_counts.most_common(3):
        insights.append({
            "key": f"review:{category}",
            "title": f"Review pattern: {category.replace('_', ' ')}",
            "insight": (f"{count} review finding(s) in the last {period_days} days fall under "
                        f"{category.replace('_', ' ')}. Recurring categories are worth fixing at the "
                        f"profile level, not just per document."),
            "evidence": [f"{count} finding(s) across your document reviews"],
            "calculation": "Grouped reviewer findings by category and severity for documents reviewed in the period.",
            "sample_size": len(findings), "confidence": _confidence(len(findings)),
            "actionable": True, "dismissed": f"review:{category}" in dismissals,
        })

    notes = [
        "Insights describe your saved jobs and tracked applications only. They are not market research "
        "and do not predict hiring outcomes.",
        "Small samples are labelled with low confidence. Correlation is not causation.",
        "No insight uses protected characteristics or infers employability from personal attributes.",
    ]
    if len(jobs) < MIN_SAMPLE:
        notes.append("Add more saved jobs to increase the reliability of skill-demand insights.")
    return {
        "generated_at": utcnow(), "period_days": period_days,
        "data_points": {"saved_jobs": len(jobs), "matches": len(matches),
                        "applications": len(applications), "review_findings": len(findings),
                        "verified_skills": len(user_skills)},
        "insights": [insight for insight in insights if not insight["dismissed"]][:20],
        "notes": notes,
    }


def dismiss_insight(db: Session, user_id: str, key: str, dismissed: bool = True) -> None:
    record = db.scalar(select(InsightDismissal).where(
        InsightDismissal.user_id == user_id, InsightDismissal.insight_key == key))
    if not record:
        record = InsightDismissal(user_id=user_id, insight_key=key[:200], dismissed=dismissed)
        db.add(record)
    else:
        record.dismissed = dismissed
    db.commit()
