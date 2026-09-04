"""Course progress, status derivation and topic mastery."""
from datetime import datetime, timedelta, timezone

import pytest

from app.engines.progress import (
    COMPLETED,
    EXPIRED,
    IN_PROGRESS,
    NOT_STARTED,
    classify,
    course_progress,
    derive_status,
    next_action,
    topic_mastery,
)
from app.models import Enrolment

# Courses are resolved by the state the test needs, not by id: the catalogue is
# fetched from iGOT and its identifiers change between refreshes.
from tests.conftest import (  # noqa: E402
    course_in_state,
    course_with_assessment,
    unwatched_lessons,
)


def _enrolment(db, user_id, course_id):
    from sqlalchemy import select

    return db.scalar(
        select(Enrolment).where(
            Enrolment.user_id == user_id, Enrolment.course_identifier == course_id
        )
    )


def test_progress_counts_videos_and_passed_checkpoints(db):
    """A course is its videos plus its assessments, and progress is the units done."""
    progress = course_progress(db, "u-jso-anita", course_in_state(db, IN_PROGRESS))
    total = progress["lessons_total"] + progress["checkpoints_total"]
    done = progress["lessons_completed"] + progress["checkpoints_passed"]
    assert total > 0
    assert 0 < done < total, "an in-progress course is neither untouched nor finished"
    assert progress["progress_pct"] == round(100 * done / total)


def test_a_failed_checkpoint_does_not_count_toward_progress(db):
    """A failed attempt is recorded but never counts as a passed unit."""
    from sqlalchemy import select

    from app.models import Checkpoint, CheckpointAttempt

    course_id = course_with_assessment(db)
    checkpoint = db.scalar(select(Checkpoint).where(Checkpoint.course_identifier == course_id))
    db.add(
        CheckpointAttempt(
            user_id="u-jso-anita",
            checkpoint_id=checkpoint.id,
            course_identifier=course_id,
            topic_id=checkpoint.topic_id,
            score_pct=25.0,
            passed=False,
            attempt_no=1,
            items=[],
        )
    )
    db.flush()

    progress = course_progress(db, "u-jso-anita", course_id)
    module = next(m for m in progress["modules"] if m["checkpoint_id"] == checkpoint.id)
    assert module["attempts"] == 1
    assert module["best_score_pct"] == 25.0
    assert module["checkpoint_passed"] is False
    assert progress["checkpoints_passed"] == 0


def test_checkpoint_locks_until_its_videos_are_watched(db):
    """The assessment opens only once the course has actually been watched."""
    course_id = course_with_assessment(db)
    progress = course_progress(db, "u-jso-anita", course_id)
    gated = [m for m in progress["modules"] if m["checkpoint_id"] is not None]
    assert gated, "expected an assessment on this course"
    assert progress["lessons_completed"] < progress["lessons_total"]
    assert all(m["checkpoint_unlocked"] is False for m in gated)


def test_status_derivation(db):
    cases = {
        course_in_state(db, COMPLETED): COMPLETED,
        course_in_state(db, IN_PROGRESS): IN_PROGRESS,
        course_in_state(db, EXPIRED): EXPIRED,
        course_in_state(db, NOT_STARTED): NOT_STARTED,
    }
    for course_id, expected in cases.items():
        enrolment = _enrolment(db, "u-jso-anita", course_id)
        progress = course_progress(db, "u-jso-anita", course_id)
        assert derive_status(enrolment, progress) == expected, course_id


def test_a_finished_course_is_never_marked_expired(db):
    """Completing before the window closes must survive the date passing."""
    completed_id = course_in_state(db, COMPLETED)
    enrolment = _enrolment(db, "u-jso-anita", completed_id)
    enrolment.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    progress = course_progress(db, "u-jso-anita", completed_id)
    assert derive_status(enrolment, progress) == COMPLETED


def test_next_action_is_the_next_unwatched_video(db):
    progress = course_progress(db, "u-jso-anita", course_in_state(db, IN_PROGRESS))
    action = next_action(progress, IN_PROGRESS)
    assert action is not None
    assert action["kind"] == "lesson"
    # The next thing to do is the first video not yet watched.
    unwatched = [
        lesson
        for module in progress["modules"]
        for lesson in module["lessons"]
        if not lesson["completed"]
    ]
    assert action["lesson_id"] == unwatched[0]["id"]


def test_next_action_becomes_the_assessment_once_the_videos_are_watched(db):
    """With every video done, the one thing left is the assessment."""
    from sqlalchemy import select

    from app.models import Lesson, LessonProgress

    course_id = course_with_assessment(db)
    for lesson in unwatched_lessons(db, course_id):
        db.add(
            LessonProgress(
                user_id="u-jso-anita", lesson_id=lesson.id, course_identifier=course_id
            )
        )
    db.flush()

    progress = course_progress(db, "u-jso-anita", course_id)
    action = next_action(progress, IN_PROGRESS)
    assert action is not None
    assert action["kind"] == "checkpoint"
    assert action["checkpoint_id"] is not None


def test_completed_and_expired_courses_have_no_next_action(db):
    for course_id, course_status in (
        (course_in_state(db, COMPLETED), COMPLETED),
        (course_in_state(db, EXPIRED), EXPIRED),
    ):
        progress = course_progress(db, "u-jso-anita", course_id)
        assert next_action(progress, course_status) is None


def test_topic_mastery_counts_every_attempt_not_just_the_best(db):
    """A retake does not erase the first attempt: accuracy is over both.

    Farah has no seeded assessment history, so the counts here are only what
    this test put there.
    """
    from sqlalchemy import select

    from app.models import Checkpoint, CheckpointAttempt

    course_id = course_with_assessment(db)
    checkpoint = db.scalar(select(Checkpoint).where(Checkpoint.course_identifier == course_id))
    for attempt_no, correct in ((1, 1), (2, 3)):
        db.add(
            CheckpointAttempt(
                user_id="u-jso-farah",
                checkpoint_id=checkpoint.id,
                course_identifier=course_id,
                topic_id=checkpoint.topic_id,
                score_pct=25.0 * correct,
                passed=correct >= 3,
                attempt_no=attempt_no,
                items=[
                    {"question_id": 0, "topic_id": checkpoint.topic_id, "correct": i < correct}
                    for i in range(4)
                ],
            )
        )
    db.flush()

    rows = {r["topic_id"]: r for r in topic_mastery(db, "u-jso-farah")}
    row = rows[checkpoint.topic_id]
    assert row["attempts"] == 2
    assert row["questions_answered"] == 8
    assert row["questions_correct"] == 4      # 1 then 3, not just the better run
    assert row["accuracy_pct"] == 50.0
    assert row["verdict"] == "developing"


def test_topic_mastery_is_weakest_first(db):
    rows = topic_mastery(db, "u-jso-anita")
    assert [r["accuracy_pct"] for r in rows] == sorted(r["accuracy_pct"] for r in rows)


def test_learner_with_no_attempts_has_no_topic_record(db):
    assert topic_mastery(db, "u-jso-farah") == []


@pytest.mark.parametrize(
    "accuracy,expected",
    [(100.0, "strong"), (80.0, "strong"), (79.9, "developing"), (50.0, "developing"), (49.9, "weak"), (0.0, "weak")],
)
def test_verdict_boundaries(accuracy, expected):
    assert classify(accuracy) == expected


def _igot_course_with_video(db):
    """A real ingested course: modules of video, one assessment at the end."""
    from sqlalchemy import select

    from app.models import Checkpoint, Lesson

    video_courses = sorted(
        {
            c
            for (c,) in db.execute(
                select(Lesson.course_identifier).where(Lesson.video_url != "").distinct()
            )
        }
    )
    for course_id in video_courses:
        checkpoints = db.scalars(
            select(Checkpoint).where(Checkpoint.course_identifier == course_id)
        ).all()
        if len(checkpoints) == 1:
            return course_id
    return None


def test_igot_modules_are_visible_and_gated_on_the_whole_course(db):
    """Modules must come from lessons, not only from checkpoints.

    An ingested iGOT course carries modules of video and a single assessment at
    the end. Building the module view from checkpoints alone hid every one of its
    lessons and left that assessment permanently locked.
    """
    from sqlalchemy import select

    from app.models import Lesson, LessonProgress

    course_id = _igot_course_with_video(db)
    assert course_id, "expected at least one ingested course with video"

    progress = course_progress(db, "u-jso-anita", course_id)
    assert progress["lessons_total"] > 0
    # Every lesson is reachable through some module, not orphaned.
    shown = sum(len(m["lessons"]) for m in progress["modules"])
    assert shown == progress["lessons_total"]

    # The url has to survive serialisation, or the player never appears.
    played = [
        lesson
        for module in progress["modules"]
        for lesson in module["lessons"]
        if lesson["video_url"]
    ]
    assert played, "ingested lessons must carry the mp4 url through to the client"

    final = [m for m in progress["modules"] if m["lessons_total"] == 0]
    assert len(final) == 1, "expected exactly one course-level final assessment"
    assert final[0]["checkpoint_id"] is not None
    assert final[0]["checkpoint_unlocked"] is False, "locked before anything is watched"

    # Watch the lot; the final assessment then opens.
    for lesson in unwatched_lessons(db, course_id):
        db.add(
            LessonProgress(
                user_id="u-jso-anita",
                lesson_id=lesson.id,
                course_identifier=course_id,
            )
        )
    db.flush()

    after = course_progress(db, "u-jso-anita", course_id)
    final_after = [m for m in after["modules"] if m["lessons_total"] == 0][0]
    assert final_after["checkpoint_unlocked"] is True


def test_a_video_module_without_a_quiz_offers_no_checkpoint_action(db):
    """next_action must not hand back a null checkpoint id."""
    course_id = _igot_course_with_video(db)
    progress = course_progress(db, "u-jso-anita", course_id)
    action = next_action(progress, IN_PROGRESS)
    assert action is not None
    if action["kind"] == "checkpoint":
        assert action["checkpoint_id"] is not None
