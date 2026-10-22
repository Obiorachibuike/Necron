"""Structured CV / cover-letter content and deterministic composition.

Content is assembled only from confirmed or verified profile records. Nothing
is invented. AI drafts may rephrase bullets, but every claim is checked
against the verified evidence corpus before it is accepted.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timezone

from app.core.text import (
    STOPWORDS,
    clean_whitespace,
    extract_skills,
    format_date_range,
    normalize_skill,
    sentence_split,
    slugify,
    strip_control_characters,
    word_count,
)
from app.documents.designs import DESIGN_KEYS, DESIGN_LIST, design_for, section_title
from app.services.profile_service import ProfileSnapshot

# Design specs live in app/documents/designs.py; re-exported here for existing imports.
TEMPLATE_INFO = [design.as_info() for design in DESIGN_LIST]
TEMPLATE_KEYS = set(DESIGN_KEYS)

TONE_HINTS = {
    "formal": "Formal and courteous.",
    "professional": "Professional and direct.",
    "conversational": "Warm but professional; plain language.",
}


def _verified_experiences(profile: ProfileSnapshot):
    return [e for e in profile.experiences if e.verified]


def _verified_projects(profile: ProfileSnapshot):
    return [p for p in profile.projects if p.verified]


def _verified_skills(profile: ProfileSnapshot):
    return [s for s in profile.skills if s.verified]


def _links(profile: ProfileSnapshot) -> list[dict]:
    links = []
    for label, key in (("GitHub", "github"), ("LinkedIn", "linkedin"),
                       ("Portfolio", "portfolio"), ("Website", "website")):
        value = (profile.links or {}).get(key)
        if value:
            links.append({"label": label, "url": value})
    for item in (profile.links or {}).get("other", []) or []:
        if isinstance(item, dict) and item.get("url"):
            links.append({"label": str(item.get("label") or "Link")[:40], "url": item["url"]})
    return links[:5]


def header_for(profile: ProfileSnapshot, include_phone: bool = True,
               include_location: bool = True) -> dict:
    location = ", ".join(part for part in (profile.city, profile.country) if part)
    return {
        "name": profile.name or "Your name",
        "headline": profile.headline,
        "email": profile.email,
        "phone": profile.phone if include_phone else "",
        "location": location if include_location else "",
        "links": _links(profile),
    }


def _experience_bullets(experience, job_skills: set[str], limit: int = 6) -> list[str]:
    bullets: list[str] = []
    for achievement in experience.achievements or []:
        cleaned = clean_whitespace(str(achievement))
        if cleaned:
            bullets.append(cleaned[:400])
    if len(bullets) < 2 and experience.description:
        bullets.extend(sentence[:400] for sentence in sentence_split(experience.description))
    if len(bullets) < 2 and experience.leadership:
        bullets.extend(sentence[:400] for sentence in sentence_split(experience.leadership))
    # Prioritise bullets that mention skills named by the job, keeping original order otherwise.
    if job_skills:
        def relevance(text: str) -> int:
            found = {normalize_skill(skill) for skill in extract_skills(text)}
            return -len(found & job_skills)
        bullets.sort(key=relevance)
    return bullets[:limit]


def _project_bullets(project) -> list[str]:
    bullets: list[str] = []
    if project.outcomes:
        bullets.extend(sentence[:400] for sentence in sentence_split(project.outcomes))
    if project.problem_solved:
        bullets.extend(sentence[:400] for sentence in sentence_split(project.problem_solved))
    if project.responsibilities:
        bullets.extend(sentence[:400] for sentence in sentence_split(project.responsibilities))
    if not bullets and project.description:
        bullets.append(clean_whitespace(project.description)[:400])
    return bullets[:4]


def _skill_label(skill) -> str:
    proficiency = (skill.proficiency or "unspecified").lower()
    if proficiency in {"advanced", "expert"} and skill.evidence:
        return f"{skill.name} ({proficiency})"
    return skill.name


def _job_skill_set(job) -> set[str]:
    if not job:
        return set()
    pool = list(job.skills or []) + list(job.technologies or [])
    if not pool and job.description:
        pool = extract_skills(job.description)
    return {normalize_skill(skill) for skill in pool}


def build_cv_content(profile: ProfileSnapshot, *, job=None, template: str = "ats",
                     selected_experience_ids: list[str] | None = None,
                     selected_project_ids: list[str] | None = None,
                     selected_skill_ids: list[str] | None = None,
                     ai_draft: dict | None = None, variant: str = "tailored") -> dict:
    if template not in TEMPLATE_KEYS:
        template = "ats"
    ai_draft = ai_draft or {}
    job_skills = _job_skill_set(job)
    experiences = _verified_experiences(profile)
    if selected_experience_ids:
        chosen = [e for e in experiences if e.id in set(selected_experience_ids)]
        experiences = chosen or experiences
    projects = _verified_projects(profile)
    if selected_project_ids:
        chosen_projects = [p for p in projects if p.id in set(selected_project_ids)]
        projects = chosen_projects or projects
    skills = _verified_skills(profile)
    if selected_skill_ids:
        chosen_skills = [s for s in skills if s.id in set(selected_skill_ids)]
        skills = chosen_skills or skills

    header = header_for(profile, include_phone=True, include_location=True)
    if ai_draft.get("headline") and _grounded(ai_draft["headline"], profile, job):
        header["headline"] = clean_whitespace(str(ai_draft["headline"]))[:200]

    summary = ai_draft.get("summary") if isinstance(ai_draft.get("summary"), str) else ""
    if not summary or not _grounded(summary, profile, job, min_ratio=0.6):
        summary = _deterministic_summary(profile, job)
    else:
        summary = clean_whitespace(summary)[:700]
    summary = _apply_avoid_words(summary, profile)

    ai_bullets = ai_draft.get("experience_bullets") or {}
    experience_items = []
    for exp in experiences:
        bullets = []
        if isinstance(ai_bullets, dict) and isinstance(ai_bullets.get(exp.id), list):
            for bullet in ai_bullets[exp.id][:6]:
                if isinstance(bullet, str) and _grounded(bullet, profile, job, min_ratio=0.55,
                                                          strict_numbers=True):
                    bullets.append(_apply_avoid_words(clean_whitespace(bullet)[:400], profile))
        if len(bullets) < 2:
            bullets = [_apply_avoid_words(b, profile) for b in _experience_bullets(exp, job_skills)]
        experience_items.append({
            "id": exp.id,
            "title": exp.title,
            "subtitle": exp.employer,
            "location": exp.location,
            "dates": format_date_range(exp.start_date, exp.end_date, exp.is_current),
            "bullets": [b for b in bullets if b][:6],
        })

    project_items = []
    for project in projects:
        tech = [str(t) for t in (project.technologies or [])][:10]
        project_items.append({
            "id": project.id,
            "title": project.name,
            "subtitle": ", ".join(tech),
            "dates": format_date_range(project.start_date, project.end_date, False),
            "bullets": _project_bullets(project),
            "links": [link for link in (project.repo_url, project.demo_url) if link][:2],
        })

    groups: dict[str, list[str]] = {}
    for skill in skills:
        groups.setdefault(skill.category or "General", []).append(_skill_label(skill))
    skills_by_category = [{"category": category, "items": sorted(items, key=str.lower)[:25]}
                          for category, items in sorted(groups.items())]
    if job_skills:
        # Put categories that contain job-relevant skills first (stable within the group).
        def category_score(group: dict) -> int:
            names = {normalize_skill(name.split(" (")[0]) for name in group["items"]}
            return -len(names & job_skills)
        skills_by_category.sort(key=category_score)

    education_items = [{
        "id": record.id,
        "title": record.qualification or record.institution,
        "subtitle": record.institution if record.qualification else record.field_of_study,
        "location": record.location,
        "dates": format_date_range(record.start_date, record.end_date, record.status == "ongoing"),
        "bullets": [b for b in (([record.coursework] if record.coursework else [])
                                + list(record.achievements or [])) if b][:3],
    } for record in profile.education if record.verified]

    certification_items = [{
        "id": cert.id,
        "title": cert.name,
        "subtitle": cert.issuer,
        "dates": format_date_range(cert.issue_date, None, False),
        "bullets": [f"Credential: {cert.credential_url}"] if cert.credential_url else [],
    } for cert in profile.certifications if cert.verified]

    achievement_items = [{
        "id": item.id,
        "title": item.title,
        "subtitle": item.category.replace("_", " ").title(),
        "dates": format_date_range(item.date, None, False),
        "bullets": [item.description] if item.description else [],
    } for item in profile.achievements if item.verified]

    sections = [
        {"id": "experience", "type": "experience", "title": "Experience", "items": experience_items},
        {"id": "skills", "type": "skills", "title": "Skills", "groups": skills_by_category},
        {"id": "projects", "type": "projects", "title": "Projects", "items": project_items},
        {"id": "education", "type": "education", "title": "Education", "items": education_items},
        {"id": "certifications", "type": "certifications", "title": "Certifications",
         "items": certification_items},
        {"id": "achievements", "type": "achievements", "title": "Selected Achievements",
         "items": achievement_items},
    ]
    design = design_for(template)
    sections = _reorder(sections, [key for key in design.order if key != "summary"])
    for section in sections:
        section["title"] = section_title(design.key, section["id"], section["title"])

    sections = [section for section in sections
                if section.get("items") or section.get("groups")]
    return {
        "schema": "cv.v1",
        "template": template,
        "target": {
            "job_id": job.id if job else None,
            "company": job.company if job else "",
            "role": job.title if job else "",
        } if job else None,
        "variant": variant,
        "header": header,
        "summary": summary,
        "sections": sections,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provenance": "verified_profile_only",
    }


def _reorder(sections: list[dict], order: list[str]) -> list[dict]:
    index = {section["id"]: section for section in sections}
    return [index[key] for key in order if key in index]


def _natural_join(items: list[str]) -> str:
    items = [item for item in items if item]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return ", ".join(items[:-1]) + f" and {items[-1]}"


def _ordered_by_job(skills, job_skills: set[str]) -> list[str]:
    names = [s.name for s in skills]
    return sorted(names, key=lambda name: (0 if normalize_skill(name) in job_skills else 1, names.index(name)))


def _deterministic_summary(profile: ProfileSnapshot, job) -> str:
    role = profile.headline or (profile.experiences[0].title if profile.experiences else "")
    years = profile.years_experience
    job_skills = _job_skill_set(job)
    verified_skills = _verified_skills(profile)
    focus = [name for name in _ordered_by_job(verified_skills, job_skills)
             if not job_skills or normalize_skill(name) in job_skills][:3]
    if not focus:
        focus = [s.name for s in verified_skills][:3]
    if role and years and years >= 1:
        summary = f"{role} with {years:g} years of professional experience"
    elif role:
        summary = role
    elif years:
        summary = f"Professional with {years:g} years of experience"
    else:
        summary = ""
    if focus:
        summary += (" in " if summary else "Experienced with ") + _natural_join(focus)
    if profile.experiences and profile.experiences[0].employer:
        summary += f", most recently at {profile.experiences[0].employer}"
    if not summary:
        summary = "Add a professional summary based on your verified experience."
    summary = summary.rstrip(".,") + "."
    if job and job.title:
        summary += f" Applying for the {job.title} role at {job.company or 'your company'}."
    return summary[:700]


def build_cover_letter_content(profile: ProfileSnapshot, job, *, length: str = "standard",
                               tone: str = "professional", ai_paragraphs: list[str] | None = None,
                               variant: str = "tailored") -> dict:
    job_skills = _job_skill_set(job)
    experiences = _verified_experiences(profile)
    strongest_exp = None
    if experiences:
        def overlap_score(exp) -> int:
            blob = " ".join([exp.description or "", exp.leadership or "", exp.title or ""]
                            + [str(a) for a in (exp.achievements or [])]
                            + [str(t) for t in (exp.tools or [])])
            return len({normalize_skill(s) for s in extract_skills(blob)} & job_skills)
        strongest_exp = max(experiences, key=overlap_score)
    skills_overlap = [name for name in _ordered_by_job(_verified_skills(profile), job_skills)
                      if normalize_skill(name) in job_skills][:4]
    role = job.title if job else "the role"
    company = (job.company if job else "") or "your organisation"
    paragraphs: list[str] = []
    if ai_paragraphs:
        for para in ai_paragraphs[:5]:
            if isinstance(para, str) and _grounded(para, profile, job, min_ratio=0.55,
                                                   strict_numbers=True):
                paragraphs.append(_apply_avoid_words(clean_whitespace(para)[:1400], profile))
    if not paragraphs:
        paragraphs = _deterministic_letter(profile, job, strongest_exp, skills_overlap,
                                           length=length, tone=tone)
    greeting = "Dear Hiring Manager,"
    closing = "Sincerely,"
    content = {
        "schema": "cover_letter.v1",
        "variant": variant,
        "header": header_for(profile),
        "recipient": {
            "company": job.company if job else "",
            "role": role,
            "location": job.location if job else "",
            "hiring_manager": "",
        },
        "date": date.today().strftime("%d %B %Y"),
        "salutation": greeting,
        "paragraphs": paragraphs,
        "closing": closing,
        "signature": profile.name,
        "target": {"job_id": job.id if job else None},
        "word_count": word_count(" ".join(paragraphs)),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provenance": "verified_profile_only",
    }
    return content


def _deterministic_letter(profile: ProfileSnapshot, job, strongest_exp, skills_overlap: list[str],
                          *, length: str, tone: str) -> list[str]:
    role = job.title if job else "the advertised role"
    company = (job.company if job else "") or "your organisation"
    opening = f"I am writing to apply for the {role} position at {company}."
    if tone == "conversational":
        opening = f"I would like to apply for the {role} role at {company}."
    if skills_overlap:
        opening += f" My verified experience covers {_natural_join(skills_overlap[:3])}."
    paragraphs = [opening]

    if strongest_exp:
        evidence = [a for a in (strongest_exp.achievements or []) if a][:2]
        body = (f"As {strongest_exp.title} at {strongest_exp.employer}, I "
                f"{_lower_first(evidence[0])}" if evidence else
                f"In my role as {strongest_exp.title} at {strongest_exp.employer}, I worked on "
                f"{clean_whitespace(strongest_exp.description or 'projects relevant to this role')}")
        body = body.rstrip(".") + "."
        if len(evidence) > 1:
            second = _lower_first(clean_whitespace(evidence[1]))
            body += f" I also {second.rstrip('.')}."
        bar = (f"{profile.years_experience:g} years" if profile.years_experience >= 2
               else "hands-on experience")
        body += (f" That work reflects {bar} of practical delivery in environments where "
                 f"{_natural_join(skills_overlap[:2]) or 'the required technologies'} were central.")
        paragraphs.append(body)

    projects = _verified_projects(profile)
    relevant_projects = [p for p in projects
                         if {normalize_skill(t) for t in (p.technologies or [])} & _job_skill_set(job)]
    if relevant_projects and length != "concise":
        project = relevant_projects[0]
        paragraph = f"I have also built {project.name}"
        if project.technologies:
            paragraph += f" using {', '.join(project.technologies[:3])}"
        if project.outcomes:
            paragraph += f"; {_lower_first(clean_whitespace(project.outcomes)[:220])}"
        paragraphs.append(paragraph.rstrip(".") + ".")

    if length == "detailed":
        summary = profile.summary
        if summary:
            paragraphs.append(clean_whitespace(summary)[:500].rstrip(".") + ".")

    # Honest handling of a visible gap, without inventing mitigation.
    gaps = []
    if job and job.skills:
        missing = [skill for skill in job.skills
                   if normalize_skill(skill) not in
                   {normalize_skill(s.name) for s in _verified_skills(profile)}]
        gaps = missing[:2]
    closing = ("I would welcome the opportunity to discuss how this experience maps to the "
               "requirements of the role.")
    if gaps:
        closing = ("I would welcome a conversation about the role, including areas where I would "
                   "need to grow, so expectations are clear from the outset.")
    closing += " Thank you for your time and consideration."
    paragraphs.append(closing)
    if length == "concise" and len(paragraphs) > 3:
        paragraphs = paragraphs[:2] + [paragraphs[-1]]
    return paragraphs


def _lower_first(text: str) -> str:
    text = clean_whitespace(text)
    if not text:
        return text
    first, _, rest = text.partition(" ")
    if first.isupper() or first[:1].isdigit():
        return text
    return first[:1].lower() + first[1:] + ((" " + rest) if rest else "")


def _apply_avoid_words(text: str, profile: ProfileSnapshot) -> str:
    style = profile.writing_style
    if not style or not style.avoid_words:
        return text
    output = text
    for word in style.avoid_words[:50]:
        if not word.strip():
            continue
        output = re.sub(rf"\b{re.escape(word.strip())}\b", "", output, flags=re.IGNORECASE)
    return clean_whitespace(output)


def profile_evidence_corpus(profile: ProfileSnapshot) -> str:
    """Lowercase corpus of verified facts used for grounding checks."""
    parts: list[str] = [profile.name, profile.headline, profile.summary, profile.email,
                        profile.city, profile.country, profile.phone]
    for exp in profile.experiences:
        if not exp.verified:
            continue
        parts.extend([exp.employer or "", exp.title or "", exp.description or "",
                      exp.leadership or "", exp.location or ""])
        parts.extend(str(a) for a in (exp.achievements or []))
        parts.extend(str(m) for m in (exp.metrics or []))
        parts.extend(str(t) for t in (exp.tools or []))
        for value in (exp.start_date, exp.end_date):
            if isinstance(value, (date, datetime)):
                parts.append(str(value.year))
    for edu in profile.education:
        if not edu.verified:
            continue
        parts.extend([edu.institution or "", edu.qualification or "", edu.field_of_study or "",
                      edu.coursework or ""])
        parts.extend(str(a) for a in (edu.achievements or []))
        for value in (edu.start_date, edu.end_date):
            if isinstance(value, (date, datetime)):
                parts.append(str(value.year))
    for skill in profile.skills:
        if skill.verified:
            parts.extend([skill.name, skill.evidence or "", skill.category or ""])
    for project in profile.projects:
        if not project.verified:
            continue
        parts.extend([project.name or "", project.description or "", project.problem_solved or "",
                      project.responsibilities or "", project.outcomes or ""])
        parts.extend(str(t) for t in (project.technologies or []))
        for value in (project.start_date, project.end_date):
            if isinstance(value, (date, datetime)):
                parts.append(str(value.year))
    for cert in profile.certifications:
        if cert.verified:
            parts.extend([cert.name or "", cert.issuer or ""])
            if isinstance(cert.issue_date, (date, datetime)):
                parts.append(str(cert.issue_date.year))
    for item in profile.achievements:
        if item.verified:
            parts.extend([item.title or "", item.description or ""])
            if isinstance(item.date, (date, datetime)):
                parts.append(str(item.date.year))
    return " ".join(part for part in parts if part).lower()


def _grounded(text: str, profile: ProfileSnapshot, job=None, *, min_ratio: float = 0.5,
              strict_numbers: bool = False) -> bool:
    """Check that a generated sentence is supported by verified evidence.

    Coverage of meaningful tokens must exceed ``min_ratio``. Numbers with three
    or more digits must appear in the evidence (or in the job description).
    """
    if not text or len(text.strip()) < 10:
        return False
    corpus = profile_evidence_corpus(profile)
    job_text = ""
    if job is not None:
        job_text = " ".join([job.title or "", job.company or "", job.description or "",
                             " ".join(job.requirements or []), " ".join(job.skills or [])]).lower()
    tokens = {token for token in re.findall(r"[a-zA-Z][a-zA-Z0-9+#.-]{2,}", text.lower())
              if token not in STOPWORDS}
    if tokens:
        covered = sum(1 for token in tokens if token in corpus or (job_text and token in job_text))
        if covered / len(tokens) < min_ratio:
            return False
    if strict_numbers:
        for number in re.findall(r"\b\d[\d,.]*\b", text):
            digits = re.sub(r"[^\d]", "", number)
            if len(digits) >= 3 and digits not in corpus and digits not in job_text:
                return False
    return True


def unsupported_numbers(text: str, corpus: str) -> list[str]:
    found = []
    for number in re.findall(r"\b\d[\d,.]*\b", text or ""):
        digits = re.sub(r"[^\d]", "", number)
        if len(digits) >= 3 and digits not in corpus:
            found.append(number)
    return sorted(set(found))


def find_placeholders(text: str) -> list[str]:
    patterns = [r"\[[^\]]{2,40}\]", r"\bTODO\b", r"\bLorem ipsum\b", r"\{\{[^}]+\}\}",
                r"\bXXX\b", r"\bTBD\b"]
    hits = []
    for pattern in patterns:
        hits.extend(re.findall(pattern, text or "", flags=re.I))
    return sorted(set(hit[:60] for hit in hits))[:10]


def cover_letter_plain_text(content: dict) -> str:
    header = content.get("header", {})
    recipient = content.get("recipient", {})
    lines = [
        header.get("name", ""),
        header.get("headline", ""),
        " | ".join(x for x in [header.get("email", ""), header.get("phone", ""),
                               header.get("location", "")] if x),
        "",
        content.get("date", ""),
        "",
        recipient.get("company", ""),
        recipient.get("location", ""),
        "",
        content.get("salutation", "Dear Hiring Manager,"),
        "",
    ]
    lines.extend(content.get("paragraphs", []))
    lines.extend(["", content.get("closing", "Sincerely,"), content.get("signature", "")])
    return strip_control_characters("\n".join(line for line in lines if line is not None)).strip() + "\n"


def cv_plain_text(content: dict) -> str:
    header = content.get("header", {})
    lines = [header.get("name", ""), header.get("headline", "")]
    contact = " | ".join(x for x in [header.get("email", ""), header.get("phone", ""),
                                     header.get("location", "")] if x)
    if contact:
        lines.append(contact)
    if header.get("links"):
        lines.append(" | ".join(f"{link['label']}: {link['url']}" for link in header["links"]))
    if content.get("summary"):
        lines.extend(["", "SUMMARY", content["summary"]])
    for section in content.get("sections", []):
        lines.extend(["", section.get("title", "").upper()])
        if section.get("type") == "skills":
            for group in section.get("groups", []):
                lines.append(f"{group.get('category', 'Skills')}: {', '.join(group.get('items', []))}")
            continue
        for item in section.get("items", []):
            heading = " — ".join(x for x in [item.get("title", ""), item.get("subtitle", "")] if x)
            if item.get("dates"):
                heading = f"{heading} ({item['dates']})" if heading else item["dates"]
            if item.get("location"):
                heading += f", {item['location']}"
            lines.append(heading)
            for bullet in item.get("bullets", []) or []:
                lines.append(f"• {bullet}")
            for link in item.get("links", []) or []:
                lines.append(f"• {link}")
    text = "\n".join(str(line) for line in lines if line not in (None, ""))
    return strip_control_characters(text).strip() + "\n"


def docs_text_for_review(content: dict, doc_type: str) -> str:
    return cover_letter_plain_text(content) if doc_type == "cover_letter" else cv_plain_text(content)
