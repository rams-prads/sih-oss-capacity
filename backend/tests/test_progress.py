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

SURVEY_DESIGN = "do_3137421900011"
DESCRIPTIVE = "do_3137421900017"
CLASSIFICATION = "do_3137421900023"
DATA_QUALITY = "do_3137421900015"


def _enrolment(db, user_id, course_id):
    from sqlalchemy import select

    return db.scalar(
        select(Enrolment).where(
            Enrolment.user_id == user_id, Enrolment.course_identifier == course_id
        )
    )


def test_progress_counts_videos_and_passed_checkpoints(db):
    """4 of 9 videos plus 1 of 3 checkpoints = 5 of 12 units."""
    progress = course_progress(db, "u-jso-anita", SURVEY_DESIGN)
    assert progress["lessons_total"] == 9
    assert progress["checkpoints_total"] == 3
    assert progress["lessons_completed"] == 4
    assert progress["checkpoints_passed"] == 1
    assert progress["progress_pct"] == round(100 * 5 / 12)


def test_a_failed_checkpoint_does_not_count_toward_progress(db):
    """Rakesh failed module 2 at 50%, then passed at 75%: still one pass."""
    progress = course_progress(db, "u-jso-rakesh", "do_3137421900025")
    module = progress["modules"][1]
    assert module["attempts"] == 2
    assert module["best_score_pct"] == 75.0
    assert module["checkpoint_passed"] is True


def test_checkpoint_locks_until_its_videos_are_watched(db):
    progress = course_progress(db, "u-jso-anita", SURVEY_DESIGN)
    assert progress["modules"][0]["checkpoint_unlocked"] is True   # 3 of 3 watched
    assert progress["modules"][1]["checkpoint_unlocked"] is False  # 1 of 3 watched


def test_status_derivation(db):
    cases = {
        DESCRIPTIVE: COMPLETED,
        SURVEY_DESIGN: IN_PROGRESS,
        CLASSIFICATION: EXPIRED,
        DATA_QUALITY: NOT_STARTED,
    }
    for course_id, expected in cases.items():
        enrolment = _enrolment(db, "u-jso-anita", course_id)
        progress = course_progress(db, "u-jso-anita", course_id)
        assert derive_status(enrolment, progress) == expected, course_id


def test_a_finished_course_is_never_marked_expired(db):
    """Completing before the window closes must survive the date passing."""
    enrolment = _enrolment(db, "u-jso-anita", DESCRIPTIVE)
    enrolment.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    progress = course_progress(db, "u-jso-anita", DESCRIPTIVE)
    assert derive_status(enrolment, progress) == COMPLETED


def test_next_action_is_the_next_unwatched_video(db):
    progress = course_progress(db, "u-jso-anita", SURVEY_DESIGN)
    action = next_action(progress, IN_PROGRESS)
    assert action is not None
    assert action["kind"] == "lesson"
    assert action["label"] == "Choosing stratification variables"


def test_next_action_becomes_the_checkpoint_once_a_module_is_watched(db):
    progress = course_progress(db, "u-si-lalita", CLASSIFICATION)
    action = next_action(progress, IN_PROGRESS)
    assert action is not None
    # Lalita watched 4 of 9 and passed module 1, so module 2's videos come next.
    assert action["kind"] == "lesson"


def test_completed_and_expired_courses_have_no_next_action(db):
    for course_id, course_status in ((DESCRIPTIVE, COMPLETED), (CLASSIFICATION, EXPIRED)):
        progress = course_progress(db, "u-jso-anita", course_id)
        assert next_action(progress, course_status) is None


def test_topic_mastery_counts_every_attempt_not_just_the_best(db):
    """Anita failed hypothesis testing 1/4 then passed 3/4: 4 of 8 overall."""
    rows = {r["topic_id"]: r for r in topic_mastery(db, "u-jso-anita")}
    hypothesis = rows["T12"]
    assert hypothesis["questions_answered"] == 8
    assert hypothesis["questions_correct"] == 4
    assert hypothesis["accuracy_pct"] == 50.0
    assert hypothesis["verdict"] == "developing"
    assert hypothesis["attempts"] == 2


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

    final = [m for m in progress["modules"] if m["lessons_total"] == 0]
    assert len(final) == 1, "expected exactly one course-level final assessment"
    assert final[0]["checkpoint_id"] is not None
    assert final[0]["checkpoint_unlocked"] is False, "locked before anything is watched"

    # Watch the lot; the final assessment then opens.
    for lesson in db.scalars(
        select(Lesson).where(Lesson.course_identifier == course_id)
    ).all():
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
