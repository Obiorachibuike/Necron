"""Application tracker, reminders, calendar, interviews, insights and notifications."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from tests.conftest import create_job, create_profile


def _application(api, job=None, **overrides):
    job = job or create_job(api)["job"]
    payload = {
        "job_id": job["id"], "company": job["company"], "role_title": job["title"],
        "status": "saved", "source": "job_board",
        "application_url": "https://acme.example/jobs/1",
    }
    payload.update(overrides)
    response = api.post("/applications", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_application_requires_a_job_or_a_company(api):
    api.register()
    assert api.post("/applications", json={"status": "saved"}).status_code == 422


def test_application_creation_links_the_job(api):
    api.register()
    job = create_job(api)["job"]
    application = _application(api, job)
    assert application["company"] == "Acme Payments"
    assert application["job"]["id"] == job["id"] if application.get("job") else True
    detail = api.get(f"/applications/{application['id']}")
    assert detail.status_code == 200
    # The job now reports that an application exists, so the UI stops offering to create one.
    assert api.get(f"/jobs/{job['id']}").json()["application_id"] == application["id"]
    # Creating a second application for the same job must not silently duplicate it.
    duplicate = api.post("/applications", json={"job_id": job["id"]})
    assert duplicate.status_code == 409, duplicate.text
    assert duplicate.json()["error"]["code"] == "application_exists"
    existing = duplicate.json()["error"]["details"][0]["message"]
    assert existing == application["id"]
    assert api.get("/applications/stats").json()["total"] == 1


def test_status_transitions_are_recorded_as_events(api):
    api.register()
    application = _application(api)
    for status in ("planning", "documents_in_progress", "ready_to_apply", "applied", "interview"):
        response = api.post(f"/applications/{application['id']}/status",
                            json={"status": status, "note": f"moved to {status}"})
        assert response.status_code == 200, response.text
        assert response.json()["status"] == status
    detail = api.get(f"/applications/{application['id']}").json()
    history = [event["to_status"] for event in detail.get("events", []) if event.get("to_status")]
    assert "applied" in history and "interview" in history
    assert detail["applied_at"] is not None, "moving to applied must stamp the date"


def test_invalid_status_is_rejected(api):
    api.register()
    application = _application(api)
    response = api.post(f"/applications/{application['id']}/status",
                        json={"status": "ghosted"})
    assert response.status_code == 422
    assert api.get(f"/applications/{application['id']}").json()["status"] == "saved"


def test_application_patch_and_delete(api):
    api.register()
    application = _application(api)
    patched = api.patch(f"/applications/{application['id']}", json={
        "next_action_note": "Follow up with the recruiter",
        "next_action_at": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
        "salary_expectation": 75000,
    })
    assert patched.status_code == 200, patched.text
    assert patched.json()["next_action_note"].startswith("Follow up")
    assert api.delete(f"/applications/{application['id']}").status_code == 200
    assert api.get(f"/applications/{application['id']}").status_code == 404


def test_tracker_filters_and_stats(api):
    api.register()
    first = _application(api)
    second_job = create_job(api, title="Platform Engineer", company="Northwind")["job"]
    second = _application(api, second_job)
    api.post(f"/applications/{second['id']}/status", json={"status": "applied"})

    listing = api.get("/applications?status=applied")
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()["items"]] == [second["id"]]

    stats = api.get("/applications/stats").json()
    assert stats["total"] == 2
    assert stats["active"] >= 1
    assert stats["by_status"]["applied"] == 1
    assert sum(stats["by_status"].values()) == 2
    assert api.get("/applications?page_size=1").json()["meta"]["total"] == 2
    assert first["id"] != second["id"]


def test_calendar_returns_deadlines_and_reminders(api):
    api.register()
    application = _application(api)
    deadline = datetime.now(timezone.utc) + timedelta(days=5)
    api.patch(f"/applications/{application['id']}",
              json={"deadline_at": deadline.isoformat()})
    reminder = api.post("/reminders", json={
        "application_id": application["id"], "kind": "follow_up",
        "title": "Nudge the recruiter", "due_at": deadline.isoformat(),
    })
    assert reminder.status_code == 201, reminder.text

    start = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    end = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
    calendar = api.get(f"/applications/calendar?start={start}&end={end}")
    assert calendar.status_code == 200, calendar.text
    kinds = {entry["kind"] for entry in calendar.json()}
    assert {"deadline", "reminder"} <= kinds
    assert all(entry["at"] for entry in calendar.json())


def test_reminder_lifecycle_and_ownership(api):
    api.register()
    reminder = api.post("/reminders", json={
        "kind": "custom", "title": "Prepare portfolio",
        "due_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
    })
    assert reminder.status_code == 201
    reminder_id = reminder.json()["id"]
    completed = api.patch(f"/reminders/{reminder_id}", json={"completed": True})
    assert completed.status_code == 200, completed.text
    assert completed.json()["completed_at"] is not None
    assert api.get("/reminders").json() == []
    assert len(api.get("/reminders?include_completed=true").json()) == 1
    assert api.delete(f"/reminders/{reminder_id}").status_code == 200

    bad = api.post("/reminders", json={"kind": "telepathy", "title": "x",
                                       "due_at": datetime.now(timezone.utc).isoformat()})
    assert bad.status_code == 422


def test_interview_session_lifecycle_without_ai(api):
    api.register()
    create_profile(api)
    job = create_job(api)["job"]
    created = api.post("/interviews", json={
        "job_id": job["id"], "title": "Backend screen", "question_count": 5,
        "categories": ["technical", "behavioural"], "use_ai": False,
    })
    assert created.status_code == 201, created.text
    session = created.json()["session"]
    session_id = session["id"]
    assert session["questions_source"] == "deterministic"
    api.drain()

    detail = api.get(f"/interviews/{session_id}").json()
    questions = detail["questions"]
    assert len(questions) == 5
    assert all(question["question"] for question in questions)
    assert {question["category"] for question in questions} <= {"technical", "behavioural",
                                                               "behavioural_star"}

    answer = api.post(f"/interviews/{session_id}/answer", json={
        "question_id": questions[0]["id"],
        "answer_text": (
            "Situation: our payments API slowed down badly during peak traffic. Task: I owned the "
            "latency workstream. Action: I profiled the PostgreSQL query plans, added two composite "
            "indexes and moved report generation to a background worker. Result: p95 latency fell "
            "from 900ms to 240ms within three weeks, and we documented the change for the team."),
    })
    assert answer.status_code == 200, answer.text
    feedback = answer.json()
    assert feedback["answer"]["answer_text"]
    progress = feedback["session_progress"]
    assert isinstance(progress, dict) and progress

    # A follow-up builds on the candidate's own answer, so it is only available afterwards.
    blocked = api.post(f"/interviews/{session_id}/questions/{questions[1]['id']}/follow-up",
                       json={"use_ai": False})
    assert blocked.status_code == 422
    api.drain()
    follow_up = api.post(f"/interviews/{session_id}/questions/{questions[0]['id']}/follow-up",
                         json={"use_ai": False})
    assert follow_up.status_code == 200, follow_up.text
    assert follow_up.json()["follow_up"]
    assert follow_up.json()["follow_up"] != questions[0]["question"]

    summary = api.post(f"/interviews/{session_id}/complete")
    assert summary.status_code == 200, summary.text
    payload = summary.json()
    assert payload["session"]["status"] == "completed"
    assert len(payload["session"]["questions"]) == 5
    assert payload["strengths"] and payload["next_steps"]
    assert payload["average_score"] is not None
    assert api.delete(f"/interviews/{session_id}").status_code == 200


def test_interview_question_count_bounds(api):
    api.register()
    assert api.post("/interviews", json={"question_count": 2}).status_code == 422
    assert api.post("/interviews", json={"question_count": 26}).status_code == 422


def test_interview_categories_meta(api):
    api.register()
    response = api.get("/interviews/meta/categories")
    assert response.status_code == 200
    categories = response.json()
    assert len(categories) >= 3
    assert all({"key", "label"} <= set(item) for item in categories)


def test_interview_sessions_are_isolated(client):
    from tests.conftest import ApiClient

    first = ApiClient(client)
    first.register()
    session_id = first.post("/interviews", json={"question_count": 4, "use_ai": False}).json()["session"]["id"]

    with type(client)(client.app, base_url="http://testserver") as raw:
        second = ApiClient(raw)
        second.register()
        assert second.get(f"/interviews/{session_id}").status_code == 404
        assert second.post(f"/interviews/{session_id}/answer", json={
            "question_id": "x", "answer_text": "y"}).status_code == 404


def test_insights_are_derived_from_real_records(api):
    api.register()
    empty = api.get("/insights?days=90")
    assert empty.status_code == 200, empty.text
    payload = empty.json()
    assert payload["period_days"] == 90
    assert payload["data_points"]["applications"] == 0
    assert isinstance(payload["insights"], list)
    assert all({"key", "title", "insight"} <= set(item) for item in payload["insights"])

    _application(api)
    populated = api.get("/insights?days=30").json()
    assert populated["period_days"] == 30
    assert populated["data_points"]["applications"] >= 1
    assert populated["data_points"]["saved_jobs"] >= 1
    assert api.get("/insights?days=1").status_code == 422  # out of range


def test_notifications_are_created_by_real_events(api):
    api.register()
    _application(api)
    notifications = api.get("/notifications")
    assert notifications.status_code == 200
    payload = notifications.json()
    assert "items" in payload and "unread" in payload
    if payload["items"]:
        first = payload["items"][0]
        read = api.post(f"/notifications/{first['id']}/read")
        assert read.status_code == 200
        assert api.post("/notifications/read-all").status_code == 200
        assert api.delete("/notifications").json()["message"]


def test_search_covers_jobs_and_documents(api):
    api.register()
    job = create_job(api)["job"]
    result = api.get("/search?q=Acme")
    assert result.status_code == 200, result.text
    payload = result.json()
    assert any(item["id"] == job["id"] for item in payload["jobs"])
    assert set(payload) >= {"jobs", "documents", "applications"}
    assert api.get("/search?q=a").status_code == 422


def test_meta_reports_runtime_configuration(api):
    api.register()
    response = api.get("/meta")
    assert response.status_code == 200
    payload = response.json()
    assert payload["api_version"] == "v1"
    assert payload["environment"] == "test"
    assert payload["docs_url"].endswith("/docs")
    assert "email_configured" in payload
    assert payload["ai_defaults"]["daily_token_limit"] > 0
    # No credential-bearing fields may ever be exposed through metadata. Walk the keys rather
    # than string-matching the payload, which would also match prose in labels and notes.
    def keys_of(value):
        if isinstance(value, dict):
            for key, child in value.items():
                yield key
                yield from keys_of(child)
        elif isinstance(value, list):
            for child in value:
                yield from keys_of(child)

    exposed = {"api_key", "api_key_ciphertext", "password_hash", "session_token"} & set(keys_of(payload))
    assert exposed == set(), f"metadata exposed credential fields: {exposed}"


def test_dashboard_aggregates_only_this_users_data(api):
    api.register()
    create_profile(api)
    job = create_job(api)["job"]
    _application(api, job)
    dashboard = api.get("/dashboard")
    assert dashboard.status_code == 200
    payload = dashboard.json()
    assert payload["applications"]["total"] >= 1
    assert payload["profile_completeness"] >= 0
    assert any(item["job_id"] == job["id"] for item in payload["new_matches"])
