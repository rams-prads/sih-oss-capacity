"""Department-level rollup of course progress and topic mastery."""
import pytest


@pytest.fixture
def admin_headers(client):
    token = client.post(
        "/api/auth/login", json={"user_id": "u-admin-meera", "password": "admin123"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_requires_an_administrator(client):
    assert client.get("/api/admin/learning").status_code == 401
    assert (
        client.get("/api/admin/learning", headers={"X-User-Id": "u-admin-meera"}).status_code
        == 401
    )


def test_enrolment_counts_add_up(client, admin_headers):
    body = client.get("/api/admin/learning", headers=admin_headers).json()
    assert (
        body["in_progress"] + body["completed"] + body["expired"] + body["not_started"]
        == body["enrolments"]
    )
    assert body["officer_count"] == 9
    assert 0 <= body["completion_rate_pct"] <= 100


def test_topic_rollup_classifies_each_officer_once(client, admin_headers):
    body = client.get("/api/admin/learning", headers=admin_headers).json()
    assert body["topic_rollup"]
    for row in body["topic_rollup"]:
        assert row["weak"] + row["developing"] + row["strong"] == row["officers_assessed"]
        assert 0 <= row["avg_accuracy_pct"] <= 100
        assert row["questions_answered"] >= row["officers_assessed"]


def test_weakest_topics_come_first_and_surface_real_weakness(client, admin_headers):
    body = client.get("/api/admin/learning", headers=admin_headers).json()
    weakest = body["weakest_topics"]
    assert len(weakest) <= 5
    accuracies = [t["avg_accuracy_pct"] for t in weakest]
    assert accuracies == sorted(accuracies)
    # At least one officer is genuinely weak somewhere, or the bucket is untested.
    assert any(t["weak"] > 0 for t in body["topic_rollup"])


def test_course_rollup_ranks_the_worst_completion_first(client, admin_headers):
    body = client.get("/api/admin/learning", headers=admin_headers).json()
    rates = [c["completion_rate_pct"] for c in body["course_rollup"]]
    assert rates == sorted(rates)
    for row in body["course_rollup"]:
        assert (
            row["in_progress"] + row["completed"] + row["expired"] + row["not_started"]
            == row["enrolled"]
        )


def test_expired_watchlist_lists_unfinished_enrolments(client, admin_headers):
    body = client.get("/api/admin/learning", headers=admin_headers).json()
    assert body["expired_incomplete"]
    for row in body["expired_incomplete"]:
        assert row["status"] == "expired"
        assert row["progress_pct"] < 100


def test_expiring_soon_respects_the_window(client, admin_headers):
    body = client.get(
        "/api/admin/learning", headers=admin_headers, params={"expiring_within_days": 30}
    ).json()
    assert body["expiring_soon"]
    for row in body["expiring_soon"]:
        assert 0 <= row["days_remaining"] <= 30
        assert row["status"] != "completed"

    narrow = client.get(
        "/api/admin/learning", headers=admin_headers, params={"expiring_within_days": 0}
    ).json()
    assert len(narrow["expiring_soon"]) <= len(body["expiring_soon"])


def test_scoping_to_a_department(client, admin_headers):
    body = client.get(
        "/api/admin/learning",
        headers=admin_headers,
        params={"department": "MoSPI - Field Operations Division"},
    ).json()
    assert body["officer_count"] == 2
    assert body["department"] == "MoSPI - Field Operations Division"


def test_unknown_department_is_404(client, admin_headers):
    response = client.get(
        "/api/admin/learning", headers=admin_headers, params={"department": "Nowhere"}
    )
    assert response.status_code == 404
