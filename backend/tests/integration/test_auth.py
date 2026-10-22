"""Authentication, sessions, CSRF and account isolation."""
from __future__ import annotations

from tests.conftest import PASSWORD


def test_health_and_readiness(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    ready = client.get("/api/v1/health/ready")
    assert ready.status_code == 200
    assert ready.json()["checks"]["database"] == "ok"


def test_openapi_is_versioned_and_documents_endpoints(client):
    response = client.get("/api/v1/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert schema["info"]["title"] == "CareerPilot AI"
    paths = schema["paths"]
    for expected in ("/api/v1/auth/login", "/api/v1/jobs/import", "/api/v1/documents/generate",
                     "/api/v1/onboarding/complete", "/api/v1/privacy/export"):
        assert expected in paths, expected


def test_register_returns_user_and_sets_hardened_cookies(api):
    user = api.register(display_name="Ada")
    assert user["email"] == api.email
    assert user["display_name"] == "Ada"
    assert user["onboarding_completed"] is False

    cookies = {cookie.name: cookie for cookie in api.client.cookies.jar}
    # TestClient exposes cookies via the cookie jar; httpOnly is asserted on the raw header.
    response = api.client.post("/api/v1/auth/login", json={"email": api.email, "password": PASSWORD})
    set_cookie = " ".join(response.headers.get_list("set-cookie"))
    assert "cp_session=" in set_cookie
    assert "HttpOnly" in set_cookie or "httponly" in set_cookie.lower()
    assert "samesite=lax" in set_cookie.lower()
    assert cookies  # sanity: cookies exist in the jar


def test_me_reflects_the_authenticated_account(api):
    user = api.register()
    response = api.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == user["email"]


def test_unauthenticated_access_is_rejected(client):
    for path in ("/auth/me", "/profile", "/jobs", "/documents", "/applications", "/dashboard"):
        response = client.get(f"/api/v1{path}")
        assert response.status_code == 401, (path, response.status_code)


def test_mutations_require_csrf_token(api):
    api.register()
    response = api.client.post("/api/v1/jobs", json={
        "title": "Backend Engineer", "company": "Acme",
        "description": "Build APIs with Python and FastAPI on PostgreSQL.",
    })
    assert response.status_code in (400, 401, 403), response.text
    assert response.json()["error"]["code"] == "csrf_failed"


def test_duplicate_registration_is_rejected(api):
    api.register()
    response = api.client.post("/api/v1/auth/register", json={
        "email": api.email, "password": PASSWORD, "accept_terms": True,
    })
    assert response.status_code in (400, 409), response.text


def test_login_with_wrong_password_fails_generically(api):
    api.register()
    api.logout()
    response = api.client.post("/api/v1/auth/login",
                               json={"email": api.email, "password": "WrongPassword123"})
    assert response.status_code in (400, 401)
    body = response.text.lower()
    assert "password" in body or "credentials" in body
    assert "does not exist" not in body  # must not reveal account existence


def test_logout_invalidates_the_session(api):
    api.register()
    api.logout()
    assert api.get("/auth/me").status_code == 401


def test_password_change_revokes_other_sessions(api):
    api.register()
    first_client = api.client
    response = first_client.post("/api/v1/auth/login",
                                 json={"email": api.email, "password": PASSWORD})
    assert response.status_code == 200
    # A second, independent session.
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app, base_url="http://testserver") as other:
        login = other.post("/api/v1/auth/login", json={"email": api.email, "password": PASSWORD})
        assert login.status_code == 200
        token = other.cookies.get("cp_csrf")
        change = other.post(
            "/api/v1/auth/change-password",
            json={"current_password": PASSWORD, "new_password": "BrandNewPassword456"},
            headers={"X-CSRF-Token": token or ""},
        )
        assert change.status_code == 200, change.text
        assert "signed out" in change.json()["message"].lower()
        # The other session is still valid; the original one was revoked.
    assert api.get("/auth/me").status_code == 401
    api.login(api.email, "BrandNewPassword456")


def test_sessions_are_listed_and_revocable(api):
    api.register()
    listing = api.get("/auth/sessions")
    assert listing.status_code == 200
    sessions = listing.json()
    assert len(sessions) == 1
    assert sessions[0]["current"] is True

    other = api.post("/auth/sessions/revoke-others")
    assert other.status_code == 200


def test_cross_user_data_is_not_accessible(client):
    """Two accounts must never see each other's jobs, documents or applications."""
    from tests.conftest import ApiClient, create_job

    first = ApiClient(client)
    first.register()
    job = create_job(first)["job"]

    second_client = type(client)(client.app, base_url="http://testserver")
    with second_client as other:
        second = ApiClient(other)
        second.register()
        for path in (f"/jobs/{job['id']}", f"/jobs/{job['id']}/match"):
            response = second.get(path)
            assert response.status_code == 404, path
        # The second user's listing must not contain the first user's job.
        listing = second.get("/jobs")
        assert listing.status_code == 200
        assert all(item["id"] != job["id"] for item in listing.json()["items"])
    first.logout()


def test_password_reset_flow(api):
    api.register()
    email = api.email
    api.logout()
    response = api.client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert response.status_code == 200
    # Unknown addresses get an identical response (no account enumeration).
    unknown = api.client.post("/api/v1/auth/forgot-password",
                              json={"email": "nobody@example.com"})
    assert unknown.status_code == 200
    assert unknown.json()["message"] == response.json()["message"]


def test_account_update_and_validation(api):
    api.register()
    response = api.patch("/auth/account", json={"display_name": "Renamed Candidate"})
    assert response.status_code == 200
    assert response.json()["display_name"] == "Renamed Candidate"


def test_weak_password_rejected_on_change(api):
    api.register()
    response = api.post("/auth/change-password",
                        json={"current_password": PASSWORD, "new_password": "short"})
    assert response.status_code == 422
