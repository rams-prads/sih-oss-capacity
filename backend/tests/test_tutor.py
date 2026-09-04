"""The course tutor: grounded in one course, and only in what the officer did."""
import pytest
from sqlalchemy import select

from app.engines.tutor import detect_intent
from app.models import Checkpoint, CheckpointAttempt, Lesson, LessonProgress
from tests.conftest import course_in_state, course_with_assessment, unwatched_lessons

USER = "u-jso-anita"


def _ask(client, course_id, message, user_id=USER):
    return client.post(
        f"/api/courses/{course_id}/tutor",
        params={"user_id": user_id},
        json={"message": message},
    )


@pytest.mark.parametrize(
    "message, expected",
    [
        ("How am I doing on this course?", "progress"),
        ("What should I watch next?", "rewatch"),
        ("which video should I rewatch", "rewatch"),
        ("Why did I get that wrong?", "mistakes"),
        ("Where am I weakest?", "weakness"),
        ("what am I struggling with", "weakness"),
        ("Is the final assessment unlocked?", "assessment"),
        ("What is stratified sampling?", "general"),
    ],
)
def test_intent_routing_matches_how_people_actually_ask(message, expected):
    assert detect_intent(message) == expected


def test_the_tutor_only_answers_about_an_enrolled_course(client):
    assert _ask(client, "do_not_enrolled_anywhere", "hello").status_code == 404


def test_progress_answer_quotes_the_real_record(client, db):
    course_id = course_in_state(db, "in_progress")
    board = client.get(f"/api/users/{USER}/learning").json()
    course = next(c for c in board["courses"] if c["course_identifier"] == course_id)

    body = _ask(client, course_id, "How am I doing?").json()
    assert body["source"] == "record"
    assert f"{course['progress_pct']}%" in body["answer"]
    assert str(course["lessons_completed"]) in body["answer"]


def test_it_names_the_next_videos_to_watch(client, db):
    course_id = course_in_state(db, "in_progress")
    body = _ask(client, course_id, "what should I watch next?").json()

    assert body["intent"] == "rewatch"
    assert body["lessons_to_rewatch"], "an unfinished course must suggest something"
    titles = {lesson["title"] for lesson in body["lessons_to_rewatch"]}
    unwatched = {lesson.title for lesson in unwatched_lessons(db, course_id)}
    assert titles <= unwatched, "never send an officer back to a video they have not started"


def test_it_says_so_when_there_is_nothing_to_mark_up(client, db):
    course_id = course_in_state(db, "not_started")
    body = _ask(client, course_id, "why did I get those wrong?").json()
    assert body["source"] == "record"
    assert "not attempted" in body["answer"].lower()


def test_it_explains_the_questions_that_were_answered_wrongly(client, db):
    """The explanation shown is the one authored for that question."""
    course_id = course_with_assessment(db)
    checkpoint = db.scalar(select(Checkpoint).where(Checkpoint.course_identifier == course_id))
    from app.models import BankQuestion

    questions = db.scalars(
        select(BankQuestion).where(BankQuestion.topic_id == checkpoint.topic_id).order_by(BankQuestion.id)
    ).all()
    assert questions

    db.add(
        CheckpointAttempt(
            user_id=USER,
            checkpoint_id=checkpoint.id,
            course_identifier=course_id,
            topic_id=checkpoint.topic_id,
            score_pct=25.0,
            passed=False,
            attempt_no=1,
            items=[
                {"question_id": q.id, "topic_id": checkpoint.topic_id, "correct": False}
                for q in questions
            ],
        )
    )
    db.commit()

    body = _ask(client, course_id, "explain what I got wrong").json()
    assert body["intent"] == "mistakes"
    assert questions[0].stem in body["answer"]
    assert questions[0].options[questions[0].answer_index] in body["answer"]
    if questions[0].explanation:
        assert questions[0].explanation in body["answer"]


def test_the_assessment_answer_tracks_whether_it_is_unlocked(client, db):
    course_id = course_with_assessment(db)
    locked = _ask(client, course_id, "is the final assessment unlocked?").json()
    assert "locked" in locked["answer"].lower()

    for lesson in unwatched_lessons(db, course_id):
        db.add(LessonProgress(user_id=USER, lesson_id=lesson.id, course_identifier=course_id))
    db.commit()

    opened = _ask(client, course_id, "is the final assessment unlocked?").json()
    assert "open" in opened["answer"].lower() or "pass mark" in opened["answer"].lower()


def test_an_open_question_is_declined_rather_than_invented(client, db):
    """With LLM_PROVIDER=stub there is no model, and inventing an answer is worse."""
    course_id = course_in_state(db, "in_progress")
    body = _ask(client, course_id, "What is stratified random sampling?").json()

    assert body["source"] == "unanswered"
    assert body["suggestions"], "declining must come with what it can answer"
    assert "no language model" in body["answer"].lower()


def test_the_tutor_never_reaches_into_another_course(client, db):
    """Videos it suggests belong to the course being asked about."""
    course_id = course_in_state(db, "in_progress")
    body = _ask(client, course_id, "what should I watch next?").json()

    theirs = {
        lesson.id
        for lesson in db.scalars(select(Lesson).where(Lesson.course_identifier == course_id)).all()
    }
    assert all(lesson["id"] in theirs for lesson in body["lessons_to_rewatch"])
