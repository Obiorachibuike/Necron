"""Document rendering and validation: exports must be genuinely openable files."""
from __future__ import annotations

import io
import zipfile

import pytest

from app.documents.content import TEMPLATE_KEYS, TEMPLATE_INFO, build_cv_content
from app.documents.renderers import (
    render_document,
    render_docx,
    render_pdf,
    render_tex,
    render_text,
    validate_docx,
    validate_pdf,
)

CONTENT = {
    "schema": "cv.v1",
    "template": "ats",
    "header": {
        "name": "Ada Okafor",
        "headline": "Backend Engineer",
        "email": "ada@example.com",
        "phone": "+2348000000000",
        "location": "Lagos, Nigeria",
        "links": [{"label": "GitHub", "url": "https://github.com/ada"}],
    },
    "summary": "Backend engineer building payment APIs in Python and PostgreSQL.",
    "sections": [
        {
            "id": "experience", "type": "experience", "title": "Experience",
            "items": [{
                "id": "exp-1", "title": "Backend Engineer", "subtitle": "Northwind Systems",
                "location": "Lagos", "dates": "Feb 2021 – Present",
                "bullets": ["Built payment APIs in Python and PostgreSQL.",
                            "Reduced p95 latency from 900ms to 240ms."],
            }],
        },
        {
            "id": "skills", "type": "skills", "title": "Skills",
            "groups": [{"category": "Languages", "items": ["Python (advanced)", "SQL"]}],
        },
        {
            "id": "education", "type": "education", "title": "Education",
            "items": [{"id": "edu-1", "title": "BSc Computer Science",
                       "subtitle": "University of Lagos", "dates": "2016 – 2020", "bullets": []}],
        },
    ],
}


@pytest.mark.parametrize("template", sorted(TEMPLATE_KEYS))
def test_every_template_renders_a_valid_pdf(template):
    content = {**CONTENT, "template": template}
    data = render_pdf(content, "cv")
    ok, message = validate_pdf(data)
    assert ok, f"{template}: {message}"
    assert data.startswith(b"%PDF")
    assert b"%%EOF" in data[-2048:]


def test_all_eight_templates_are_distinct_and_documented():
    assert len(TEMPLATE_INFO) == 8
    assert TEMPLATE_KEYS == {
        "ats", "modern_developer", "fullstack_engineer", "backend_engineer",
        "ai_engineer", "mobile_developer", "graduate", "academic",
    }
    for item in TEMPLATE_INFO:
        assert item["label"] and item["description"] and item["best_for"]
        assert item["ats_safe"] is True


def test_docx_export_is_a_valid_office_document():
    data = render_docx(CONTENT, "cv")
    ok, message = validate_docx(data)
    assert ok, message
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        assert "word/document.xml" in names
        xml = archive.read("word/document.xml").decode("utf-8")
    assert "Ada Okafor" in xml
    assert "Northwind Systems" in xml


def test_text_export_contains_the_evidence_and_no_html_escapes():
    data = render_text(CONTENT, "cv")
    text = data.decode("utf-8")
    assert "Ada Okafor" in text
    assert "Backend Engineer" in text
    assert "Reduced p95 latency from 900ms to 240ms." in text
    assert "<" not in text


def test_tex_export_is_compilable_looking_source():
    tex = render_tex(CONTENT, "cv").decode("utf-8")
    assert "\\documentclass" in tex
    assert "\\begin{document}" in tex
    assert "\\end{document}" in tex
    assert "Ada Okafor" in tex


@pytest.mark.parametrize("fmt", ["pdf", "docx", "txt", "tex"])
def test_render_document_dispatch_returns_bytes_and_validation_note(fmt):
    data, note = render_document(CONTENT, "cv", fmt)
    assert data
    assert note
    if fmt == "pdf":
        assert validate_pdf(data)[0]
    if fmt == "docx":
        assert validate_docx(data)[0]


def test_render_document_rejects_unknown_format():
    from app.documents.renderers import RenderError

    with pytest.raises(RenderError):
        render_document(CONTENT, "cv", "rtf")


def test_cover_letter_renders():
    cover = {
        "schema": "cover_letter.v1",
        "header": CONTENT["header"],
        "date": "22 October 2026",
        "recipient": {"company": "Acme Payments", "role": "Senior Backend Engineer",
                      "location": "Remote"},
        "salutation": "Dear Hiring Manager,",
        "paragraphs": ["I build payment APIs in Python and PostgreSQL.",
                       "I would like to discuss the Senior Backend Engineer role."],
        "closing": "Sincerely,",
        "signature": "Ada Okafor",
    }
    pdf = render_pdf(cover, "cover_letter")
    ok, message = validate_pdf(pdf)
    assert ok, message
    text = render_text(cover, "cover_letter").decode("utf-8")
    assert "Acme Payments" in text
    assert "Sincerely" in text


def test_validation_rejects_garbage_bytes():
    ok, _message = validate_pdf(b"not a pdf at all")
    assert ok is False
    ok, _message = validate_docx(b"PK-but-not-really")
    assert ok is False


def test_unicode_and_long_urls_do_not_break_rendering():
    content = {
        **CONTENT,
        "header": {**CONTENT["header"], "name": "Chinwe Ọkọonkwo", "location": "Zürich, Schweiz"},
        "summary": "Engineer with experience across EMEA — ñ, é, ü, 漢字.",
        "sections": [{
            "id": "projects", "type": "projects", "title": "Projects",
            "items": [{
                "id": "p1", "title": "Portfolio", "subtitle": "Python",
                "dates": "", "bullets": ["See https://example.com/" + "very-long-path/" * 12],
            }],
        }],
    }
    pdf = render_pdf(content, "cv")
    ok, message = validate_pdf(pdf)
    assert ok, message
    docx_bytes = render_docx(content, "cv")
    ok, message = validate_docx(docx_bytes)
    assert ok, message


def test_build_cv_content_uses_only_verified_records():
    from app.services.profile_service import ProfileSnapshot

    class Record:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    verified = Record(id="exp-1", title="Backend Engineer", employer="Northwind",
                      location="Lagos", start_date=None, end_date=None, is_current=True,
                      description="Built APIs.", achievements=["Shipped payments"],
                      tools=["Python"], verified=True, leadership="", metrics=[])
    unverified = Record(id="exp-2", title="Invented Role", employer="Imaginary Corp",
                        location="", start_date=None, end_date=None, is_current=False,
                        description="", achievements=[], tools=[], verified=False,
                        leadership="", metrics=[])
    snapshot = ProfileSnapshot(
        user_id="u", name="Ada Okafor", email="ada@example.com", headline="Backend Engineer",
        summary="", phone="", city="Lagos", country="Nigeria", links={},
        experiences=[verified, unverified], skills=[], education=[], projects=[],
        certifications=[], achievements=[], preferences=None, writing_style=None,
    )
    content = build_cv_content(snapshot, template="ats", variant="master")
    bullet_text = str(content)
    assert "Northwind" in bullet_text
    assert "Imaginary Corp" not in bullet_text
    assert content["provenance"] == "verified_profile_only"
