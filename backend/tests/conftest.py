"""Shared pytest fixtures.

Environment variables are set at import time, before ``app.main`` is imported, because
``get_settings()`` is cached and the SQLAlchemy engine is created at module import.
"""
from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path

import pytest

# --------------------------------------------------------------------------- environment
_TMP = Path(tempfile.mkdtemp(prefix="careerpilot-tests-"))

os.environ["CP_APP_ENV"] = "test"
os.environ["CP_DATABASE_URL"] = f"sqlite:///{_TMP / 'test.sqlite'}"
os.environ["CP_MEDIA_ROOT"] = str(_TMP / "media")
os.environ["CP_ENABLE_INLINE_WORKER"] = "false"
os.environ["CP_SECRET_KEY"] = "test-secret-key-0123456789abcdefghij"
os.environ["CP_AI_ENCRYPTION_KEY"] = "test-encryption-key-0123456789abcdef"
os.environ["CP_RATE_LIMIT_ENABLED"] = "false"
os.environ["CP_EXPOSE_DEV_TOKENS"] = "true"
os.environ["CP_ALLOWED_HOSTS"] = "localhost,127.0.0.1,testserver"
os.environ["CP_REQUIRE_EMAIL_VERIFICATION"] = "false"
os.environ["CP_DEBUG"] = "true"
# AI-path tests target a local stub endpoint to prove honest failure handling.
os.environ["CP_AI_ALLOW_PRIVATE_ENDPOINTS"] = "true"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.database.session import SessionLocal  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.tasks.handlers import execute_task  # noqa: E402
from app.tasks.queue import claim_next_task  # noqa: E402

PASSWORD = "TestPassword123"


# --------------------------------------------------------------------------- fixtures
@pytest.fixture(scope="session")
def client():
    with TestClient(fastapi_app, base_url="http://testserver") as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _isolate_session(client):
    """The TestClient is session-scoped; never leak cookies between tests."""
    client.cookies.clear()
    yield
    client.cookies.clear()


@pytest.fixture()
def api(client):
    """Authenticated client wrapper with per-test unique account."""
    return ApiClient(client)


class ApiClient:
    """Thin wrapper that adds CSRF headers and unique account registration."""

    def __init__(self, client: TestClient) -> None:
        self.client = client
        # Tests share a session-scoped TestClient, so start every test signed out.
        client.cookies.clear()
        self.email: str | None = None
        self.user: dict | None = None

    # -- helpers ---------------------------------------------------------
    def csrf(self) -> dict[str, str]:
        token = self.client.cookies.get("cp_csrf")
        return {"X-CSRF-Token": token} if token else {}

    def get(self, path: str, **kwargs):
        return self.client.get(f"/api/v1{path}", **kwargs)

    def post(self, path: str, json=None, **kwargs):
        return self.client.post(f"/api/v1{path}", json=json, headers=self.csrf(), **kwargs)

    def put(self, path: str, json=None, **kwargs):
        return self.client.put(f"/api/v1{path}", json=json, headers=self.csrf(), **kwargs)

    def patch(self, path: str, json=None, **kwargs):
        return self.client.patch(f"/api/v1{path}", json=json, headers=self.csrf(), **kwargs)

    def delete(self, path: str, **kwargs):
        return self.client.delete(f"/api/v1{path}", headers=self.csrf(), **kwargs)

    def upload(self, path: str, files):
        return self.client.post(f"/api/v1{path}", files=files, headers=self.csrf())

    def register(self, email: str | None = None, display_name: str = "Test Candidate") -> dict:
        self.email = email or f"user-{uuid.uuid4().hex[:12]}@example.com"
        response = self.post("/auth/register", json={
            "email": self.email,
            "password": PASSWORD,
            "display_name": display_name,
            "accept_terms": True,
        })
        assert response.status_code == 201, response.text
        self.user = response.json()["user"]
        return self.user

    def login(self, email: str, password: str = PASSWORD):
        response = self.post("/auth/login", json={"email": email, "password": password})
        assert response.status_code == 200, response.text
        self.email = email
        self.user = response.json()["user"]
        return self.user

    def logout(self):
        response = self.post("/auth/logout")
        assert response.status_code == 200, response.text

    # -- task draining ---------------------------------------------------
    def drain(self, limit: int = 25) -> list[str]:
        """Execute queued tasks synchronously (the worker is disabled in tests)."""
        executed: list[str] = []
        with SessionLocal() as db:
            for _ in range(limit):
                task = claim_next_task(db, "pytest-worker")
                if task is None:
                    break
                task_id = task.id
                execute_task(db, task)
                executed.append(task_id)
        return executed

    def wait_task(self, task_id: str, attempts: int = 25) -> dict:
        self.drain()
        for _ in range(attempts):
            response = self.get(f"/tasks/{task_id}")
            if response.status_code == 200:
                payload = response.json()
                if payload["status"] in {"completed", "failed", "cancelled"}:
                    return payload
            self.drain(2)
        raise AssertionError(f"Task {task_id} did not finish")


@pytest.fixture()
def registered(api):
    api.register()
    return api


# --------------------------------------------------------------------------- builders
def create_profile(api: ApiClient) -> dict:
    response = api.patch("/profile", json={
        "preferred_name": "Ada",
        "professional_headline": "Backend engineer · Python, PostgreSQL",
        "summary": (
            "Backend engineer with five years building Python APIs and data pipelines. "
            "I have shipped FastAPI services and PostgreSQL schemas for payments teams."
        ),
        "phone": "+2348000000000",
        "country": "Nigeria",
        "city": "Lagos",
        "work_locations": ["Lagos", "Remote"],
    })
    assert response.status_code in (200, 201), response.text
    return response.json()


def create_experience(api: ApiClient, **overrides) -> dict:
    payload = {
        "employer": "Northwind Systems",
        "title": "Backend Engineer",
        "employment_type": "full_time",
        "location": "Lagos",
        "start_date": "2021-02-01",
        "is_current": True,
        "description": "Built payment APIs in Python and PostgreSQL.",
        "achievements": ["Cut p95 API latency from 900ms to 240ms"],
        "tools": ["Python", "FastAPI", "PostgreSQL"],
        "verified": True,
        "provenance": "user_confirmed",
    }
    payload.update(overrides)
    response = api.post("/profile/experiences", json=payload)
    assert response.status_code in (200, 201), response.text
    return response.json()


def create_skill(api: ApiClient, name: str = "Python", **overrides) -> dict:
    payload = {
        "name": name,
        "category": "Languages",
        "proficiency": "advanced",
        "years_experience": 5,
        "evidence": "Used in production payment services",
        "verified": True,
        "provenance": "user_confirmed",
    }
    payload.update(overrides)
    response = api.post("/profile/skills", json=payload)
    assert response.status_code in (200, 201), response.text
    return response.json()


def create_job(api: ApiClient, **overrides) -> dict:
    payload = {
        "mode": "manual",
        "title": "Senior Backend Engineer",
        "company": "Acme Payments",
        "description": (
            "We are hiring a backend engineer to build payment APIs in Python and FastAPI. "
            "You will own PostgreSQL schemas, design REST services and improve reliability. "
            "Requirements: Python, FastAPI, PostgreSQL, Docker. Nice to have: Kubernetes."
        ),
        "save": True,
        "analyze": True,
    }
    payload.update(overrides)
    response = api.post("/jobs/import", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def create_strategy(api: ApiClient, job_id: str, approve: bool = True) -> dict:
    response = api.post(f"/jobs/{job_id}/strategy?use_ai=false")
    assert response.status_code in (200, 201), response.text
    strategy = response.json()
    if approve:
        response = api.patch(f"/jobs/strategies/{strategy['id']}", json={
            "positioning": strategy.get("positioning", ""),
            "selected_experience_ids": strategy.get("selected_experience_ids", []),
            "selected_project_ids": strategy.get("selected_project_ids", []),
            "selected_skill_ids": strategy.get("selected_skill_ids", []),
            "highlights": strategy.get("highlights", []),
            "gaps": strategy.get("gaps", []),
            "keywords": strategy.get("keywords", []),
            "approved": True,
        })
        assert response.status_code == 200, response.text
        strategy = response.json()
    return strategy


def generate_document(api: ApiClient, job_id: str, doc_type: str = "cv", **overrides) -> dict:
    payload = {
        "job_id": job_id,
        "doc_type": doc_type,
        "template": "ats",
        "tone": "professional",
        "length": "standard",
        "use_ai": False,
        "run_review": True,
    }
    payload.update(overrides)
    response = api.post("/documents/generate", json=payload)
    assert response.status_code == 202, response.text
    accepted = response.json()
    api.wait_task(accepted["task_id"])
    listing = api.get(f"/documents?job_id={job_id}&doc_type={doc_type}")
    assert listing.status_code == 200, listing.text
    items = listing.json()["items"]
    assert items, "document was not created"
    return api.get(f"/documents/{items[0]['id']}").json()


def make_ai_config(api: ApiClient, **overrides) -> dict:
    """Configure a local, unreachable OpenAI-compatible endpoint for AI-path tests."""
    payload = {
        "label": "Test provider",
        "provider": "openai_compatible",
        # Allowed loopback port with nothing listening: tests assert honest failure,
        # never fake AI output.
        "base_url": "http://127.0.0.1:1234/v1",
        "model": "test-model",
        "api_key": "integration-fixture-provider-credential",
        "disclosure_accepted": True,
        "is_active": True,
        "timeout_seconds": 5,
        "max_retries": 0,
    }
    # Sending profile content to a provider requires an accepted disclosure.
    accepted = api.post("/auth/accept-ai-disclosure", json={"accepted": True})
    assert accepted.status_code == 200, accepted.text
    payload.update(overrides)
    response = api.post("/ai/configs", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def make_pdf(path: Path, lines: list[str]) -> Path:
    from reportlab.lib.pagesizes import LETTER
    from reportlab.pdfgen import canvas

    painter = canvas.Canvas(str(path), pagesize=LETTER)
    y = 740
    for line in lines:
        painter.drawString(60, y, line)
        y -= 18
        if y < 60:
            painter.showPage()
            y = 740
    painter.save()
    return path


def make_docx(path: Path, paragraphs: list[str]) -> Path:
    from docx import Document as DocxDocument

    document = DocxDocument()
    for paragraph in paragraphs:
        document.add_paragraph(paragraph)
    document.save(str(path))
    return path


RESUME_LINES = [
    "Ada Okafor",
    "Backend Engineer",
    "ada@example.com | +2348000000000 | Lagos, Nigeria",
    "SUMMARY",
    "Backend engineer with five years of experience building Python APIs.",
    "EXPERIENCE",
    "Backend Engineer | Northwind Systems | Feb 2021 - Present",
    "- Built payment APIs in Python and PostgreSQL.",
    "- Reduced p95 latency by 60%.",
    "EDUCATION",
    "BSc Computer Science | University of Lagos | 2016 - 2020",
    "SKILLS",
    "Python, FastAPI, PostgreSQL, Docker, Git",
]
