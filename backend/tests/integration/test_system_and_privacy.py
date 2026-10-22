"""AI provider settings, master CV history, background tasks, privacy and account deletion."""
from __future__ import annotations

import json

from sqlalchemy import select

from app.database.base import utcnow
from app.database.session import SessionLocal
from app.models import AIProviderConfiguration, BackgroundTask
from tests.conftest import (
    PASSWORD,
    create_experience,
    create_job,
    create_profile,
    create_skill,
    make_ai_config,
)


# --------------------------------------------------------------------------- AI settings
def test_ai_status_reports_no_provider_honestly(api):
    api.register()
    status = api.get("/ai/status").json()
    assert status["configured"] is False
    assert status["disclosure_accepted"] is False
    assert "optional" in status["note"].lower()


def test_api_key_is_encrypted_and_never_returned(api):
    api.register()
    secret = "integration-fixture-provider-credential"
    config = make_ai_config(api, api_key=secret)
    assert "api_key" not in config
    assert "api_key_ciphertext" not in config
    assert config["has_api_key"] is True

    listing = api.get("/ai/configs")
    assert listing.status_code == 200
    body = listing.text
    assert secret not in body
    assert "ciphertext" not in body

    with SessionLocal() as db:
        row = db.scalar(select(AIProviderConfiguration).where(
            AIProviderConfiguration.user_id == api.user["id"]))
        assert row is not None
        assert row.api_key_ciphertext and secret not in row.api_key_ciphertext
        assert row.api_key_ciphertext.startswith(("gAAAAA", "v1:", "enc:"))

    status = api.get("/ai/status").json()
    assert status["configured"] is True
    assert status["disclosure_accepted"] is True


def test_ai_configuration_requires_disclosure_for_generation(api):
    api.register()
    job = create_job(api)["job"]
    api.post(f"/jobs/{job['id']}/strategy")
    response = api.post("/documents/generate", json={
        "job_id": job["id"], "doc_type": "cv", "template": "ats", "use_ai": True,
    })
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ai_not_configured"


def test_ai_configuration_crud(api):
    api.register()
    config = make_ai_config(api)
    assert config["provider"] == "openai_compatible"
    assert config["is_active"] is True

    updated = api.patch(f"/ai/configs/{config['id']}", json={
        "label": "Renamed provider", "provider": "openai_compatible",
        "base_url": "http://127.0.0.1:1234/v1", "model": "other-model",
        "temperature": 0.5, "max_output_tokens": 900,
        "disclosure_accepted": True, "is_active": True,
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()["label"] == "Renamed provider"

    assert api.post(f"/ai/configs/{config['id']}/activate").status_code == 200
    assert api.delete(f"/ai/configs/{config['id']}").status_code == 200
    assert api.get("/ai/configs").json() == []
    assert api.get("/ai/status").json()["configured"] is False


def test_invalid_ai_configuration_is_rejected(api):
    api.register()
    api.post("/auth/accept-ai-disclosure", json={"accepted": True})
    cases = [
        {"provider": "magic", "base_url": "https://api.openai.com/v1"},
        {"provider": "openai_compatible", "base_url": "ftp://api.example.com"},
        {"provider": "openai_compatible", "base_url": "https://api.openai.com:444/v1"},
        {"provider": "openai_compatible", "base_url": "https://api.openai.com/v1", "temperature": 5},
    ]
    for payload in cases:
        response = api.post("/ai/configs", json=payload)
        assert response.status_code == 422, (payload, response.text)


def test_provider_connection_test_failure_is_reported(api):
    api.register()
    config = make_ai_config(api)
    result = api.post(f"/ai/configs/{config['id']}/test")
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["ok"] is False
    assert body["status"] != "connected"
    assert body["message"]


def test_usage_reporting_is_real(api):
    api.register()
    usage = api.get("/ai/usage?days=30")
    assert usage.status_code == 200, usage.text
    payload = usage.json()
    assert payload["period_days"] == 30
    assert payload["requests"] == 0
    assert payload["output_tokens"] == 0
    # With no pricing table configured the API must say so, not invent a cost.
    assert payload["estimated_cost_usd"] is None
    assert "pricing" in payload["cost_note"].lower()


def test_ai_configs_are_isolated_between_users(client):
    from tests.conftest import ApiClient

    first = ApiClient(client)
    first.register()
    config = make_ai_config(first)

    with type(client)(client.app, base_url="http://testserver") as raw:
        second = ApiClient(raw)
        second.register()
        assert second.get("/ai/configs").json() == []
        assert second.patch(f"/ai/configs/{config['id']}", json={
            "provider": "openai_compatible", "base_url": "http://127.0.0.1:1234/v1",
            "model": "x", "disclosure_accepted": True,
        }).status_code == 404
        assert second.delete(f"/ai/configs/{config['id']}").status_code == 404


# --------------------------------------------------------------------------- master CV
def test_master_cv_versions_are_never_silently_overwritten(api):
    api.register()
    create_profile(api)
    create_experience(api)
    create_skill(api, "Python")

    master = api.get("/master-cv")
    assert master.status_code == 200, master.text
    initial = master.json()
    assert initial["current_version"] >= 1
    assert initial["content"]["schema"] == "cv.v1"
    assert "Northwind Systems" in str(initial["content"])

    content = initial["content"]
    edited = json.loads(json.dumps(content))
    edited["summary"] = "Backend engineer focused on payment reliability and API performance."
    updated = api.patch("/master-cv", json={"content": edited, "template": "backend_engineer"})
    assert updated.status_code == 200, updated.text
    revised = updated.json()
    assert revised["current_version"] > initial["current_version"]
    assert revised["template"] == "backend_engineer"
    assert revised["content"]["summary"].startswith("Backend engineer focused")
    versions = {version["version_number"]: version for version in revised["versions"]}
    assert initial["current_version"] in versions
    # History still holds the earlier summary.
    previous = versions[initial["current_version"]]
    assert previous["content"]["summary"] != revised["content"]["summary"]

    restored = api.post(f"/master-cv/restore/{previous['id']}")
    assert restored.status_code == 200, restored.text
    assert restored.json()["current_version"] == revised["current_version"] + 1
    assert restored.json()["content"]["summary"] == previous["content"]["summary"]


def test_master_cv_rebuild_uses_verified_profile_only(api):
    api.register()
    create_profile(api)
    create_experience(api, verified=True, provenance="user_confirmed")
    create_experience(api, employer="Unverified Co", verified=False,
                      provenance="imported_unconfirmed")
    api.get("/master-cv")
    rebuilt = api.post("/master-cv/rebuild", json={"template": "graduate"})
    assert rebuilt.status_code == 200, rebuilt.text
    text = str(rebuilt.json()["content"])
    assert "Northwind Systems" in text
    assert "Unverified Co" not in text


def test_master_cv_download(api):
    api.register()
    create_profile(api)
    create_experience(api)
    api.get("/master-cv")
    pdf = api.get("/master-cv/download/pdf")
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")
    assert "attachment" in pdf.headers.get("content-disposition", "")
    docx = api.get("/master-cv/download/docx")
    assert docx.status_code == 200
    assert docx.content.startswith(b"PK")
    assert api.get("/master-cv/download/exe").status_code == 422


def test_master_cv_rejects_malformed_content(api):
    api.register()
    api.get("/master-cv")
    response = api.patch("/master-cv", json={"content": {"schema": "not_a_cv"}})
    assert response.status_code == 422, response.text


# --------------------------------------------------------------------------- tasks
def test_task_can_be_cancelled_before_it_runs(api):
    api.register()
    api.post("/jobs/sources", json={"provider": "greenhouse", "board_token": "acme"})
    queued = api.post("/jobs/discover", json={"keywords": "python"}).json()
    task_id = queued["task_id"]

    cancelled = api.post(f"/tasks/{task_id}/cancel")
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    assert api.get(f"/tasks/{task_id}").json()["status"] == "cancelled"
    # A finished task cannot be cancelled again.
    assert api.post(f"/tasks/{task_id}/cancel").status_code == 409


def test_failed_task_can_be_retried(api):
    api.register()
    # Seed a genuinely failed task: retry must create a fresh queued attempt that keeps the
    # original payload, rather than mutating the failed record in place.
    with SessionLocal() as db:
        task = BackgroundTask(
            user_id=api.user["id"], task_type="job_discovery", title="Discovering jobs",
            status="failed", payload={"user_id": api.user["id"], "keywords": "python"},
            error="The board returned 503", attempts=2, queued_at=utcnow(),
        )
        db.add(task)
        db.commit()
        failed_id = task.id
    retried = api.post(f"/tasks/{failed_id}/retry")
    assert retried.status_code == 200, retried.text
    payload = retried.json()
    assert payload["status"] == "queued"
    assert payload["id"] != failed_id
    assert payload["attempts"] == 0
    assert api.get(f"/tasks/{failed_id}").json()["status"] == "failed"


def test_cancelled_task_can_be_retried(api):
    api.register()
    api.post("/jobs/sources", json={"provider": "greenhouse", "board_token": "acme"})
    task_id = api.post("/jobs/discover", json={"keywords": "python"}).json()["task_id"]
    api.post(f"/tasks/{task_id}/cancel")
    retried = api.post(f"/tasks/{task_id}/retry")
    assert retried.status_code == 200, retried.text
    assert retried.json()["status"] == "queued"


def test_retry_requires_a_failed_task(api):
    api.register()
    api.post("/jobs/sources", json={"provider": "greenhouse", "board_token": "acme"})
    queued = api.post("/jobs/discover", json={"keywords": "python"}).json()
    response = api.post(f"/tasks/{queued['task_id']}/retry")
    assert response.status_code in (400, 409), response.text


def test_worker_status_reports_availability(api):
    api.register()
    status = api.get("/tasks/worker-status")
    assert status.status_code == 200
    payload = status.json()
    assert payload["inline_worker_enabled"] is False
    assert payload["active_workers"] >= 0
    assert payload["queued_tasks"] >= 0
    assert payload["message"]


def test_tasks_are_isolated_between_users(client):
    from tests.conftest import ApiClient

    first = ApiClient(client)
    first.register()
    first.post("/jobs/sources", json={"provider": "greenhouse", "board_token": "acme"})
    task_id = first.post("/jobs/discover", json={"keywords": "python"}).json()["task_id"]

    with type(client)(client.app, base_url="http://testserver") as raw:
        second = ApiClient(raw)
        second.register()
        assert second.get(f"/tasks/{task_id}").status_code == 404
        assert second.post(f"/tasks/{task_id}/cancel").status_code == 404


# --------------------------------------------------------------------------- privacy
def test_privacy_summary_lists_real_categories(api):
    api.register()
    summary = api.get("/privacy/summary")
    assert summary.status_code == 200
    payload = summary.json()
    assert len(payload["data_categories"]) >= 4
    for category in payload["data_categories"]:
        assert {"category", "data", "purpose"} <= set(category)
    assert payload["retention"]
    assert payload["account_deletion"]
    assert payload["ai_transmission"]
    assert payload["export_available"] is True


def test_privacy_export_contains_this_users_data_only(client):
    from tests.conftest import ApiClient

    first = ApiClient(client)
    first.register(display_name="Export Me")
    create_profile(first)
    create_experience(first)
    create_job(first)
    exported = first.get("/privacy/export")
    assert exported.status_code == 200
    assert "attachment" in exported.headers.get("content-disposition", "")
    payload = exported.json()
    assert payload["format"] == "careerpilot-export-v1"
    assert payload["user"]["email"] == first.email
    assert payload["profile"]["preferred_name"] == "Ada"
    assert payload["jobs"]
    assert payload["experiences"]
    assert payload["exported_counts"]["jobs"] == len(payload["jobs"])

    with type(client)(client.app, base_url="http://testserver") as raw:
        second = ApiClient(raw)
        second.register(display_name="Other Person")
        other_export = second.get("/privacy/export").json()
        assert other_export["user"]["email"] != first.email
        assert not other_export["jobs"]
        assert first.email not in json.dumps(other_export)


def test_account_deletion_requires_password_and_confirmation(api):
    api.register()
    assert api.post("/auth/delete-account", json={
        "password": "WrongPassword123", "confirm": "DELETE"}).status_code == 401
    assert api.post("/auth/delete-account", json={
        "password": PASSWORD, "confirm": "delete"}).status_code == 200
    assert api.get("/auth/me").status_code == 401


def test_account_deletion_requires_the_literal_confirmation(api):
    api.register()
    response = api.post("/auth/delete-account", json={"password": PASSWORD, "confirm": "yes"})
    assert response.status_code == 422
    assert api.get("/auth/me").status_code == 200


def test_deleted_account_data_is_gone(api):
    api.register()
    email = api.email
    api.get("/privacy/export")
    deleted = api.post("/auth/delete-account", json={"password": PASSWORD, "confirm": "DELETE"})
    assert deleted.status_code == 200
    api.client.cookies.clear()
    login = api.client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code in (400, 401)
    # The address can be registered again: nothing was left behind.
    again = api.client.post("/api/v1/auth/register", json={
        "email": email, "password": PASSWORD, "display_name": "New Start", "accept_terms": True,
    })
    assert again.status_code == 201, again.text


def test_feedback_endpoint_accepts_and_validates(api):
    response = api.client.post("/api/v1/feedback", json={
        "message": "The calendar view is genuinely useful.", "email": "reader@example.com",
        "category": "feedback", "page": "/tracker"})
    assert response.status_code in (200, 201), response.text
    assert api.client.post("/api/v1/feedback", json={"message": "x"}).status_code == 422
    assert api.client.post("/api/v1/feedback",
                           json={"message": "Clear and useful"}).status_code in (200, 201)
