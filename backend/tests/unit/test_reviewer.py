"""Reviewer rules: what must block approval, what is only a warning, and why."""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest

from app.documents.content import docs_text_for_review
from app.documents.reviewer import approval_blockers, review_document_rules
from app.services.profile_service import ProfileSnapshot


def _snapshot(**overrides) -> ProfileSnapshot:
    profile = ProfileSnapshot(
        user_id="user-1",
        name="Ada Okafor",
        email="ada@example.com",
        headline="Backend engineer",
        summary="Backend engineer with five years building payment APIs in Python.",
        phone="+2348000000000",
        city="Lagos",
        country="Nigeria",
        links={"github": "https://github.com/ada"},
        experiences=[
            SimpleNamespace(
                id="exp-1", employer="Northwind Systems", title="Senior Backend Engineer",
                description="Payments platform", leadership="Led four engineers",
                location="Lagos", achievements=["Cut p95 latency from 900ms to 240ms"],
                metrics=["p95 240ms"], tools=["Python", "PostgreSQL"],
                start_date=date(2021, 2, 1), end_date=None, verified=True,
                provenance="user_confirmed",
            )
        ],
        skills=[
            SimpleNamespace(id="s1", name="Python", category="Languages",
                            proficiency="advanced", verified=True, last_used=None,
                            evidence="Five years of production Python"),
            SimpleNamespace(id="s2", name="FastAPI", category="Frameworks",
                            proficiency="advanced", verified=True, last_used=None,
                            evidence="Built three production services"),
        ],
        years_experience=5.0,
        seniority="mid",
    )
    for key, value in overrides.items():
        setattr(profile, key, value)
    return profile


def _cv(**overrides) -> dict:
    content = {
        "schema": "cv.v1",
        "template": "ats",
        "header": {
            "name": "Ada Okafor", "headline": "Backend engineer",
            "email": "ada@example.com", "phone": "+2348000000000", "location": "Lagos",
            "links": [{"label": "GitHub", "url": "https://github.com/ada"}],
        },
        "summary": ("Backend engineer with five years building Python APIs for payments. "
                    "I led a four-person team and cut p95 latency from 900ms to 240ms."),
        "sections": [
            {"id": "experience", "type": "experience", "title": "Experience", "items": [{
                "id": "exp-1", "title": "Senior Backend Engineer",
                "subtitle": "Northwind Systems", "dates": "2021 - Present", "location": "Lagos",
                "bullets": ["Cut p95 latency from 900ms to 240ms using PostgreSQL indexes."],
            }]},
            {"id": "skills", "type": "skills", "title": "Skills", "groups": [
                {"category": "Languages", "items": ["Python (advanced)"]},
                {"category": "Frameworks", "items": ["FastAPI (advanced)"]},
            ]},
        ],
    }
    content.update(overrides)
    return content


def _review(content: dict, *, doc_type: str = "cv", profile=None, job=None):
    profile = profile or _snapshot()
    text = docs_text_for_review(content, doc_type)
    return review_document_rules(doc_type=doc_type, content=content, plain_text=text,
                                 profile=profile, job=job)


def test_a_grounded_cv_has_no_critical_findings():
    outcome = _review(_cv())
    assert outcome.critical == 0, outcome.findings
    assert approval_blockers(outcome.findings) == []


def test_unsupported_figure_is_critical_and_requires_confirmation():
    content = _cv()
    content["sections"][0]["items"][0]["bullets"] = [
        "Grew revenue by 430% and cut costs by $2.4M."]
    outcome = _review(content)
    critical = [f for f in outcome.findings if f["severity"] == "critical"]
    assert critical
    assert all(f["requires_confirmation"] for f in critical)
    assert any("430" in f["excerpt"] or "2.4" in f["excerpt"] for f in critical)
    assert approval_blockers(outcome.findings)


def test_claim_of_unverified_skill_is_critical():
    content = _cv()
    content["sections"][1]["groups"][0]["items"] = ["Python (advanced)", "Rust (expert)"]
    outcome = _review(content)
    critical = [f for f in outcome.findings if f["severity"] == "critical"]
    assert any("Rust" in f["excerpt"] for f in critical)


def test_placeholders_block_approval():
    content = _cv()
    content["summary"] = "Backend engineer with [X years] of experience and TBD impact."
    outcome = _review(content)
    assert outcome.critical >= 1
    assert any(f["category"] == "placeholder" for f in outcome.findings)


def test_missing_name_blocks_approval():
    content = _cv()
    content["header"] = {**content["header"], "name": ""}
    outcome = _review(content)
    assert outcome.critical >= 1
    assert any(f["category"] == "ats" for f in outcome.findings)


def test_warnings_do_not_block_approval():
    content = _cv()
    content["header"] = {**content["header"], "email": ""}
    content["summary"] = "Short summary."
    outcome = _review(content)
    assert outcome.critical == 0
    assert outcome.warning >= 1
    assert approval_blockers(outcome.findings) == []


def test_cover_letter_overstating_years_is_critical():
    letter = {
        "schema": "cover_letter.v1",
        "header": _cv()["header"],
        "date": "22 October 2026",
        "recipient": {"company": "Acme Payments", "role": "Senior Backend Engineer",
                      "location": "Remote"},
        "salutation": "Dear Hiring Manager,",
        "paragraphs": [
            "I am applying for the Senior Backend Engineer role at Acme Payments.",
            "I have 12 years of experience building payment APIs in Python and PostgreSQL.",
        ],
        "closing": "Sincerely,",
        "signature": "Ada Okafor",
    }
    outcome = _review(letter, doc_type="cover_letter")
    assert any(f["category"] == "factual_accuracy" and f["severity"] == "critical"
               for f in outcome.findings)


def test_cover_letter_missing_company_is_a_warning_not_a_blocker():
    letter = {
        "schema": "cover_letter.v1",
        "header": _cv()["header"],
        "date": "22 October 2026",
        "recipient": {"company": "", "role": "", "location": ""},
        "salutation": "Dear Hiring Manager,",
        "paragraphs": [
            "I build payment APIs in Python and PostgreSQL and have led small platform teams. "
            "I would welcome the chance to discuss how that experience maps to your roadmap. "
            "Thank you for considering my application.",
        ],
        "closing": "Sincerely,",
        "signature": "Ada Okafor",
    }
    job = SimpleNamespace(company="Acme Payments", title="Senior Backend Engineer",
                          description="Python FastAPI PostgreSQL payments",
                          skills=["Python"], technologies=["FastAPI"], requirements=[])
    outcome = _review(letter, doc_type="cover_letter", job=job)
    assert outcome.critical == 0
    assert any("company" in f["location"].lower() or "company" in f["explanation"].lower()
               for f in outcome.findings)


@pytest.mark.parametrize("severity", ["critical"])
def test_approval_blockers_only_include_critical_findings(severity):
    findings = [
        {"severity": "critical", "location": "skills", "explanation": "Unverified skill"},
        {"severity": "warning", "location": "summary", "explanation": "Short summary"},
        {"severity": "info", "location": "document", "explanation": "Consider adding a project"},
    ]
    blockers = approval_blockers(findings)
    assert len(blockers) == 1
    assert "Unverified skill" in blockers[0]
    assert approval_blockers([]) == []
    assert approval_blockers(None) == []
