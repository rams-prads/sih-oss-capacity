"""Study time per day: the running time of the videos watched, and nothing else."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.engines.activity import activity
from app.models import Lesson, LessonProgress

DEMO = "u-jso-anita"


def _today():
    return datetime.now(timezone.utc).date()


def test_minutes_are_the_running_time_of_the_videos_watched_that_day(db):
    calendar = activity(db, DEMO, days=14)
    rows = db.scalars(select(LessonProgress).where(LessonProgress.user_id == DEMO)).all()
    lengths = dict(db.execute(select(Lesson.id, Lesson.duration_min)).all())

    for day in calendar.days:
        expected = sum(
            lengths[row.lesson_id]
            for row in rows
            if row.completed_at.date().isoformat() == day.date
        )
        assert day.minutes == expected


def test_a_video_watched_today_adds_its_length_to_today(db, client):
    before = client.get(f"/api/users/{DEMO}/activity", params={"days": 7}).json()["days"][-1]

    watched = {row.lesson_id for row in db.scalars(select(LessonProgress).where(LessonProgress.user_id == DEMO))}
    lesson = db.scalars(select(Lesson).where(Lesson.id.not_in(watched))).first()
    db.add(
        LessonProgress(
            user_id=DEMO,
            lesson_id=lesson.id,
            course_identifier=lesson.course_identifier,
            completed_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
    )
    db.commit()

    after = client.get(f"/api/users/{DEMO}/activity", params={"days": 7}).json()["days"][-1]
    assert after["date"] == _today().isoformat()
    assert after["minutes"] == before["minutes"] + lesson.duration_min
    assert after["lessons"] == before["lessons"] + 1


def test_a_day_with_no_videos_has_no_minutes(db):
    calendar = activity(db, DEMO, days=60)
    for day in calendar.days:
        if day.lessons == 0:
            assert day.minutes == 0


def test_the_recent_study_shows_as_time_on_each_of_the_last_six_days(db):
    calendar = activity(db, DEMO, days=7, today=_today())
    by_date = {d.date: d for d in calendar.days}
    for back in range(1, 7):
        assert by_date[(_today() - timedelta(days=back)).isoformat()].minutes > 0
