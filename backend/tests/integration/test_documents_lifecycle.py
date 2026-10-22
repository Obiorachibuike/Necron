"""Document generation, reviewer gates, versioning, approval and export validation."""
from __future__ import annotations

import io

from docx import Document as DocxDocument
from pypdf import PdfReader

from tests.conftest import (
    make_ai_config,
    create_experience,
    create_job,
    create_profile,
    create_skill,
    create_strategy,
)


def _ready_job(api):
    create_profile(api)
    create_experience(api)
    create_skill(api, "Python")
    create_skill(api, "FastAPI", category="Frameworks")
    job = create_job(api)["job"]
    # Generation is gated on an approved strategy: the user must choose the positioning.
    create_strategy(api, job["id"], approve=True)
    return job


def _generate(api, job_id, **overrides):
    payload = {"job_id": job_id, "doc_type": "cv", "template": "ats", "use_ai": False,
               "run_review": True, "length": "standard", "tone": "direct"}
    payload.update(overrides)
    response = api.post("/documents/generate", json=payload)
    assert response.status_code == 202, response.text
    task_id = response.json()["task_id"]
    api.drain()
    task = api.get(f"/tasks/{task_id}").json()
    assert task["status"] == "completed", task
    document_id = (task.get("result") or {}).get("document_id")
    assert document_id, task
    return document_id


def _review_for_current_version(detail: dict) -> dict:
    """Reviews are returned newest first and cover one version each."""
    matches = [r for r in detail["reviews"] if r["version_number"] == detail["current_version"]]
    assert matches, detail["reviews"]
    return matches[0]


def _inject_skill_claim(api, document_id: str, skill: str) -> None:
    """Add a skill to the CV's skills section that the profile never verifies."""
    detail = api.get(f"/documents/{document_id}").json()
    content = detail["current_content"]
    sections = []
    for section in content.get("sections", []):
        if section.get("type") == "skills":
            groups = [dict(group) for group in section.get("groups", [])]
            if groups:
                groups[0]["items"] = [*groups[0].get("items", []), skill]
            else:
                groups = [{"category": "General", "items": [skill]}]
            section = {**section, "groups": groups}
        sections.append(section)
    response = api.patch(f"/documents/{document_id}", json={
        "content": {**content, "sections": sections},
        "change_note": f"added unverified skill {skill}",
    })
    assert response.status_code == 200, response.text


def test_templates_are_eight_distinct_layouts(api):
    api.register()
    response = api.get("/documents/templates")
    assert response.status_code == 200
    templates = response.json()
    assert len(templates) == 8
    keys = {item["key"] for item in templates}
    assert keys == {"ats", "modern_developer", "fullstack_engineer", "backend_engineer",
                    "ai_engineer", "mobile_developer", "graduate", "academic"}
    for item in templates:
        assert item["label"] and item["description"]
        assert "cv" in item["doc_types"]
        assert item["heading_style"]
    # Every template must differ from every other in its actual layout recipe, not just
    # its description: section order, heading treatment, alignment and column structure.
    recipes = {
        (item["layout"], item["heading_style"], item["name_align"],
         tuple(item["order"]), item["skills_two_column"])
        for item in templates
    }
    assert len(recipes) == 8
    assert len({item["heading_style"] for item in templates}) >= 5
    assert len({item["layout"] for item in templates}) >= 3


def test_generate_requires_explicit_consent_to_use_ai(api):
    api.register()
    job = _ready_job(api)
    response = api.post("/documents/generate", json={
        "job_id": job["id"], "doc_type": "cv", "template": "ats", "use_ai": True,
    })
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "ai_not_configured"


def test_generation_is_queued_then_completes_with_provenance(api):
    api.register()
    job = _ready_job(api)
    document_id = _generate(api, job["id"])

    detail = api.get(f"/documents/{document_id}").json()
    assert detail["status"] in {"needs_review", "draft", "ready_for_approval"}
    assert len(detail["versions"]) == 1
    version = detail["versions"][0]
    assert version["version_number"] == 1
    assert version["created_by"] in {"ai_drafter", "deterministic_drafter"}
    assert detail["current_content"]["schema"] == "cv.v1"
    # Only verified facts reach the document.
    assert "Northwind Systems" in str(detail["current_content"])
    # Links are objects in the CV schema, never bare strings.
    links = detail["current_content"]["header"].get("links", [])
    assert all(isinstance(link, dict) and {"label", "url"} <= set(link) for link in links)


def test_export_produces_validated_files(api):
    api.register()
    job = _ready_job(api)
    document_id = _generate(api, job["id"])
    api.post(f"/documents/{document_id}/approve", json={"acknowledge_warnings": True})

    result = api.post(f"/documents/{document_id}/export",
                      json={"formats": ["pdf", "docx", "txt"]})
    assert result.status_code == 200, result.text
    files = {(item["fmt"], item["validated"]) for item in result.json()["files"]}
    assert files == {("pdf", True), ("docx", True), ("txt", True)}

    pdf = api.get(f"/documents/{document_id}/download/pdf")
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")
    text = "".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(pdf.content)).pages)
    assert "Northwind Systems" in text
    assert "Ada" in text  # the preferred name the candidate set
    assert len(text) > 400, "the exported PDF must contain real content, not a blank page"

    docx = api.get(f"/documents/{document_id}/download/docx")
    assert docx.status_code == 200
    parsed = DocxDocument(io.BytesIO(docx.content))
    body = "\n".join(paragraph.text for paragraph in parsed.paragraphs)
    assert "Northwind Systems" in body

    txt = api.get(f"/documents/{document_id}/download/txt")
    assert txt.status_code == 200
    assert "Northwind Systems" in txt.text


def test_unapproved_export_is_refused(api):
    api.register()
    job = _ready_job(api)
    document_id = _generate(api, job["id"])
    response = api.post(f"/documents/{document_id}/export", json={"formats": ["pdf"]})
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "not_approved"


def test_critical_review_findings_block_approval_until_resolved(api):
    api.register()
    job = _ready_job(api)
    document_id = _generate(api, job["id"])

    detail = api.get(f"/documents/{document_id}").json()
    version_number = detail["versions"][-1]["version_number"]
    original_content = detail["current_content"]

    # Inject a factual claim that the reviewer must catch: a skill the profile never proves.
    _inject_skill_claim(api, document_id, "Rust")

    reviewed = api.post(f"/documents/{document_id}/review", json={"use_ai": False})
    assert reviewed.status_code == 202, reviewed.text
    api.drain()
    detail = api.get(f"/documents/{document_id}").json()
    report = _review_for_current_version(detail)
    assert report["critical_count"] >= 1
    critical = [f for f in report["findings"] if f["severity"] == "critical"]
    assert critical, report
    assert any("Rust" in (f.get("excerpt") or "") or "Rust" in f["explanation"] for f in critical)

    refusal = api.post(f"/documents/{document_id}/approve", json={"acknowledge_warnings": True})
    assert refusal.status_code == 409, refusal.text
    assert refusal.json()["error"]["code"] == "critical_findings"
    assert api.get(f"/documents/{document_id}").json()["status"] != "approved"

    # Removing the fabricated claim clears the gate.
    fixed = api.patch(f"/documents/{document_id}", json={
        "content": original_content,
        "change_note": "removed unverified skill",
    })
    assert fixed.status_code == 200
    api.post(f"/documents/{document_id}/review", json={"use_ai": False})
    api.drain()
    approved = api.post(f"/documents/{document_id}/approve", json={})
    assert approved.status_code == 200, approved.text
    assert api.get(f"/documents/{document_id}").json()["status"] == "approved"
    # The original version must still exist: edits create versions, they never overwrite.
    versions = api.get(f"/documents/{document_id}").json()["versions"]
    assert len(versions) >= 2
    numbers = [v["version_number"] for v in versions]
    assert numbers == sorted(numbers, reverse=True)  # newest first in the API
    assert any(v["version_number"] == version_number for v in versions)


def test_revision_task_produces_a_new_version_and_keeps_history(api):
    api.register()
    job = _ready_job(api)
    document_id = _generate(api, job["id"])
    detail = api.get(f"/documents/{document_id}").json()

    # Introduce an unsupported claim so there is something real to revise.
    _inject_skill_claim(api, document_id, "Rust")
    api.post(f"/documents/{document_id}/review", json={"use_ai": False})
    api.drain()
    before = api.get(f"/documents/{document_id}").json()
    assert _review_for_current_version(before)["critical_count"] >= 1

    response = api.post(f"/documents/{document_id}/revise",
                        json={"use_ai": False, "max_rounds": 2})
    assert response.status_code == 202, response.text
    api.drain()

    after = api.get(f"/documents/{document_id}").json()
    assert len(after["versions"]) > len(before["versions"])
    assert after["current_version"] > before["current_version"]
    # The unsupported claim is gone and the document can be approved.
    assert "Rust" not in str(after["current_content"])
    assert _review_for_current_version(after)["critical_count"] == 0
    assert after["can_approve"] is True
    assert after["approval_blockers"] == []
    numbers = [v["version_number"] for v in after["versions"]]
    assert numbers == sorted(numbers, reverse=True)


def test_cover_letter_uses_the_real_schema(api):
    api.register()
    job = _ready_job(api)
    document_id = _generate(api, job["id"], doc_type="cover_letter", template="ats")
    detail = api.get(f"/documents/{document_id}").json()
    content = detail["current_content"]
    assert content["schema"] == "cover_letter.v1"
    assert content["recipient"]["company"] == "Acme Payments"
    assert content["salutation"]
    assert content["paragraphs"] and all(isinstance(p, str) for p in content["paragraphs"])
    assert content["closing"]
    assert content["signature"]
    # It must name the employer from the listing, not invent one.
    assert content["recipient"]["company"] in str(content["paragraphs"])


def test_documents_are_isolated_between_users(client):
    from tests.conftest import ApiClient

    first = ApiClient(client)
    first.register()
    job = _ready_job(first)
    document_id = _generate(first, job["id"])

    with type(client)(client.app, base_url="http://testserver") as raw:
        second = ApiClient(raw)
        second.register()
        for path in (f"/documents/{document_id}", f"/documents/{document_id}/download/pdf"):
            assert second.get(path).status_code == 404
        assert second.post(f"/documents/{document_id}/approve", json={}).status_code == 404
        listing = second.get("/documents").json()
        assert all(item["id"] != document_id for item in listing["items"])


def test_duplicate_generation_reuses_the_document(api):
    api.register()
    job = _ready_job(api)
    first = _generate(api, job["id"])
    second = _generate(api, job["id"], use_ai=False)
    assert first == second, "regenerating the same document type for a job must version, not fork"
    assert len(api.get(f"/documents/{first}").json()["versions"]) == 2


def test_export_rejects_unknown_format(api):
    api.register()
    job = _ready_job(api)
    document_id = _generate(api, job["id"])
    api.post(f"/documents/{document_id}/approve", json={"acknowledge_warnings": True})
    response = api.post(f"/documents/{document_id}/export", json={"formats": ["exe"]})
    assert response.status_code == 422


def test_document_link_to_application(api):
    api.register()
    job = _ready_job(api)
    document_id = _generate(api, job["id"])
    application = api.post("/applications", json={
        "job_id": job["id"], "cv_document_id": document_id,
        "status": "documents_in_progress",
    })
    assert application.status_code == 201, application.text
    linked = api.post(f"/documents/{document_id}/link-application",
                      json={"application_id": application.json()["id"]})
    assert linked.status_code == 200, linked.text


def test_ai_generation_with_configured_provider_is_recorded(api):
    api.register()
    job = _ready_job(api)
    make_ai_config(api)
    response = api.post("/documents/generate", json={
        "job_id": job["id"], "doc_type": "cv", "template": "modern_developer",
        "use_ai": True, "run_review": True,
    })
    assert response.status_code == 202, response.text
    task_id = response.json()["task_id"]
    api.drain()
    task = api.get(f"/tasks/{task_id}").json()
    # The configured endpoint is unreachable. The run must not claim AI output: it completes
    # with a clearly-labelled deterministic draft and a notice explaining what happened.
    assert task["status"] == "completed", task
    result = task["result"]
    assert result["ai_used"] is False
    assert result["ai_requested"] is True
    assert "unavailable" in result["ai_notice"].lower()
    document = api.get(f"/documents/{result['document_id']}").json()
    assert document["source"] == "deterministic"
    assert document["current_content"]["provenance"] == "verified_profile_only"
