"""The learning dashboard and the video-to-checkpoint loop over the API."""
from sqlalchemy import func, select

from app.db import SessionLocal
from app.engines.checkpoint_rotation import CHECKPOINT_QUIZ_SIZE
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


def _deep_checkpoint(db) -> Checkpoint:
    """A checkpoint whose topic holds more bank questions than one quiz needs -
    the only kind where a retry has anything different to draw from. The
    video-generated assessments are the ones deep enough; the hand-authored
    bank is exactly one quiz per topic by design."""
    counts = dict(
        db.execute(
            select(BankQuestion.topic_id, func.count(BankQuestion.id)).group_by(
                BankQuestion.topic_id
            )
        ).all()
    )
    for checkpoint in db.scalars(select(Checkpoint)).all():
        if counts.get(checkpoint.topic_id, 0) > CHECKPOINT_QUIZ_SIZE:
            return checkpoint
    raise AssertionError("no seeded checkpoint has a bank deeper than one quiz")


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
    detail = response.json()["detail"]
    # A refusal that says "watch all 0 videos" tells the officer to do nothing
    # and try again, so the count it names has to be the one being gated on.
    assert "videos in" in detail and "first" in detail
    assert "all 0 videos" not in detail


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
    # The review is withheld on a failure: handing back the correct option for
    # each question is what let a deliberate failure buy the answer key.
    assert failed["items"] == []

    passed = client.post(
        f"/api/checkpoints/{checkpoint_id}/submit",
        params={"user_id": user},
        json={"answers": key},
    ).json()
    assert passed["passed"] is True
    assert passed["score_pct"] == 100.0
    assert passed["attempt_no"] == 2
    assert passed["course_progress_pct"] > before_pct
    # Passing releases the full review, explanations and all.
    assert len(passed["items"]) == 4
    assert all(i["explanation"] for i in passed["items"])
    # Mastery counts both sittings: 1 + 4 correct of 8 answered. The failed
    # attempt's answers were withheld from the officer, never from the record.
    assert passed["topic_accuracy_pct"] == 62.5


def test_lesson_completion_requires_enrolment(client):
    response = client.post("/api/users/u-da-neha/lessons/1/complete")
    assert response.status_code == 409


def test_answer_count_must_match(client):
    user = "u-si-lalita"
    body = client.get(f"/api/users/{user}/learning").json()
    course = _assessable(body)
    checkpoint_id = next(
        m["checkpoint_id"] for m in course["modules"] if m["checkpoint_id"] is not None
    )
    _watch_all(client, user, course)   # the gate is checked before the payload
    response = client.post(
        f"/api/checkpoints/{checkpoint_id}/submit",
        params={"user_id": user},
        json={"answers": [0, 1]},
    )
    assert response.status_code == 400


def test_a_retry_on_a_deep_bank_asks_different_questions(client, db):
    """The fix this feature exists for: fail a checkpoint whose topic can
    actually support rotation, and the retry must not be the same four."""
    user = "u-jso-anita"
    checkpoint = _deep_checkpoint(db)
    client.post(
        f"/api/users/{user}/enrolments",
        json={"course_identifier": checkpoint.course_identifier},
    )

    course = _course(client.get(f"/api/users/{user}/learning").json(), checkpoint.course_identifier)
    module = next(m for m in course["modules"] if m["checkpoint_id"] == checkpoint.id)
    for lesson in module["lessons"]:
        client.post(f"/api/users/{user}/lessons/{lesson['id']}/complete")

    first = client.get(
        f"/api/checkpoints/{checkpoint.id}", params={"user_id": user}
    ).json()
    # Capped at one quiz's worth even though the bank holds more - a checkpoint
    # this deep used to serve every question it had, every time.
    assert len(first["questions"]) == CHECKPOINT_QUIZ_SIZE

    client.post(
        f"/api/checkpoints/{checkpoint.id}/submit",
        params={"user_id": user},
        json={"answers": [0] * len(first["questions"])},
    )

    second = client.get(
        f"/api/checkpoints/{checkpoint.id}", params={"user_id": user}
    ).json()
    assert second["attempt_no"] == 2
    assert len(second["questions"]) == CHECKPOINT_QUIZ_SIZE
    first_ids = {q["id"] for q in first["questions"]}
    second_ids = {q["id"] for q in second["questions"]}
    assert second_ids != first_ids, "retry served the identical question set"


def test_a_shallow_bank_still_serves_its_whole_set_every_attempt(client):
    """Where the bank is exactly one quiz's worth - most topics today - a
    retry cannot rotate, and must not appear to by reordering or dropping
    the one question it has of some type. This is the invariant that keeps
    test_failing_then_passing_a_checkpoint's answer key valid across two
    attempts, made explicit as its own test."""
    user = "u-jso-anita"
    course = _assessable(client.get(f"/api/users/{user}/learning").json())
    checkpoint_id = _assessed_module(course)["checkpoint_id"]
    _watch_all(client, user, course)

    first = client.get(
        f"/api/checkpoints/{checkpoint_id}", params={"user_id": user}
    ).json()
    client.post(
        f"/api/checkpoints/{checkpoint_id}/submit",
        params={"user_id": user},
        json={"answers": [0] * len(first["questions"])},
    )
    second = client.get(
        f"/api/checkpoints/{checkpoint_id}", params={"user_id": user}
    ).json()

    assert [q["id"] for q in second["questions"]] == [q["id"] for q in first["questions"]]


def test_submitting_a_locked_checkpoint_is_refused(client):
    """The gate has to hold on the submission, not only on opening the quiz.

    Only the GET checked it, so posting straight to /submit skipped the videos
    entirely and still scored, still moved the measured level, and still
    counted toward course progress."""
    user = "u-si-lalita"
    course = _assessable(client.get(f"/api/users/{user}/learning").json())
    module = _assessed_module(course)
    assert module["checkpoint_unlocked"] is False

    response = client.post(
        f"/api/checkpoints/{module['checkpoint_id']}/submit",
        params={"user_id": user},
        json={"answers": [0] * CHECKPOINT_QUIZ_SIZE},
    )
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert "videos in" in detail and "first" in detail
    assert "all 0 videos" not in detail

    # And nothing was recorded for the attempt that was refused.
    board = _course(
        client.get(f"/api/users/{user}/learning").json(), course["course_identifier"]
    )
    assert board["progress_pct"] == course["progress_pct"]


def test_an_answer_outside_the_options_is_refused(client):
    user = "u-jso-anita"
    course = _assessable(client.get(f"/api/users/{user}/learning").json())
    checkpoint_id = _assessed_module(course)["checkpoint_id"]
    _watch_all(client, user, course)

    for bad in ([-1, 0, 0, 0], [0, 0, 0, 99]):
        response = client.post(
            f"/api/checkpoints/{checkpoint_id}/submit",
            params={"user_id": user},
            json={"answers": bad},
        )
        assert response.status_code == 400, bad
        assert "no option" in response.json()["detail"]


def test_attempts_are_throttled(client, monkeypatch):
    """Guessing works about one attempt in twenty, so the defence is spacing
    the attempts rather than capping them.

    The suite runs with the cooldown at zero (conftest) so every other test can
    submit back to back; this one turns it on to exercise the real path."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "checkpoint_cooldown_seconds", 60)

    user = "u-jso-anita"
    course = _assessable(client.get(f"/api/users/{user}/learning").json())
    checkpoint_id = _assessed_module(course)["checkpoint_id"]
    _watch_all(client, user, course)

    answers = [0] * CHECKPOINT_QUIZ_SIZE
    first = client.post(
        f"/api/checkpoints/{checkpoint_id}/submit",
        params={"user_id": user},
        json={"answers": answers},
    )
    assert first.status_code == 200

    second = client.post(
        f"/api/checkpoints/{checkpoint_id}/submit",
        params={"user_id": user},
        json={"answers": answers},
    )
    assert second.status_code == 429
    assert "available in" in second.json()["detail"]

    # The refused attempt left no trace: still one sitting on the record.
    quiz = client.get(
        f"/api/checkpoints/{checkpoint_id}", params={"user_id": user}
    ).json()
    assert quiz["attempt_no"] == 2


def test_topic_mastery_endpoint(client):
    rows = client.get("/api/users/u-da-neha/topic-mastery").json()
    assert rows
    assert all(0 <= r["accuracy_pct"] <= 100 for r in rows)
    assert all(r["verdict"] in {"strong", "developing", "weak"} for r in rows)
