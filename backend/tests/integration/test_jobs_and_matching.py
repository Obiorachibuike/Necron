"""Job intake, discovery search, deterministic matching and strategy approval."""
from __future__ import annotations

import pytest

from tests.conftest import create_experience, create_job, create_profile, create_skill, create_strategy


def test_scoring_never_reports_zero_when_nothing_is_measurable(api):
    """An unmeasurable job must read as insufficient data, not as a 0/100 failure."""
    api.register()
    job = api.post("/jobs", json={
        "title": "Role with no detail", "company": "Quiet Co", "description": "Python APIs",
    }).json()
    detail = api.get(f"/jobs/{job['id']}").json()
    match = detail["match"]
    assert match["category"] == "insufficient_data"
    assert match["overall_score"] == 50.0
    assert all(item["score"] is None for item in match["breakdown"])
    assert "coverage 0%" in match["explanation"]


def test_manual_import_creates_and_scores_a_job(api):
    api.register()
    create_profile(api)
    create_experience(api)
    create_skill(api, "Python")
    create_skill(api, "FastAPI", category="Frameworks")
    create_skill(api, "PostgreSQL", category="Databases")

    imported = create_job(api)
    job = imported["job"]
    assert job["title"] == "Senior Backend Engineer"
    assert job["company"] == "Acme Payments"
    assert job.get("match_score") is not None, "importing with analyze=true must score the job"

    detail = api.get(f"/jobs/{job['id']}")
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["match"] is not None
    match = payload["match"]
    assert 0 <= match["overall_score"] <= 100
    assert match["method"] == "deterministic_v1"
    assert match["breakdown"], "every match must expose its per-category rationale"
    assert match["explanation"]
    # The frontend renders these two lists; they must be part of the contract.
    assert "Python" in match["matched_skills"]
    assert isinstance(match["missing_skills"], list)
    for item in match["breakdown"]:
        assert {"category", "label", "weight", "score", "status", "rationale"} <= set(item)


def test_manual_import_requires_a_description(api):
    api.register()
    response = api.post("/jobs/import", json={"mode": "manual", "title": "Engineer",
                                              "description": "too short"})
    assert response.status_code in (400, 422), response.text


def test_job_url_import_rejects_private_addresses(api):
    api.register()
    for url in ("http://127.0.0.1/jobs", "http://169.254.169.254/latest/meta-data/",
                "file:///etc/passwd", "http://localhost:8000/jobs"):
        response = api.post("/jobs/import", json={"mode": "url", "url": url})
        # The importer records the failure instead of fetching; it must never succeed.
        assert response.status_code != 201, url
        body = response.json()
        assert body.get("job") is None, url


def test_job_crud_and_saved_flag(api):
    api.register()
    job = create_job(api)["job"]
    patched = api.patch(f"/jobs/{job['id']}", json={"is_saved": False})
    assert patched.status_code == 200
    assert patched.json()["is_saved"] is False
    assert api.delete(f"/jobs/{job['id']}").status_code == 200
    assert api.get(f"/jobs/{job['id']}").status_code == 404


def test_job_listing_filters_and_pagination(api):
    api.register()
    for index in range(3):
        create_job(api, title=f"Backend Engineer {index}", company=f"Company {index}")
    listing = api.get("/jobs?page=1&page_size=2")
    assert listing.status_code == 200
    payload = listing.json()
    assert len(payload["items"]) == 2
    assert payload["meta"]["total"] == 3
    assert payload["meta"]["total_pages"] == 2

    searched = api.get("/jobs?q=Company 1")
    assert searched.status_code == 200
    assert all("Company 1" in item["company"] for item in searched.json()["items"])


def test_job_stats_reflect_real_data(api):
    api.register()
    create_job(api)
    stats = api.get("/jobs/stats")
    assert stats.status_code == 200
    payload = stats.json()
    assert payload["total"] == 1
    assert payload["scored"] == 1


def test_providers_are_documented_honestly(api):
    api.register()
    providers = api.get("/jobs/providers")
    assert providers.status_code == 200
    keys = {item["provider"] for item in providers.json()}
    assert {"greenhouse", "lever"} <= keys
    for item in providers.json():
        assert item["notes"], "each source must document its constraints"


def test_source_creation_validates_provider_and_token(api):
    api.register()
    created = api.post("/jobs/sources", json={
        "provider": "greenhouse", "board_token": "acme", "company_name": "Acme",
    })
    assert created.status_code == 201, created.text
    source = created.json()
    assert source["enabled"] is True

    invalid = api.post("/jobs/sources", json={"provider": "linkedin", "board_token": "acme"})
    assert invalid.status_code == 422

    traversal = api.post("/jobs/sources", json={"provider": "lever",
                                                "board_token": "../../etc/passwd"})
    assert traversal.status_code == 422

    assert api.delete(f"/jobs/sources/{source['id']}").status_code == 200


def test_discovery_requires_a_configured_board(api):
    api.register()
    response = api.post("/jobs/discover", json={"keywords": "python"})
    assert response.status_code in (400, 422), response.text
    assert "board" in response.json()["error"]["message"].lower()


def test_discovery_is_queued_not_faked(api):
    api.register()
    api.post("/jobs/sources", json={"provider": "greenhouse", "board_token": "acme"})
    response = api.post("/jobs/discover", json={"keywords": "python", "max_results": 10})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["task_id"]
    assert payload["status"] in {"queued", "running"}
    # The response must not claim jobs were found before the worker ran.
    task = api.get(f"/tasks/{payload['task_id']}")
    assert task.status_code == 200
    assert task.json()["status"] in {"queued", "running"}


def test_saved_search_crud_and_validation(api):
    api.register()
    created = api.post("/jobs/searches", json={
        "name": "Remote backend", "keywords": "python, fastapi",
        "work_arrangements": ["remote"], "min_match_score": 60,
    })
    assert created.status_code == 201, created.text
    search = created.json()
    assert search["name"] == "Remote backend"
    assert search["worker_available"] in (True, False)

    bad = api.post("/jobs/searches", json={"name": "x", "work_arrangements": ["spaceship"]})
    assert bad.status_code == 422

    assert api.patch(f"/jobs/searches/{search['id']}",
                     json={**{k: v for k, v in search.items()
                              if k in {"name", "keywords", "title", "countries", "cities",
                                       "work_arrangements", "employment_types", "experience_levels",
                                       "technologies", "industries", "salary_min",
                                       "posted_within_days", "min_match_score",
                                       "source_providers", "is_favorite", "schedule_enabled",
                                       "schedule_frequency", "schedule_hour_utc",
                                       "schedule_max_results", "notify"}},
                           "name": "Renamed"}).status_code == 200
    assert api.delete(f"/jobs/searches/{search['id']}").status_code == 200


def test_match_refresh_is_idempotent(api):
    api.register()
    create_skill(api, "Python")
    job = create_job(api)["job"]
    first = api.post(f"/jobs/{job['id']}/match")
    assert first.status_code == 200, first.text
    second = api.post(f"/jobs/{job['id']}/match")
    assert second.status_code == 200
    score_a = api.get(f"/jobs/{job['id']}/match").json()["overall_score"]
    score_b = api.get(f"/jobs/{job['id']}/match").json()["overall_score"]
    assert score_a == score_b


def test_strategy_requires_approval_before_generation(api):
    api.register()
    create_skill(api, "Python")
    job = create_job(api)["job"]
    strategy = create_strategy(api, job["id"], approve=False)
    assert strategy["approved"] is False

    blocked = api.post("/documents/generate", json={
        "job_id": job["id"], "doc_type": "cv", "template": "ats", "use_ai": False,
    })
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["error"]["code"] == "strategy_unapproved"


def test_strategy_cannot_be_created_for_another_users_job(client):
    from tests.conftest import ApiClient

    first = ApiClient(client)
    first.register()
    job = create_job(first)["job"]

    with type(client)(client.app, base_url="http://testserver") as raw:
        second = ApiClient(raw)
        second.register()
        response = second.post(f"/jobs/{job['id']}/strategy")
        assert response.status_code == 404


def test_embedded_listing_cannot_target_internal_hosts(api):
    """The listing model validates URLs too, not just the importer."""
    api.register()
    response = api.post("/jobs", json={
        "title": "Engineer", "company": "Acme", "description": "Python APIs",
        "source_url": "http://169.254.169.254/latest/meta-data/",
    })
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("description", [
    "We need 10+ years of experience with Python and Kubernetes for this lead role.",
    "Entry level position. Recent graduates welcome. Python training provided.",
])
def test_seniority_extraction_does_not_crash(api, description):
    api.register()
    create_skill(api, "Python")
    imported = create_job(api, description=description)
    assert imported["job"]["id"]
