"""Career profile CRUD, verification rules, draft persistence and onboarding completion."""
from __future__ import annotations

import dataclasses
from pathlib import Path

import pytest

from tests.conftest import RESUME_LINES, create_experience, create_profile, create_skill, make_docx, make_pdf


def test_profile_patch_and_bundle(api):
    api.register()
    profile = create_profile(api)
    assert profile["professional_headline"]
    bundle = api.get("/profile")
    assert bundle.status_code == 200
    payload = bundle.json()
    assert payload["profile"]["city"] == "Lagos"
    assert payload["completeness"] >= 0
    assert "analysis" in payload or "summary" in payload


def test_professional_headline_field_name_is_enforced(api):
    api.register()
    response = api.patch("/profile", json={"headline": "Backend engineer"})
    assert response.status_code == 422, "the API must not silently accept an unknown field"


def test_experience_crud_and_verification(api):
    api.register()
    experience = create_experience(api, verified=False, provenance="imported_unconfirmed")
    assert experience["verified"] is False
    assert experience["provenance"] == "imported_unconfirmed"

    verified = api.post("/profile/verify", json={
        "entity_type": "experience", "entity_ids": [experience["id"]], "verified": True,
    })
    assert verified.status_code == 200, verified.text

    updated = api.put(f"/profile/experiences/{experience['id']}", json={
        "employer": "Northwind Systems", "title": "Senior Backend Engineer",
        "start_date": "2021-02-01", "is_current": True,
        "achievements": ["Cut p95 latency from 900ms to 240ms"], "verified": True,
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()["title"] == "Senior Backend Engineer"

    deleted = api.delete(f"/profile/experiences/{experience['id']}")
    assert deleted.status_code == 200
    assert api.delete(f"/profile/experiences/{experience['id']}").status_code == 404


def test_current_role_cannot_have_an_end_date(api):
    api.register()
    response = api.post("/profile/experiences", json={
        "employer": "Acme", "title": "Engineer", "is_current": True, "end_date": "2024-01-01",
    })
    assert response.status_code == 422


def test_date_range_validation(api):
    api.register()
    response = api.post("/profile/experiences", json={
        "employer": "Acme", "title": "Engineer",
        "start_date": "2024-01-01", "end_date": "2020-01-01",
    })
    assert response.status_code == 422


def test_expert_skill_requires_evidence(api):
    api.register()
    response = api.post("/profile/skills", json={
        "name": "Kubernetes", "category": "Infrastructure", "proficiency": "expert",
        "evidence": "",
    })
    assert response.status_code == 422
    ok = create_skill(api, "Kubernetes", proficiency="expert",
                      evidence="Ran production clusters for two years")
    assert ok["proficiency"] == "expert"


def test_skill_last_used_cannot_be_in_the_future(api):
    api.register()
    response = api.post("/profile/skills", json={
        "name": "Go", "proficiency": "intermediate", "last_used": "2999-01-01",
    })
    assert response.status_code == 422


@pytest.mark.parametrize("collection,payload", [
    ("education", {"institution": "University of Lagos", "qualification": "BSc Computer Science",
                   "start_date": "2016-09-01", "end_date": "2020-07-01", "status": "completed"}),
    ("projects", {"name": "Payments gateway", "description": "FastAPI service",
                  "technologies": ["Python", "FastAPI"], "repo_url": "https://github.com/ada/pay"}),
    ("certifications", {"name": "AWS Solutions Architect", "issuer": "Amazon",
                        "issue_date": "2023-05-01"}),
    ("achievements", {"title": "Employee of the year", "category": "professional",
                      "description": "Recognised for reliability work"}),
])
def test_collection_crud(api, collection, payload):
    api.register()
    created = api.post(f"/profile/{collection}", json=payload)
    assert created.status_code == 201, created.text
    entity = created.json()
    updated = api.put(f"/profile/{collection}/{entity['id']}", json=payload)
    assert updated.status_code == 200
    assert api.delete(f"/profile/{collection}/{entity['id']}").status_code == 200


def test_preferences_and_writing_style(api):
    api.register()
    preferences = api.put("/profile/preferences", json={
        "desired_titles": ["Backend Engineer"],
        "work_arrangements": ["remote", "hybrid"],
        "employment_types": ["full_time"],
        "currency": "USD", "salary_min": 60000, "salary_max": 90000,
        "relocation": "maybe",
    })
    assert preferences.status_code == 200, preferences.text
    assert preferences.json()["salary_max"] == 90000

    invalid = api.put("/profile/preferences", json={
        "work_arrangements": ["teleport"], "salary_min": 100, "salary_max": 50,
    })
    assert invalid.status_code == 422

    style = api.put("/profile/writing-style", json={
        "tone": "direct", "avoid_words": ["synergy"], "cover_letter_length": "standard",
    })
    assert style.status_code == 200, style.text
    assert style.json()["avoid_words"] == ["synergy"]


def test_profile_requires_authentication(client):
    assert client.get("/api/v1/profile").status_code == 401


# --------------------------------------------------------------------------- onboarding
def test_onboarding_status_starts_empty(api):
    api.register()
    status = api.get("/onboarding/status")
    assert status.status_code == 200, status.text
    payload = status.json()
    assert payload["completed"] is False
    assert payload["step"] == 1
    # Registration creates an empty draft so the wizard always has a row to update.
    assert payload["draft"]["data"] == {}
    assert payload["ai_configured"] is False


def test_onboarding_draft_is_resumable_and_merged(api):
    api.register()
    first = api.put("/onboarding/draft", json={
        "step": 3, "data": {"objectives": ["remote_work"], "profile": {"city": "Lagos"}},
    })
    assert first.status_code == 200, first.text
    assert first.json()["step"] == 3

    second = api.put("/onboarding/draft", json={
        "step": 5, "data": {"profile": {"country": "Nigeria"}},
    })
    assert second.status_code == 200
    data = second.json()["data"]
    assert data["objectives"] == ["remote_work"]
    assert data["profile"] == {"city": "Lagos", "country": "Nigeria"}

    status = api.get("/onboarding/status").json()
    assert status["step"] == 5
    assert status["draft"]["step"] == 5


def test_onboarding_draft_step_bounds(api):
    api.register()
    assert api.put("/onboarding/draft", json={"step": 0, "data": {}}).status_code == 422
    assert api.put("/onboarding/draft", json={"step": 12, "data": {}}).status_code == 422


def test_cv_import_extracts_and_does_not_apply(tmp_path: Path, api):
    api.register()
    pdf = make_pdf(tmp_path / "ada-cv.pdf", RESUME_LINES)
    with pdf.open("rb") as handle:
        response = api.upload("/onboarding/import-cv",
                              files={"file": ("ada-cv.pdf", handle, "application/pdf")})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["can_apply"] is True
    assert payload["upload_id"]
    extracted = payload["extracted"]
    assert extracted["requires_review"] is True
    # Nothing is written to the profile until the user confirms.
    assert api.get("/profile").json()["experiences"] == []


def test_cv_import_accepts_docx(tmp_path: Path, api):
    api.register()
    docx = make_docx(tmp_path / "ada-cv.docx", RESUME_LINES)
    with docx.open("rb") as handle:
        response = api.upload("/onboarding/import-cv",
                              files={"file": ("ada-cv.docx", handle,
                                              "application/vnd.openxmlformats-officedocument."
                                              "wordprocessingml.document")})
    assert response.status_code == 200, response.text
    assert response.json()["can_apply"] is True


def test_cv_import_rejects_unsupported_type(api):
    api.register()
    response = api.upload("/onboarding/import-cv",
                          files={"file": ("notes.txt", b"just text", "text/plain")})
    assert response.status_code in (400, 415, 422), response.text


def test_cv_import_rejects_empty_file(api):
    api.register()
    response = api.upload("/onboarding/import-cv",
                          files={"file": ("empty.pdf", b"", "application/pdf")})
    assert response.status_code in (400, 415, 422), response.text


def test_onboarding_complete_persists_and_dedupes(api):
    api.register()
    experience = {
        "employer": "Northwind Systems", "title": "Backend Engineer",
        "start_date": "2021-02-01", "is_current": True,
        "achievements": ["Shipped payment APIs"], "provenance": "user_confirmed", "verified": True,
    }
    education = {
        "institution": "University of Lagos", "qualification": "BSc Computer Science",
        "start_date": "2016-09-01", "end_date": "2020-07-01", "is_current": False,
        "provenance": "user_confirmed", "verified": True,
    }
    skill = {"name": "Python", "category": "Languages", "proficiency": "advanced",
             "provenance": "user_confirmed", "verified": True}
    project = {"name": "Payments gateway", "description": "FastAPI service",
               "technologies": ["Python"], "is_current": True,
               "provenance": "user_confirmed", "verified": True}

    payload = {
        "data": {"objectives": ["remote_work"]},
        "profile": {"preferred_name": "Ada", "professional_headline": "Backend engineer",
                    "career_objectives": ["remote_work", "interview_preparation"]},
        "experiences": [experience, experience],  # duplicate must be skipped
        "education": [education],
        "skills": [skill],
        "projects": [project],
        "preferences": {"desired_titles": ["Backend Engineer"], "work_arrangements": ["remote"]},
        "writing_style": {"tone": "direct"},
    }
    response = api.post("/onboarding/complete", json=payload)
    assert response.status_code == 200, response.text
    status = response.json()
    assert status["completed"] is True
    assert status["step"] == 11

    bundle = api.get("/profile").json()
    assert len(bundle["experiences"]) == 1, "duplicate onboarding entries must not be stored twice"
    assert bundle["experiences"][0]["verified"] is True
    assert bundle["education"][0]["status"] == "completed"
    assert len(bundle["skills"]) == 1
    assert bundle["profile"]["career_objectives"] == ["remote_work", "interview_preparation"]
    # is_current on education must map to status, never crash or create a bad column.
    assert api.get("/auth/me").json()["onboarding_completed"] is True


def test_onboarding_complete_rejects_unknown_objectives(api):
    api.register()
    response = api.post("/onboarding/complete", json={
        "data": {"objectives": ["become_astronaut"]},
        "profile": {"career_objectives": ["become_astronaut"]},
    })
    assert response.status_code == 200, response.text
    bundle = api.get("/profile").json()
    assert "become_astronaut" not in bundle["profile"]["career_objectives"]


def test_onboarding_complete_marks_import_applied(tmp_path: Path, api):
    api.register()
    pdf = make_pdf(tmp_path / "cv.pdf", RESUME_LINES)
    with pdf.open("rb") as handle:
        imported = api.upload("/onboarding/import-cv",
                              files={"file": ("cv.pdf", handle, "application/pdf")}).json()
    response = api.post("/onboarding/complete", json={
        "data": {},
        "profile": {"preferred_name": "Ada"},
        "cv_import": {"upload_id": imported["upload_id"]},
    })
    assert response.status_code == 200, response.text
    uploads = api.get("/onboarding/imports").json()
    assert uploads[0]["status"] == "applied_and_reviewed"
