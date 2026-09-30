"""Learning momentum: points, goals, streaks, quests and achievements.

Every figure here is derived from the record, so these tests build a record and
read the figure back. Most use a fresh officer with no history, because a
seeded officer's past quietly adds to whatever total a test asserts; the demo
officer gets tests of her own, for what the demonstration depends on.
"""
from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.engines import momentum as engine
from app.engines.activity import activity
from app.models import (
    BankQuestion,
    Checkpoint,
    CheckpointAttempt,
    Enrolment,
    LearningGoal,
    Lesson,
    LessonProgress,
    Topic,
    User,
    VideoPrompt,
    VideoPromptAnswer,
)

FRESH = "u-test-momentum"
DEMO = "u-jso-anita"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _naive(value: datetime) -> datetime:
    return value.astimezone(timezone.utc).replace(tzinfo=None)


@pytest.fixture
def fresh(db):
    """An officer with a role and a department and nothing else on record."""
    db.add(
        User(
            id=FRESH,
            name="Test Officer",
            role_id="JSO",
            department="MoSPI - National Statistical Office",
        )
    )
    db.commit()
    return FRESH


def _video_course(db, min_lessons: int = 8) -> str:
    """A real course with enough video to arrange a record on, and an assessment."""
    counts = dict(
        db.execute(
            select(Lesson.course_identifier, func.count())
            .group_by(Lesson.course_identifier)
        ).all()
    )
    with_checkpoint = {
        c for (c,) in db.execute(select(Checkpoint.course_identifier).distinct()).all()
    }
    for course_id, count in sorted(counts.items()):
        if count >= min_lessons and course_id in with_checkpoint:
            return course_id
    raise AssertionError("no course has enough lessons to arrange a record on")


def _enrol(db, user_id: str, course_id: str) -> list[Lesson]:
    db.add(Enrolment(user_id=user_id, course_identifier=course_id, course_name="Test course"))
    db.commit()
    return list(
        db.scalars(
            select(Lesson).where(Lesson.course_identifier == course_id).order_by(Lesson.position)
        ).all()
    )


def _watch(db, user_id: str, lesson: Lesson, at: datetime) -> None:
    db.add(
        LessonProgress(
            user_id=user_id,
            lesson_id=lesson.id,
            course_identifier=lesson.course_identifier,
            completed_at=_naive(at),
        )
    )
    db.commit()


def _total(db, user_id: str, now: datetime | None = None) -> int:
    return sum(e.points for e in engine.ledger(db, user_id, now))


def _kinds(db, user_id: str, now: datetime | None = None) -> list[str]:
    return [e.kind for e in engine.ledger(db, user_id, now)]


# --- the rules ---------------------------------------------------------------
def test_the_rules_are_served_from_the_one_table(client, fresh):
    body = client.get(f"/api/users/{fresh}/momentum").json()
    served = {r["kind"]: r["points"] for r in body["rules"]}
    assert served == {kind: rule.points for kind, rule in engine.POINT_RULES.items()}
    assert served["lesson"] == 10


def test_a_new_officer_starts_with_nothing_and_the_default_goal(client, fresh):
    body = client.get(f"/api/users/{fresh}/momentum").json()
    assert body["points"] == {"total": 0, "today": 0, "this_week": 0}
    assert body["streak"]["current"] == 0
    assert body["goal"] == {"weekly_days_target": 3, "daily_points_target": 20, "effective_from": None}
    assert body["pending_goal"] is None
    assert len(body["quests"]) == 3
    assert not any(q["done"] for q in body["quests"])
    assert not any(a["unlocked"] for a in body["achievements"])


def test_unknown_officer_is_404(client):
    assert client.get("/api/users/nobody/momentum").status_code == 404
    assert client.get("/api/users/nobody/next-action").status_code == 404


def test_the_engine_and_the_router_agree_on_the_self_assessment_course():
    from app.routers.assessment import SELF_COURSE

    assert engine.SELF_ASSESSMENT_COURSE == SELF_COURSE


# --- earning -----------------------------------------------------------------
def test_watching_a_video_earns_its_points_once(client, db, fresh):
    lessons = _enrol(db, fresh, _video_course(db))
    first = lessons[0]
    for _ in range(2):
        assert client.post(f"/api/users/{fresh}/lessons/{first.id}/complete").status_code == 200
    assert _kinds(db, fresh) == ["lesson"]
    assert _total(db, fresh) == 10


def test_enrolling_earns_nothing(client, db, fresh):
    course_id = client.get("/api/courses").json()[0]["identifier"]
    assert (
        client.post(f"/api/users/{fresh}/enrolments", json={"course_identifier": course_id}).status_code
        == 201
    )
    assert _total(db, fresh) == 0


def test_a_practice_quiz_earns_nothing(client, db, fresh):
    """The generator writes nothing to the record, so nothing can be counted."""
    from tests.test_api_loop import SAMPLE

    material = client.post(
        "/api/materials", files={"file": ("s.txt", io.BytesIO(SAMPLE.encode()), "text/plain")}
    ).json()["source_material_id"]
    quiz = client.post(
        "/api/quizzes",
        json={"source_material_id": material, "competency_id": "C01", "num_questions": 5},
    ).json()["quiz"]
    answers = [0] * len(quiz["questions"])
    submitted = client.post(
        f"/api/quizzes/{quiz['id']}/submit", params={"user_id": fresh}, json={"answers": answers}
    )
    assert submitted.status_code == 200
    assert _total(db, fresh) == 0


def test_a_course_assessment_pays_for_its_first_sitting_and_first_pass(db, fresh):
    course_id = _video_course(db)
    _enrol(db, fresh, course_id)
    checkpoint = db.scalar(select(Checkpoint).where(Checkpoint.course_identifier == course_id))
    start = _now() - timedelta(hours=4)
    for minutes, passed in enumerate([False, False, True, True]):
        db.add(
            CheckpointAttempt(
                user_id=fresh,
                checkpoint_id=checkpoint.id,
                course_identifier=course_id,
                topic_id=checkpoint.topic_id,
                score_pct=75.0 if passed else 25.0,
                passed=passed,
                attempt_no=minutes + 1,
                items=[],
                created_at=_naive(start + timedelta(minutes=minutes * 30)),
            )
        )
    db.commit()
    kinds = _kinds(db, fresh)
    assert kinds.count("checkpoint_sat") == 1
    assert kinds.count("checkpoint_passed") == 1
    assert sum(e.points for e in engine.ledger(db, fresh) if not e.bonus) == 15 + 10


def _self_attempt(db, user_id: str, topic: Topic, at: datetime, passed: bool) -> None:
    db.add(
        CheckpointAttempt(
            user_id=user_id,
            checkpoint_id=_self_checkpoint(db, topic).id,
            course_identifier=engine.SELF_ASSESSMENT_COURSE,
            topic_id=topic.id,
            score_pct=80.0 if passed else 20.0,
            passed=passed,
            attempt_no=1,
            items=[{"question_id": 0, "topic_id": topic.id, "correct": passed}],
            created_at=_naive(at),
        )
    )
    db.commit()


def _self_checkpoint(db, topic: Topic) -> Checkpoint:
    existing = db.scalar(
        select(Checkpoint).where(
            Checkpoint.course_identifier == engine.SELF_ASSESSMENT_COURSE,
            Checkpoint.topic_id == topic.id,
        )
    )
    if existing:
        return existing
    used = db.scalars(
        select(Checkpoint.module_index).where(
            Checkpoint.course_identifier == engine.SELF_ASSESSMENT_COURSE
        )
    ).all()
    checkpoint = Checkpoint(
        course_identifier=engine.SELF_ASSESSMENT_COURSE,
        module_index=(max(used) + 1) if used else 0,
        title=f"Self-assessment: {topic.name}",
        topic_id=topic.id,
    )
    db.add(checkpoint)
    db.commit()
    return checkpoint


def _topics_for_two_competencies(db) -> tuple[Topic, Topic, Topic]:
    """Two topics of one competency and one of another, all with bank questions."""
    topics = db.scalars(
        select(Topic).join(BankQuestion, BankQuestion.topic_id == Topic.id).distinct().order_by(Topic.id)
    ).all()
    by_competency: dict[str, list[Topic]] = {}
    for topic in topics:
        by_competency.setdefault(topic.competency_id, []).append(topic)
    pair = next(ts for ts in by_competency.values() if len(ts) >= 2)
    other = next(ts[0] for cid, ts in by_competency.items() if cid != pair[0].competency_id)
    return pair[0], pair[1], other


def test_a_competency_assessment_pays_once_per_competency_per_day(db, fresh):
    same_a, same_b, other = _topics_for_two_competencies(db)
    yesterday = _now() - timedelta(days=1)
    today = _now() - timedelta(minutes=30)

    _self_attempt(db, fresh, same_a, yesterday - timedelta(hours=1), passed=False)
    _self_attempt(db, fresh, same_b, yesterday, passed=True)      # same competency, same day
    _self_attempt(db, fresh, same_a, today, passed=False)         # same competency, next day
    _self_attempt(db, fresh, other, today, passed=False)          # another competency

    earning = [e for e in engine.ledger(db, fresh) if not e.bonus]
    assert [e.kind for e in earning].count("assessment_sat") == 3
    assert [e.kind for e in earning].count("assessment_passed") == 1
    assert sum(e.points for e in earning) == 20 + 10 + 20 + 20


def test_an_in_video_question_pays_for_its_first_answer_only(db, fresh):
    prompts = db.scalars(select(VideoPrompt).order_by(VideoPrompt.id).limit(2)).all()
    assert len(prompts) == 2
    stamp = _naive(_now() - timedelta(minutes=5))
    for prompt, choice in [(prompts[0], 0), (prompts[0], 1), (prompts[1], 0)]:
        db.add(
            VideoPromptAnswer(
                user_id=fresh,
                prompt_id=prompt.id,
                lesson_id=prompt.lesson_id,
                chosen_index=choice,
                correct=False,
                answered_at=stamp,
            )
        )
    db.commit()
    assert _kinds(db, fresh) == ["prompt", "prompt"]
    assert _total(db, fresh) == 4


def test_nothing_dated_after_today_is_counted(db, fresh):
    lessons = _enrol(db, fresh, _video_course(db))
    _watch(db, fresh, lessons[0], _now() + timedelta(days=2))
    assert _total(db, fresh) == 0


# --- goals and bonuses ---------------------------------------------------------
def test_the_daily_goal_pays_once_and_bonuses_never_count_towards_it(client, db, fresh):
    lessons = _enrol(db, fresh, _video_course(db))
    base = _now() - timedelta(minutes=30)
    for i, lesson in enumerate(lessons[:3]):
        _watch(db, fresh, lesson, base + timedelta(minutes=i))

    kinds = _kinds(db, fresh)
    assert kinds.count("daily_goal") == 1

    daily = client.get(f"/api/users/{fresh}/momentum").json()["daily_goal"]
    assert daily["earned"] == 30          # three videos; the +10 bonus is not in here
    assert daily["met"] is True
    assert daily["remaining"] == 0


def test_the_weekly_goal_pays_once_a_week(db, fresh):
    lessons = _enrol(db, fresh, _video_course(db))
    monday = engine.week_start(_now().date() - timedelta(days=14))
    for offset in range(4):                   # four study days against a target of three
        day = datetime.combine(monday + timedelta(days=offset), datetime.min.time(), timezone.utc)
        _watch(db, fresh, lessons[offset], day + timedelta(hours=9))
    assert _kinds(db, fresh).count("weekly_goal") == 1


def test_the_seventh_consecutive_day_pays_a_milestone(db, fresh):
    lessons = _enrol(db, fresh, _video_course(db))
    for ago in range(7, 0, -1):
        _watch(db, fresh, lessons[7 - ago], _now() - timedelta(days=ago))
    entries = engine.ledger(db, fresh)
    milestones = [e for e in entries if e.kind == "streak_milestone"]
    assert len(milestones) == 1
    assert milestones[0].label == "7-day streak"


def test_the_week_is_also_told_in_items_and_minutes(db, fresh):
    lessons = _enrol(db, fresh, _video_course(db))
    monday = engine.week_start(_now().date())
    stamp = datetime.combine(monday, datetime.min.time(), timezone.utc) + timedelta(hours=9)
    _watch(db, fresh, lessons[0], stamp)
    _watch(db, fresh, lessons[1], stamp + timedelta(minutes=20))
    # Last week's video counts for nothing this week.
    _watch(db, fresh, lessons[2], stamp - timedelta(days=3))

    week = engine.momentum(db, fresh, now=stamp + timedelta(hours=1))["weekly_goal"]
    assert week["items_completed"] == 2
    assert week["minutes_learned"] == lessons[0].duration_min + lessons[1].duration_min


def test_the_week_rolls_over_on_monday(db, fresh):
    lessons = _enrol(db, fresh, _video_course(db))
    sunday = engine.week_start(_now().date()) - timedelta(days=1)
    stamp = datetime.combine(sunday, datetime.min.time(), timezone.utc) + timedelta(hours=10)
    _watch(db, fresh, lessons[0], stamp)

    on_sunday = engine.momentum(db, fresh, now=stamp + timedelta(hours=2))
    on_monday = engine.momentum(db, fresh, now=stamp + timedelta(days=1))
    assert on_sunday["weekly_goal"]["active_days"] == 1
    assert on_sunday["points"]["this_week"] == 10
    assert on_monday["weekly_goal"]["active_days"] == 0
    assert on_monday["points"]["this_week"] == 0
    assert on_monday["points"]["total"] == 10


def test_raising_a_goal_applies_now_and_lowering_waits_for_monday(db, fresh):
    wednesday = datetime.combine(
        engine.week_start(_now().date()) + timedelta(days=2), datetime.min.time(), timezone.utc
    )
    this_monday = engine.week_start(wednesday.date())

    raised = engine.set_learning_goal(db, fresh, 5, 30, now=wednesday)
    assert raised.effective_from == this_monday

    lowered = engine.set_learning_goal(db, fresh, 2, 30, now=wednesday)
    assert lowered.effective_from == this_monday + timedelta(days=7)

    view = engine.momentum(db, fresh, now=wednesday)
    assert view["goal"]["weekly_days_target"] == 5
    assert view["pending_goal"]["weekly_days_target"] == 2

    # Lowering again the same week replaces the waiting change rather than losing it.
    engine.set_learning_goal(db, fresh, 3, 20, now=wednesday)
    view = engine.momentum(db, fresh, now=wednesday)
    assert view["goal"]["weekly_days_target"] == 5
    assert view["pending_goal"]["weekly_days_target"] == 3
    assert view["pending_goal"]["daily_points_target"] == 20

    # A newer choice replaces the change still waiting to start.
    engine.set_learning_goal(db, fresh, 6, 30, now=wednesday)
    view = engine.momentum(db, fresh, now=wednesday)
    assert view["goal"]["weekly_days_target"] == 6
    assert view["pending_goal"] is None


def test_a_past_week_keeps_the_goal_it_was_judged_against(db, fresh):
    lessons = _enrol(db, fresh, _video_course(db))
    monday = engine.week_start(_now().date() - timedelta(days=14))
    for offset in range(3):
        day = datetime.combine(monday + timedelta(days=offset), datetime.min.time(), timezone.utc)
        _watch(db, fresh, lessons[offset], day + timedelta(hours=9))
    assert _kinds(db, fresh).count("weekly_goal") == 1

    engine.set_learning_goal(db, fresh, 7, 20)   # raised from this week on, not before
    assert _kinds(db, fresh).count("weekly_goal") == 1


def test_the_goal_endpoint_validates_and_reports_the_new_goal(client, fresh):
    assert (
        client.put(
            f"/api/users/{fresh}/learning-goal",
            json={"weekly_days_target": 1, "daily_points_target": 20},
        ).status_code
        == 422
    )
    assert (
        client.put(
            f"/api/users/{fresh}/learning-goal",
            json={"weekly_days_target": 3, "daily_points_target": 5},
        ).status_code
        == 422
    )
    response = client.put(
        f"/api/users/{fresh}/learning-goal",
        json={"weekly_days_target": 5, "daily_points_target": 40},
    )
    assert response.status_code == 200
    assert response.json()["goal"]["weekly_days_target"] == 5
    assert response.json()["daily_goal"]["target"] == 40
    assert client.put(
        "/api/users/nobody/learning-goal",
        json={"weekly_days_target": 5, "daily_points_target": 40},
    ).status_code == 404


def test_choosing_the_default_target_still_records_a_choice(client, fresh):
    before = client.get(f"/api/users/{fresh}/momentum").json()
    assert before["goal"]["effective_from"] is None

    after = client.put(
        f"/api/users/{fresh}/learning-goal",
        json={"weekly_days_target": 3, "daily_points_target": 20},
    ).json()
    assert after["goal"]["weekly_days_target"] == 3
    assert after["goal"]["effective_from"] is not None


def test_goals_are_kept_as_history_not_overwritten(db, fresh):
    engine.set_learning_goal(db, fresh, 5, 30)
    engine.set_learning_goal(db, fresh, 2, 10)     # a lowering: a second row, for next week
    rows = db.scalars(select(LearningGoal).where(LearningGoal.user_id == fresh)).all()
    assert len(rows) == 2
    assert all(r.effective_from.weekday() == 0 for r in rows)


# --- the streak ------------------------------------------------------------------
def test_the_streak_is_the_study_calendars_streak(client, db):
    for user_id in (DEMO, "u-jso-rakesh"):
        streak = client.get(f"/api/users/{user_id}/momentum").json()["streak"]
        calendar = activity(db, user_id)
        assert streak["current"] == calendar.current_streak
        assert streak["longest"] == calendar.longest_streak


def test_the_demo_officer_is_one_video_from_a_seven_day_streak(client, db):
    """What the demonstration depends on, and what the seed must not disturb."""
    before = client.get(f"/api/users/{DEMO}/momentum").json()
    assert before["streak"]["current"] == 6
    assert before["streak"]["at_risk"] is True
    assert not next(a for a in before["achievements"] if a["id"] == "streak_7")["unlocked"]
    # The recent study is videos only, so the measured record is untouched.
    assert client.get(f"/api/gaps/{DEMO}").json()["readiness_pct"] == 53.0

    lesson = db.scalar(
        select(Lesson)
        .join(Enrolment, Enrolment.course_identifier == Lesson.course_identifier)
        .where(Enrolment.user_id == DEMO)
        .where(
            Lesson.id.not_in(
                select(LessonProgress.lesson_id).where(LessonProgress.user_id == DEMO)
            )
        )
        .order_by(Lesson.id)
    )
    assert client.post(f"/api/users/{DEMO}/lessons/{lesson.id}/complete").status_code == 200

    after = client.get(f"/api/users/{DEMO}/momentum").json()
    assert after["streak"]["current"] == 7
    assert after["streak"]["studied_today"] is True
    streak_badge = next(a for a in after["achievements"] if a["id"] == "streak_7")
    assert streak_badge["unlocked"] and streak_badge["unlocked_on"] == after["today"]
    assert any(line["kind"] == "streak_milestone" for line in after["recent"])
    assert after["points"]["total"] >= before["points"]["total"] + 10 + 25


# --- quests ----------------------------------------------------------------------
def test_the_learn_quest_and_the_continue_card_name_the_same_course(client):
    momentum = client.get(f"/api/users/{DEMO}/momentum").json()
    card = client.get(f"/api/users/{DEMO}/next-action").json()["continue_learning"]
    learn = next(q for q in momentum["quests"] if q["id"] == "learn")
    assert learn["cta"]["course_identifier"] == card["course_identifier"]
    assert card["course_name"] in learn["title"]


def test_the_learn_quest_offers_the_assessment_when_only_that_is_left(db, fresh):
    course_id = _video_course(db)
    lessons = _enrol(db, fresh, course_id)
    for lesson in lessons:
        _watch(db, fresh, lesson, _now() - timedelta(days=2))
    checkpoint = db.scalar(select(Checkpoint).where(Checkpoint.course_identifier == course_id))

    learn = next(q for q in engine.momentum(db, fresh)["quests"] if q["id"] == "learn")
    assert learn["title"] == "Take the assessment in Test course"
    assert learn["cta"]["course_identifier"] == course_id

    # Sitting it is course progress: it ticks the learn quest, not the measure one.
    db.add(
        CheckpointAttempt(
            user_id=fresh,
            checkpoint_id=checkpoint.id,
            course_identifier=course_id,
            topic_id=checkpoint.topic_id,
            score_pct=25.0,
            passed=False,
            attempt_no=1,
            items=[],
            created_at=_naive(_now() - timedelta(minutes=5)),
        )
    )
    db.commit()
    quests = {q["id"]: q for q in engine.momentum(db, fresh)["quests"]}
    assert quests["learn"]["done"] is True
    assert quests["learn"]["title"] == "Sat the assessment in Test course"
    assert quests["measure"]["done"] is False


def test_a_measure_quest_stays_done_after_the_sitting_moves_the_gaps(client, db):
    quest = next(
        q for q in client.get(f"/api/users/{DEMO}/momentum").json()["quests"] if q["id"] == "measure"
    )
    competency_id = quest["cta"]["competency_id"]
    sitting = client.get(f"/api/competency-assessment/{DEMO}/{competency_id}").json()
    answers = [0] * len(sitting["questions"])
    submitted = client.post(
        f"/api/competency-assessment/{DEMO}/{competency_id}/submit", json={"answers": answers}
    )
    assert submitted.status_code == 200

    done = next(
        q for q in client.get(f"/api/users/{DEMO}/momentum").json()["quests"] if q["id"] == "measure"
    )
    assert done["done"] is True
    assert sitting["competency_name"] in done["title"]


def test_the_review_quest_is_judged_on_the_record_before_today(db, fresh):
    same_a, _, other = _topics_for_two_competencies(db)
    _self_attempt(db, fresh, same_a, _now() - timedelta(days=3), passed=False)

    quests = engine.momentum(db, fresh)["quests"]
    review = next(q for q in quests if q["id"] == "review")
    assert same_a.name in review["title"] and not review["done"]

    # Sitting it today lifts its accuracy; the quest must tick, not move on.
    _self_attempt(db, fresh, same_a, _now() - timedelta(minutes=1), passed=True)
    review = next(q for q in engine.momentum(db, fresh)["quests"] if q["id"] == "review")
    assert review["done"] is True
    assert same_a.name in review["title"]


# --- achievements and the cohort --------------------------------------------------
def test_achievements_unlock_from_the_record_with_the_day_they_did(db, fresh):
    lessons = _enrol(db, fresh, _video_course(db))
    for ago in range(7, 0, -1):
        _watch(db, fresh, lessons[7 - ago], _now() - timedelta(days=ago))
    view = engine.momentum(db, fresh)
    badges = {a["id"]: a for a in view["achievements"]}
    assert badges["streak_7"]["unlocked"]
    assert badges["streak_7"]["unlocked_on"] == (_now() - timedelta(days=1)).date()
    assert not badges["first_assessment"]["unlocked"]
    assert badges["videos_25"]["progress"] == 7 and not badges["videos_25"]["unlocked"]


def test_the_cohort_line_names_no_colleague(client):
    response = client.get(f"/api/users/{DEMO}/momentum")
    text = response.text
    cohort = response.json()["cohort"]
    assert cohort["of"] >= 2 and 1 <= cohort["rank"] <= cohort["of"]
    colleagues = client.get("/api/users").json()
    for other in colleagues:
        if other["id"] == DEMO:
            continue
        assert other["id"] not in text
        assert other["name"] not in text
