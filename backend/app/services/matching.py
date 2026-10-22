"""Explainable, deterministic job matching.

The score is computed from structured comparisons against the user's verified
profile. AI is never required and never changes the numbers: it can only add a
narrative explanation on top (clearly marked). Missing information is tracked
separately from a confirmed mismatch and excluded from the weighted score, so
an incomplete profile is not silently penalised.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.text import (
    SKILL_ALIASES,
    clean_whitespace,
    detect_seniority,
    normalize_skill,
    sentence_split,
)
from app.models import JobListing, JobMatch, User
from app.services.profile_service import ProfileSnapshot, build_snapshot

CATEGORY_LABELS = {
    "skills": ("Technical skills", 30.0),
    "experience": ("Relevant experience", 18.0),
    "education": ("Education", 8.0),
    "certifications": ("Certifications", 4.0),
    "projects": ("Projects and portfolio", 8.0),
    "location": ("Location and work authorization", 12.0),
    "employment_type": ("Employment type", 5.0),
    "salary": ("Salary compatibility", 5.0),
    "industry": ("Industry fit", 3.0),
}

SENIORITY_RANK = {"intern": 0, "junior": 1, "mid": 2, "senior": 3, "lead": 4, "manager": 4}

# Score used for a category where neither side had enough information to compare.
NEUTRAL_SCORE = 50.0
# Evidence coverage at which the score is reported without any shrinkage toward neutral.
COVERAGE_FOR_FULL_CONFIDENCE = 0.6

# Skills that partially overlap for credit purposes (never treated as equivalent).
RELATED_SKILLS = {
    "react": {"javascript", "typescript", "next.js", "vue", "angular", "svelte"},
    "next.js": {"react", "javascript", "typescript", "node.js"},
    "vue": {"javascript", "typescript", "react"},
    "angular": {"typescript", "javascript", "react"},
    "node.js": {"javascript", "typescript", "express"},
    "typescript": {"javascript"},
    "javascript": {"typescript", "node.js", "react"},
    "django": {"python", "flask", "fastapi"},
    "flask": {"python", "django", "fastapi"},
    "fastapi": {"python", "flask", "django"},
    "spring": {"java", "spring boot"},
    "spring boot": {"java", "spring"},
    "postgresql": {"sql", "mysql"},
    "mysql": {"sql", "postgresql"},
    "mongodb": {"nosql", "sql"},
    "aws": {"google cloud", "azure", "cloudformation"},
    "azure": {"aws", "google cloud"},
    "google cloud": {"aws", "azure"},
    "docker": {"kubernetes", "containers"},
    "kubernetes": {"docker", "terraform"},
    "terraform": {"kubernetes", "aws"},
    "tensorflow": {"pytorch", "machine learning"},
    "pytorch": {"tensorflow", "machine learning"},
    "machine learning": {"deep learning", "data analysis", "llms"},
    "llms": {"machine learning", "nlp", "openai"},
    "react native": {"react", "javascript", "typescript"},
    "flutter": {"dart", "react native"},
    "android": {"kotlin", "java"},
    "ios": {"swift"},
    "kotlin": {"java", "android"},
    "swift": {"ios", "swiftui"},
    "pytest": {"python", "jest", "vitest"},
    "jest": {"javascript", "typescript", "vitest"},
    "cypress": {"playwright", "selenium", "jest"},
    "playwright": {"cypress", "selenium", "jest"},
}

DEGREE_LEVEL = [
    (r"\bph\.?d\b|\bdoctorate\b", 4, "PhD"),
    (r"\bmaster'?s?\b|\bm\.?sc\b|\bm\.?a\b|\bmba\b", 3, "Master's"),
    (r"\bbachelor'?s?\b|\bb\.?sc\b|\bb\.?a\b|\bundergraduate degree\b", 2, "Bachelor's"),
    (r"\bdiploma\b|\bassociate degree\b|\bhnd\b|\bond\b", 1, "Diploma"),
]

CERT_PATTERNS = [
    r"\baws certified\b", r"\bazure certified\b", r"\bgcp certified\b", r"\bcissp\b",
    r"\bscrum master\b", r"\bpmp\b", r"\bccna\b", r"\bcomptia\b", r"\bcfa\b",
    r"\bcpa\b", r"\bcertified\b[^.\n]{0,40}", r"\bcertification\b[^.\n]{0,40}",
]

REQUIRED_YEARS_RE = re.compile(r"(\d{1,2})\s*(?:\+|plus)?\s*(?:-|to|–)?\s*(\d{1,2})?\s*(?:years?|yrs?)", re.I)
NO_SPONSORSHIP_RE = re.compile(
    r"(no|not|unable to|without|does not|do not|cannot|can't)\s+(?:offer\s+)?(?:visa\s+)?sponsor", re.I)
SPONSORSHIP_RE = re.compile(r"visa sponsorship (is )?(available|offered|provided)|we (do )?sponsor", re.I)
DEGREE_REQUIREMENT_RE = re.compile(
    r"(bachelor|master|degree in|b\.?sc|m\.?sc|ph\.?d|university degree|tertiary)", re.I)


@dataclass
class BreakdownItem:
    category: str
    label: str
    weight: float
    score: float | None
    status: str
    evidence: list[str] = field(default_factory=list)
    detail: str = ""

    def as_dict(self) -> dict:
        return {
            "category": self.category, "label": self.label, "weight": self.weight,
            "score": None if self.score is None else round(self.score, 1),
            "status": self.status, "evidence": self.evidence[:6], "detail": self.detail,
            "rationale": self.detail,
        }


@dataclass
class MatchComputation:
    overall_score: float
    category: str
    breakdown: list[BreakdownItem]
    strong_matches: list[str]
    partial_matches: list[str]
    missing_requirements: list[str]
    matched_skills: list[str]
    missing_skills: list[str]
    disqualifiers: list[str]
    unknowns: list[str]
    suggestions: list[str]
    explanation: str
    coverage: float
    method: str = "deterministic_v1"


def _skill_index(snapshot: ProfileSnapshot) -> dict[str, object]:
    index: dict[str, object] = {}
    for skill in snapshot.skills:
        key = normalize_skill(skill.name)
        if key not in index or (getattr(skill, "verified", False)
                                and not getattr(index[key], "verified", False)):
            index[key] = skill
    return index


def _job_skill_requirements(job: JobListing) -> tuple[set[str], set[str], bool]:
    requirement_text = " \n".join(job.requirements or [])
    description = job.description or ""
    preferred_markers = ("preferred", "nice to have", "bonus", "plus if", "advantage")
    preferred_lines = [s for s in sentence_split(description)
                       if any(marker in s.lower() for marker in preferred_markers)]
    preferred = {normalize_skill(s) for s in (job.skills or []) + (job.technologies or [])}
    from app.core.text import extract_skills

    preferred |= {normalize_skill(s) for s in extract_skills(" ".join(preferred_lines))}
    required = {normalize_skill(s) for s in extract_skills(requirement_text)}
    if not required:
        required = {normalize_skill(s) for s in (job.skills or [])}
    if not required:
        from app.core.text import extract_skills as _es

        all_skills = [normalize_skill(s) for s in _es(f"{job.title} {description}")]
        required = set(all_skills[:10])
    preferred -= required
    structured = bool(job.requirements or job.skills)
    return required, preferred, structured


def _score_skills(snapshot: ProfileSnapshot, job: JobListing) -> BreakdownItem:
    required, preferred, structured = _job_skill_requirements(job)
    weight = CATEGORY_LABELS["skills"][1]
    user_skills = _skill_index(snapshot)
    if not required and not preferred:
        return BreakdownItem("skills", "Technical skills", weight, None, "unknown",
                             detail="No specific technical requirements were stated in this listing.")
    if not snapshot.skills:
        return BreakdownItem(
            "skills", "Technical skills", weight, None, "unknown",
            detail="Your profile lists no skills yet, so skill fit could not be assessed.",
        )

    confirmed: list[str] = []
    partial: list[str] = []
    missing: list[str] = []
    evidence: list[str] = []
    points = 0.0
    max_points = 0.0
    for skill in sorted(required):
        max_points += 2.0
        record = user_skills.get(skill)
        if record is not None:
            points += 2.0
            confirmed.append(skill)
            proficiency = getattr(record, "proficiency", "unspecified")
            years = getattr(record, "years_experience", None)
            evidence.append(
                f"{getattr(record, 'name', skill)} — confirmed in your skills"
                + (f" ({proficiency}" + (f", {years:g} yrs)" if years else ")") if proficiency != "unspecified" else "")
            )
        else:
            related = {r for r in RELATED_SKILLS.get(skill, set()) if r in user_skills}
            if related:
                points += 0.9
                partial.append(skill)
                evidence.append(f"{skill} — related experience via {', '.join(sorted(related))}")
            else:
                missing.append(skill)
    for skill in sorted(preferred):
        max_points += 0.5
        if skill in user_skills:
            points += 0.5
            confirmed.append(f"{skill} (preferred)")
        elif {r for r in RELATED_SKILLS.get(skill, set()) if r in user_skills}:
            points += 0.25
            partial.append(f"{skill} (preferred)")

    if max_points == 0:
        return BreakdownItem("skills", "Technical skills", weight, None, "unknown")
    raw = points / max_points
    score = max(0.0, min(100.0, raw * 100))
    status = "confirmed" if not missing and not partial else (
        "partial" if raw >= 0.45 else "mismatch")
    detail = (
        f"{len(confirmed)} of {len(required) + len(preferred)} requested skills have direct evidence; "
        f"{len(partial)} are related but not identical; {len(missing)} have no evidence in your profile."
    )
    if not structured:
        detail += " Requirements were inferred from the description, so treat the extraction as approximate."
    return BreakdownItem("skills", "Technical skills", weight, score, status, evidence, detail)


def _required_years(job: JobListing) -> int | None:
    haystack = f"{job.title} {job.description[:4000]} " + " ".join(job.requirements or [])
    candidates = []
    for match in REQUIRED_YEARS_RE.finditer(haystack):
        low = int(match.group(1))
        high = int(match.group(2)) if match.group(2) else None
        if 0 < low <= 30:
            candidates.append((low, high))
    if not candidates:
        return None
    # Prefer the minimum of the most specific (ranged) requirement.
    ranged = [c for c in candidates if c[1]]
    if ranged:
        return min(c[1] for c in ranged)
    return min(c[0] for c in candidates)


def _score_experience(snapshot: ProfileSnapshot, job: JobListing) -> BreakdownItem:
    weight = CATEGORY_LABELS["experience"][1]
    required = _required_years(job)
    years = snapshot.years_experience
    job_level = job.experience_level if job.experience_level != "unknown" else detect_seniority(job.title)
    evidence = []
    if years > 0:
        evidence.append(f"Your work history totals about {years:g} years.")
    if required is not None:
        if years <= 0:
            return BreakdownItem("experience", "Relevant experience", weight, None, "unknown",
                                 evidence=evidence,
                                 detail=f"The listing asks for about {required} years, but your work "
                                        f"history has no dated positions to compare.")
        if years >= required:
            score = 100.0
            status = "confirmed"
        elif required - years <= 1:
            score = 72.0
            status = "partial"
        elif required - years <= 2:
            score = 50.0
            status = "partial"
        else:
            score = max(10.0, 45.0 - (required - years) * 5)
            status = "mismatch"
        detail = f"The listing asks for about {required} years; your dated experience is {years:g} years."
        evidence.append(f"Requirement detected in the listing: {required}+ years.")
        return BreakdownItem("experience", "Relevant experience", weight, score, status,
                             evidence, detail)
    if job_level != "unknown" and snapshot.seniority != "unknown":
        diff = SENIORITY_RANK.get(snapshot.seniority, 2) - SENIORITY_RANK.get(job_level, 2)
        if diff >= 0:
            score, status = 100.0, "confirmed"
        elif diff == -1:
            score, status = 68.0, "partial"
        else:
            score, status = 35.0, "partial"
        detail = (f"The listing reads as {job_level}-level; your profile reads as {snapshot.seniority} "
                  f"based on titles and dated experience.")
        return BreakdownItem("experience", "Relevant experience", weight, score, status,
                             evidence, detail)
    return BreakdownItem("experience", "Relevant experience", weight, None, "unknown",
                         evidence=evidence,
                         detail="Neither the required years nor the seniority could be determined.")


def _score_education(snapshot: ProfileSnapshot, job: JobListing) -> BreakdownItem:
    weight = CATEGORY_LABELS["education"][1]
    haystack = f"{job.title} {job.description} " + " ".join(job.requirements or [])
    if not DEGREE_REQUIREMENT_RE.search(haystack):
        return BreakdownItem("education", "Education", weight, None, "unknown",
                             detail="No formal education requirement was stated in the listing.")
    required_level = 2
    required_label = "a degree"
    for pattern, level, label in DEGREE_LEVEL:
        if re.search(pattern, haystack, re.I):
            required_level, required_label = level, label
            break
    if not snapshot.education:
        return BreakdownItem("education", "Education", weight, 20.0, "missing",
                             detail=f"The listing mentions {required_label}, but no education is listed in your profile. "
                                    "Add it if you have it; otherwise do not claim it.")
    best = 0
    best_label = ""
    for record in snapshot.education:
        blob = f"{record.qualification} {record.field_of_study} {record.institution}"
        level = 1
        label = record.qualification or record.institution
        for pattern, candidate, candidate_label in DEGREE_LEVEL:
            if re.search(pattern, blob, re.I):
                level, label = candidate, candidate_label
                break
        if level > best:
            best, best_label = level, label
    if best >= required_level:
        return BreakdownItem("education", "Education", weight, 100.0, "confirmed",
                             [f"{best_label} listed in your education history."],
                             f"Your {best_label} meets the stated {required_label} requirement.")
    return BreakdownItem("education", "Education", weight, 55.0, "partial",
                         [f"{best_label or 'Education'} listed in your profile."],
                         f"The listing mentions {required_label}; your highest listed qualification is {best_label or 'unclear'}.")


def _score_certifications(snapshot: ProfileSnapshot, job: JobListing) -> BreakdownItem:
    weight = CATEGORY_LABELS["certifications"][1]
    haystack = f"{job.description} " + " ".join(job.requirements or [])
    mentions = []
    for pattern in CERT_PATTERNS:
        mentions.extend(re.findall(pattern, haystack, re.I))
    if not mentions:
        return BreakdownItem("certifications", "Certifications", weight, None, "unknown",
                             detail="No certification requirement was stated in the listing.")
    user_certs = [c.name.lower() for c in snapshot.certifications]
    if not user_certs:
        return BreakdownItem("certifications", "Certifications", weight, 10.0, "missing",
                             detail="The listing references a certification; your profile lists none.")
    matched = [c for c in user_certs if any(token in c for token in ("certified", "certificate", "pmp", "scrum"))
               or any(word in " ".join(mentions).lower() for word in c.split()[:2])]
    score = 100.0 if matched else 35.0
    return BreakdownItem("certifications", "Certifications", weight, score,
                         "confirmed" if matched else "partial",
                         [f"Listed: {c}" for c in snapshot.certifications[:3]],
                         "Your certifications overlap with the listing." if matched
                         else "Your certifications do not clearly match what the listing mentions.")


def _score_projects(snapshot: ProfileSnapshot, job: JobListing) -> BreakdownItem:
    weight = CATEGORY_LABELS["projects"][1]
    if not snapshot.projects:
        return BreakdownItem("projects", "Projects and portfolio", weight, None, "unknown",
                             detail="No projects are listed in your profile, so portfolio relevance was not scored.")
    job_skills = {normalize_skill(s) for s in (job.skills or []) + (job.technologies or [])}
    if not job_skills:
        from app.core.text import extract_skills

        job_skills = {normalize_skill(s) for s in extract_skills(job.description)[:15]}
    relevant = []
    for project in snapshot.projects:
        project_tech = {normalize_skill(t) for t in (project.technologies or [])}
        overlap = project_tech & job_skills
        if overlap:
            relevant.append((project, overlap))
    if not relevant:
        return BreakdownItem("projects", "Projects and portfolio", weight, 30.0, "partial",
                             detail="None of your listed projects use the technologies named in this listing.")
    best = sorted(relevant, key=lambda item: -len(item[1]))[:3]
    coverage = len(best) / max(1, len(snapshot.projects))
    score = min(100.0, 55.0 + 15.0 * len(best[0][1]) + 10.0 * min(3, len(best)))
    evidence = [f"{project.name} — {', '.join(sorted(overlap))[:120]}" for project, overlap in best]
    return BreakdownItem("projects", "Projects and portfolio", weight, score, "confirmed", evidence,
                         f"{len(relevant)} of {len(snapshot.projects)} projects share technologies with this listing.")


def _location_matches(job_location: str, snapshot: ProfileSnapshot) -> bool:
    location = (job_location or "").lower()
    if not location:
        return False
    city = (snapshot.city or "").lower()
    country = (snapshot.country or "").lower()
    return bool((city and city in location) or (country and country in location))


def _score_location(snapshot: ProfileSnapshot, job: JobListing) -> BreakdownItem:
    weight = CATEGORY_LABELS["location"][1]
    prefs = snapshot.preferences
    arrangement = job.work_arrangement
    evidence: list[str] = []
    if arrangement == "remote":
        evidence.append("The listing is marked remote.")
        if prefs and prefs.work_arrangements and "remote" not in prefs.work_arrangements:
            return BreakdownItem("location", "Location and work authorization", weight, 45.0, "partial",
                                 evidence, "You have not listed remote work as a preference.")
        return BreakdownItem("location", "Location and work authorization", weight, 100.0,
                             "confirmed", evidence, "Remote work avoids a location constraint.")
    if not job.location:
        return BreakdownItem("location", "Location and work authorization", weight, None, "unknown",
                             detail="The listing does not state a location.")
    local = _location_matches(job.location, snapshot)
    evidence.append(f"Listing location: {job.location}.")
    if local:
        return BreakdownItem("location", "Location and work authorization", weight, 100.0,
                             "confirmed", evidence, "The listing is in your stated location.")
    relocation = (prefs.relocation if prefs else "maybe") or "maybe"
    visa_required = bool(prefs.visa_required) if prefs else False
    if NO_SPONSORSHIP_RE.search(job.description or "") and visa_required:
        return BreakdownItem(
            "location", "Location and work authorization", weight, 0.0, "mismatch", evidence,
            "The listing states sponsorship is unavailable and your profile indicates you need it.",
        )
    if relocation == "no":
        return BreakdownItem(
            "location", "Location and work authorization", weight, 20.0, "mismatch", evidence,
            "You have said you are not open to relocating, and the listing is elsewhere.",
        )
    if relocation == "yes":
        return BreakdownItem("location", "Location and work authorization", weight, 80.0,
                             "partial", evidence,
                             "You are open to relocating, but confirm the employer's eligibility requirements.")
    return BreakdownItem("location", "Location and work authorization", weight, 55.0, "partial",
                         evidence,
                         "You have not confirmed relocation or work authorization for this location.")


def _score_employment(snapshot: ProfileSnapshot, job: JobListing) -> BreakdownItem:
    weight = CATEGORY_LABELS["employment_type"][1]
    prefs = snapshot.preferences
    if not prefs or not prefs.employment_types or job.employment_type in {"", "unknown"}:
        return BreakdownItem("employment_type", "Employment type", weight, None, "unknown",
                             detail="Employment type could not be compared (missing preference or listing detail).")
    if job.employment_type in prefs.employment_types:
        return BreakdownItem("employment_type", "Employment type", weight, 100.0, "confirmed",
                             [f"Listing type: {job.employment_type.replace('_', ' ')}."],
                             "The employment type matches your preferences.")
    return BreakdownItem("employment_type", "Employment type", weight, 30.0, "mismatch",
                         [f"Listing type: {job.employment_type.replace('_', ' ')}."],
                         "The employment type is not in your stated preferences.")


def _score_salary(snapshot: ProfileSnapshot, job: JobListing) -> BreakdownItem:
    weight = CATEGORY_LABELS["salary"][1]
    prefs = snapshot.preferences
    if job.salary_max is None or not prefs or prefs.salary_min is None:
        return BreakdownItem("salary", "Salary compatibility", weight, None, "unknown",
                             detail="Salary could not be compared because the listing or your preference is missing.")
    if job.salary_currency and prefs.currency and job.salary_currency.upper() != prefs.currency.upper():
        return BreakdownItem("salary", "Salary compatibility", weight, None, "unknown",
                             detail="The listing salary uses a different currency, so it was not compared.")
    if job.salary_period != prefs.salary_period:
        return BreakdownItem("salary", "Salary compatibility", weight, None, "unknown",
                             detail="The listing and your preference use different pay periods.")
    if job.salary_max >= prefs.salary_min:
        return BreakdownItem("salary", "Salary compatibility", weight, 100.0, "confirmed",
                             [f"Listing range up to {job.salary_max:,} {job.salary_currency or prefs.currency}."],
                             "The listing range can meet your minimum expectation.")
    return BreakdownItem("salary", "Salary compatibility", weight, 15.0, "mismatch",
                         [f"Listing range up to {job.salary_max:,} {job.salary_currency or prefs.currency}."],
                         "The listed maximum is below your minimum salary expectation.")


def _score_industry(snapshot: ProfileSnapshot, job: JobListing) -> BreakdownItem:
    weight = CATEGORY_LABELS["industry"][1]
    prefs = snapshot.preferences
    if not prefs or not prefs.industries or not job.industry:
        return BreakdownItem("industry", "Industry fit", weight, None, "unknown",
                             detail="Industry preferences or listing industry are not available.")
    match = any(industry.lower() in (job.industry or "").lower()
                or (job.industry or "").lower() in industry.lower() for industry in prefs.industries)
    return BreakdownItem("industry", "Industry fit", weight, 100.0 if match else 45.0,
                         "confirmed" if match else "partial",
                         [f"Listing industry: {job.industry}."],
                         "The industry matches your preferences." if match
                         else "The industry is outside the ones you selected.")


def skill_name_lists(snapshot: ProfileSnapshot, job: JobListing) -> tuple[list[str], list[str]]:
    """Requested skills the profile directly evidences, and those it does not."""
    required, preferred, _structured = _job_skill_requirements(job)
    user_skills = _skill_index(snapshot)
    # Preserve the listing's own capitalisation for display ("Docker", not "docker").
    display: dict[str, str] = {}
    for candidate in list(job.skills or []) + list(job.requirements or []):
        text = str(candidate).strip()
        if text:
            display.setdefault(normalize_skill(text), text[:60])
    matched: list[str] = []
    missing: list[str] = []
    for skill in sorted(required | preferred):
        record = user_skills.get(skill)
        label = getattr(record, "name", skill) if record is not None else skill
        if record is not None:
            matched.append(str(label))
        elif {r for r in RELATED_SKILLS.get(skill, set()) if r in user_skills}:
            matched.append(f"{skill} (related)")
        else:
            missing.append(display.get(skill, skill))
    return matched[:40], missing[:40]


def compute_match(snapshot: ProfileSnapshot, job: JobListing) -> MatchComputation:
    items = [
        _score_skills(snapshot, job),
        _score_experience(snapshot, job),
        _score_education(snapshot, job),
        _score_certifications(snapshot, job),
        _score_projects(snapshot, job),
        _score_location(snapshot, job),
        _score_employment(snapshot, job),
        _score_salary(snapshot, job),
        _score_industry(snapshot, job),
    ]
    total_weight = sum(item.weight for item in items)
    scored_weight = sum(item.weight for item in items if item.score is not None)
    coverage = scored_weight / total_weight if total_weight else 0.0
    # Categories with no data are treated as neutral (50), not dropped and not zeroed.
    # Dropping them let a single 100% category produce an overall score of 100 on an empty
    # profile, which overstated confidence; zeroing them would invent a negative signal.
    if scored_weight and total_weight:
        raw = sum(
            (item.score if item.score is not None else NEUTRAL_SCORE) * item.weight
            for item in items
        ) / total_weight
        # Confidence shrinkage: the less of the rubric the evidence covers, the further the
        # score is pulled toward neutral. A thin profile therefore cannot present itself as a
        # perfect match, and a sparse listing cannot present itself as a hopeless one.
        scale = min(1.0, coverage / COVERAGE_FOR_FULL_CONFIDENCE)
        overall = NEUTRAL_SCORE + (raw - NEUTRAL_SCORE) * scale
        overall = round(max(0.0, min(100.0, overall)), 1)
        if overall >= 80:
            category = "strong_match"
        elif overall >= 60:
            category = "worth_considering"
        elif overall >= 40:
            category = "stretch"
        else:
            category = "low_match"
    else:
        # Nothing on either side could be assessed. Reporting 0 would assert a failure that
        # was never measured, so the neutral midpoint is stored with an explicit
        # "insufficient_data" category and the UI shows "not enough data" instead of a score.
        overall = NEUTRAL_SCORE
        category = "insufficient_data"

    strong = [item.detail for item in items if item.status == "confirmed" and item.detail]
    for item in items:
        if item.category == "skills":
            strong.extend(item.evidence[:3])
    partial = [f"{item.label}: {item.detail}" for item in items if item.status in {"partial", "missing"}]
    missing: list[str] = []
    unknowns: list[str] = []
    disqualifiers: list[str] = []
    for item in items:
        if item.status == "missing":
            missing.append(f"{item.label}: {item.detail}")
        if item.status == "unknown":
            unknowns.append(f"{item.label}: {item.detail}")
        if item.status == "mismatch" and item.category in {"location", "salary"} and (item.score or 0) <= 20:
            disqualifiers.append(f"{item.label}: {item.detail}")
    skills_item = next(item for item in items if item.category == "skills")
    if skills_item.status in {"mismatch", "partial"}:
        for evidence in skills_item.evidence:
            if "related experience" in evidence:
                partial.append(evidence)
    if skills_item.detail:
        missing_line = skills_item.detail
        if skills_item.status in {"mismatch", "partial"}:
            missing.append(f"Skills coverage: {missing_line}")

    suggestions = _build_suggestions(items, job, snapshot)
    confidence = "high" if coverage >= 0.75 else "medium" if coverage >= 0.45 else "low"
    explanation = (
        f"Score {overall:g}/100 is a weighted average of {sum(1 for i in items if i.score is not None)} "
        f"of {len(items)} categories that had enough information (evidence coverage {coverage * 100:.0f}%, "
        f"{confidence} confidence). Categories with no data count as neutral "
        f"({NEUTRAL_SCORE:g}) rather than being assumed to match or to fail, and the score is "
        f"pulled toward neutral when coverage is below "
        f"{COVERAGE_FOR_FULL_CONFIDENCE * 100:.0f}%. "
        + " ".join(
            f"{item.label} {round(item.score):d}%" if item.score is not None else f"{item.label} not scored"
            for item in items
        )
        + "."
    )
    if coverage < 0.5:
        explanation += (" Treat this score cautiously: your profile or the listing is missing details "
                        "that would materially change the result.")

    matched_skills, missing_skills = skill_name_lists(snapshot, job)
    return MatchComputation(
        overall_score=overall, category=category, breakdown=items,
        strong_matches=_dedupe(strong)[:8], partial_matches=_dedupe(partial)[:8],
        missing_requirements=_dedupe(missing)[:10],
        matched_skills=matched_skills, missing_skills=missing_skills,
        disqualifiers=_dedupe(disqualifiers)[:5],
        unknowns=_dedupe(unknowns)[:8], suggestions=suggestions[:8], explanation=explanation,
        coverage=round(coverage, 2),
    )


def _build_suggestions(items: list[BreakdownItem], job: JobListing,
                       snapshot: ProfileSnapshot) -> list[str]:
    suggestions: list[str] = []
    by_category = {item.category: item for item in items}
    skills_item = by_category["skills"]
    if skills_item.status in {"partial", "mismatch"}:
        suggestions.append(
            "If you have hands-on experience with the skills flagged above that is not yet in your profile, "
            "add it with concrete evidence. Only mention what you can truthfully defend in an interview."
        )
    experience_item = by_category["experience"]
    if experience_item.status in {"partial", "mismatch"}:
        suggestions.append(
            "Lead with verified achievements that show equivalent scope and impact rather than repeating years."
        )
    if by_category["projects"].status == "unknown":
        suggestions.append("Add one relevant project with a measurable outcome to evidence applied skill.")
    if by_category["location"].status in {"partial", "mismatch"}:
        suggestions.append("Confirm location, relocation and sponsorship eligibility with the employer before investing heavily.")
    if by_category["salary"].status == "unknown":
        suggestions.append("Ask for the salary range early since the listing does not state one.")
    if by_category["certifications"].status == "missing":
        suggestions.append("The listing references certification; only add it if you already hold it, or note a plan in your cover letter.")
    if job.requirements and not snapshot.achievements and not snapshot.projects:
        suggestions.append("Add at least one quantified achievement or portfolio item so the reviewer can verify claims.")
    return _dedupe(suggestions)


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output = []
    for value in values:
        cleaned = clean_whitespace(value)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            output.append(cleaned)
    return output


def match_to_dict(computation: MatchComputation) -> dict:
    return {
        "overall_score": computation.overall_score,
        "category": computation.category,
        "breakdown": [item.as_dict() for item in computation.breakdown],
        "strong_matches": computation.strong_matches,
        "partial_matches": computation.partial_matches,
        "missing_requirements": computation.missing_requirements,
        "matched_skills": computation.matched_skills,
        "missing_skills": computation.missing_skills,
        "disqualifiers": computation.disqualifiers,
        "unknowns": computation.unknowns,
        "suggestions": computation.suggestions,
        "explanation": computation.explanation,
        "method": computation.method,
    }


def upsert_match(db: Session, user_id: str, job: JobListing,
                 snapshot: ProfileSnapshot | None = None) -> JobMatch:
    if snapshot is None:
        user = db.get(User, user_id)
        if not user:
            raise ValueError("User not found")
        snapshot = build_snapshot(db, user)
    computation = compute_match(snapshot, job)
    match = db.scalar(select(JobMatch).where(JobMatch.user_id == user_id, JobMatch.job_id == job.id))
    if not match:
        match = JobMatch(user_id=user_id, job_id=job.id)
        db.add(match)
    match.overall_score = computation.overall_score
    match.category = computation.category
    match.breakdown = [item.as_dict() for item in computation.breakdown]
    match.strong_matches = computation.strong_matches
    match.partial_matches = computation.partial_matches
    match.missing_requirements = computation.missing_requirements
    match.matched_skills = computation.matched_skills
    match.missing_skills = computation.missing_skills
    match.disqualifiers = computation.disqualifiers
    match.unknowns = computation.unknowns
    match.suggestions = computation.suggestions
    match.explanation = computation.explanation
    match.method = computation.method
    db.flush()
    return match


def refresh_matches_for_user(db: Session, user_id: str) -> int:
    user = db.get(User, user_id)
    if not user:
        return 0
    snapshot = build_snapshot(db, user)
    jobs = db.scalars(select(JobListing).where(JobListing.user_id == user_id)).all()
    for job in jobs:
        upsert_match(db, user_id, job, snapshot=snapshot)
    db.commit()
    return len(jobs)


def job_skill_requirements(job: JobListing) -> tuple[set[str], set[str], bool]:
    """Public accessor used by analytics (returns normalized skills)."""
    return _job_skill_requirements(job)
