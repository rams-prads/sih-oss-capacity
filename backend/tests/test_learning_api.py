"""The learning dashboard and the video-to-checkpoint loop over the API."""
from sqlalchemy import select

from app.db import SessionLocal
from app.models import BankQuestion, Checkpoint

# Resolved from the response rather than named: the catalogue comes from iGOT.


def _answer_key(checkpoint_id: int) -> list[int]:
    with SessionLocal() as db:
        checkpoint = db.get(Checkpoint, checkpoint_id)
        rows = db.scalars(
            select(BankQuestion)
            .where(BankQuestion.topic_id == checkpoint.topic_id)
            .order_by(BankQuestion.id)
        ).all()
        return [q.answer_index for q in rows]


def _course(body, identifier=None):
    """A course from the dashboard: by id, else the one in progress."""
    if identifier:
        return next(c for c in body["courses"] if c["course_identifier"] == identifier)
    return next(c for c in body["courses"] if c["status"] == "in_progress")


def _assessed_module(course):
    """The module carrying this course's assessment.

    Authored courses had a quiz per module; an ingested iGOT course has modules of
    video and one assessment at the end, so the position cannot be assumed.
    """
    return next(m for m in course["modules"] if m["checkpoint_id"] is not None)


def _watch_all(client, user, course):
    """Watch every unwatched video, returning the progress after each."""
    seen = []
    for module in course["modules"]:
        for lesson in module["lessons"]:
            if lesson["completed"]:
                continue
            seen.append(
                client.post(f"/api/users/{user}/lessons/{lesson['id']}/complete").json()
            )
    return seen


def _assessable(body):
    """A course carrying an assessment, so the checkpoint loop can be exercised."""
    return next(
        c
        for c in body["courses"]
        if any(m["checkpoint_id"] is not None for m in c["modules"])
    )


def test_dashboard_reports_every_status(client):
    body = client.get("/api/users/u-jso-anita/learning").json()
    summary = body["summary"]
    assert summary["enrolled"] == 4
    assert summary["in_progress"] == 1
    assert summary["completed"] == 1
    assert summary["expired"] == 1
    assert summary["not_started"] == 1
    assert {c["status"] for c in body["courses"]} == {
        "in_progress",
        "completed",
        "expired",
        "not_started",
    }


def test_courses_needing_attention_come_first(client):
    body = client.get("/api/users/u-jso-anita/learning").json()
    assert body["courses"][0]["status"] == "in_progress"
    assert body["courses"][-1]["status"] == "completed"


def test_expired_course_carries_no_next_action(client):
    body = client.get("/api/users/u-jso-anita/learning").json()
    expired = next(c for c in body["courses"] if c["status"] == "expired")
    assert expired["next_action"] is None
    assert expired["progress_pct"] > 0     # partial progress is still shown


def test_completed_course_is_fully_done(client):
    body = client.get("/api/users/u-jso-anita/learning").json()
    done = next(c for c in body["courses"] if c["status"] == "completed")
    assert done["progress_pct"] == 100
    assert done["lessons_completed"] == done["lessons_total"]
    assert done["checkpoints_passed"] == done["checkpoints_total"]
    assert done["completed_at"] is not None


def test_checkpoint_is_locked_until_its_videos_are_watched(client):
    body = client.get("/api/users/u-jso-anita/learning").json()
    course = _assessable(body)
    module = _assessed_module(course)
    assert module["checkpoint_unlocked"] is False

    response = client.get(
        f"/api/checkpoints/{module['checkpoint_id']}", params={"user_id": "u-jso-anita"}
    )
    assert response.status_code == 409
    assert "videos in this module first" in response.json()["detail"]


def test_watching_videos_moves_progress_and_unlocks_the_checkpoint(client):
    user = "u-jso-anita"
    before = _assessable(client.get(f"/api/users/{user}/learning").json())
    module = _assessed_module(before)

    last_pct = before["progress_pct"]
    for body in _watch_all(client, user, before):
        assert body["progress_pct"] > last_pct      # the bar always moves forward
        last_pct = body["progress_pct"]

    after = _course(
        client.get(f"/api/users/{user}/learning").json(),
        before["course_identifier"],
    )
    assert _assessed_module(after)["checkpoint_unlocked"] is True
    assert after["next_action"]["kind"] == "checkpoint"

    quiz = client.get(
        f"/api/checkpoints/{module['checkpoint_id']}", params={"user_id": user}
    ).json()
    assert len(quiz["questions"]) == 4
    assert all("answer_index" not in q for q in quiz["questions"])   # key not leaked


def test_failing_then_passing_a_checkpoint(client):
    """A failed attempt is recorded but does not advance the course."""
    user = "u-jso-anita"
    course = _assessable(client.get(f"/api/users/{user}/learning").json())
    checkpoint_id = _assessed_module(course)["checkpoint_id"]
    _watch_all(client, user, course)   # the assessment only opens once watched
    key = _answer_key(checkpoint_id)

    wrong = [key[0]] + [(k + 1) % 4 for k in key[1:]]
    before_pct = _course(
        client.get(f"/api/users/{user}/learning").json(), course["course_identifier"]
    )["progress_pct"]
    failed = client.post(
        f"/api/checkpoints/{checkpoint_id}/submit",
        params={"user_id": user},
        json={"answers": wrong},
    ).json()
    assert failed["passed"] is False
    assert failed["score_pct"] == 25.0
    assert failed["course_progress_pct"] == before_pct
    assert len(failed["items"]) == 4
    assert any(not i["correct"] and i["explanation"] for i in failed["items"])

    passed = client.post(
        f"/api/checkpoints/{checkpoint_id}/submit",
        params={"user_id": user},
        json={"answers": key},
    ).json()
    assert passed["passed"] is True
    assert passed["score_pct"] == 100.0
    assert passed["attempt_no"] == 2
    assert passed["course_progress_pct"] > before_pct
    # Mastery counts both sittings: 1 + 4 correct of 8 answered.
    assert passed["topic_accuracy_pct"] == 62.5


def test_lesson_completion_requires_enrolment(client):
    response = client.post("/api/users/u-da-neha/lessons/1/complete")
    assert response.status_code == 409


def test_answer_count_must_match(client):
    body = client.get("/api/users/u-si-lalita/learning").json()
    course = _assessable(body)
    checkpoint_id = next(
        m["checkpoint_id"] for m in course["modules"] if m["checkpoint_id"] is not None
    )
    response = client.post(
        f"/api/checkpoints/{checkpoint_id}/submit",
        params={"user_id": "u-si-lalita"},
        json={"answers": [0, 1]},
    )
    assert response.status_code == 400


def test_topic_mastery_endpoint(client):
    rows = client.get("/api/users/u-da-neha/topic-mastery").json()
    assert rows
    assert all(0 <= r["accuracy_pct"] <= 100 for r in rows)
    assert all(r["verdict"] in {"strong", "developing", "weak"} for r in rows)
