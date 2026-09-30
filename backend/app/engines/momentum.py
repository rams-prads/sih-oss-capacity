"""Learning momentum: points, goals, streaks, quests and achievements.

Readiness says where an officer stands and the gap report says what to learn.
Neither says whether they are keeping at it this week, and consistency is the
one thing an officer controls today. This turns what they actually did into the
everyday signals a learning platform runs on - a daily goal, a weekly goal, a
streak, a few quests, a handful of achievements - without inventing a number.

Nothing here is stored. Every point is read off an event the platform already
records with a timestamp: a video watched, an assessment sat, an in-video
question answered, a course finished. Change a rule and every total recomputes;
there is no balance to drift out of step with the record, and no endpoint that
can award a point, so the only way to earn one is to do the thing it is for.

What earns points, and what deliberately does not:

  - Enrolling earns nothing. It takes one click and teaches nothing - the rule
    the study calendar already applies (engines/activity.py).
  - A practice quiz from the generator earns nothing. It writes nothing to the
    record by design (routers/quiz.py), and a points total must not become the
    one place a practice sitting leaves a trace.
  - Repeating a thing does not repeat its points. A course assessment pays for
    its first sitting and its first pass; a competency assessment pays once per
    competency per day; an in-video question pays for its first answer. The
    attempt throttle stops rapid retries; this stops slow ones paying.
  - Bonuses (daily goal, weekly goal, streak milestones, the weekly challenge)
    never count towards goals themselves, so no goal can meet itself.

Days are UTC dates and weeks run Monday to Sunday - what the study calendar
already uses - so the streak here and the streak on the profile are one number,
computed in one place, rather than two that disagree near midnight.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.engines.activity import activity
from app.engines.gap import compute_gaps, compute_gaps_bulk
from app.engines.progress import (
    IN_PROGRESS,
    NOT_STARTED,
    classify,
    course_progress,
    derive_status,
    next_action,
)
from app.engines.progression import progression_gaps
from app.engines.recommend import recommend_courses
from app.models import (
    DEFAULT_DAILY_POINTS,
    DEFAULT_WEEKLY_DAYS,
    PROFICIENCY_LABELS,
    AssessmentResult,
    BankQuestion,
    CheckpointAttempt,
    Competency,
    Enrolment,
    LearningGoal,
    Lesson,
    LessonProgress,
    Topic,
    User,
    UserCompetency,
    VideoPromptAnswer,
)

# The reserved course identifier competency self-assessments are filed under.
# Mirrors routers/assessment.py:SELF_COURSE; a test holds the two together so
# the engine does not have to import a router to know it.
SELF_ASSESSMENT_COURSE = "self-assessment"

# --- the rules --------------------------------------------------------------
LESSON = "lesson"
PROMPT = "prompt"
CHECKPOINT_SAT = "checkpoint_sat"
CHECKPOINT_PASSED = "checkpoint_passed"
ASSESSMENT_SAT = "assessment_sat"
ASSESSMENT_PASSED = "assessment_passed"
ASSESSMENT_RECORD = "assessment_record"
COURSE_COMPLETED = "course_completed"
DAILY_GOAL = "daily_goal"
WEEKLY_GOAL = "weekly_goal"
STREAK_MILESTONE = "streak_milestone"
WEEKLY_CHALLENGE = "weekly_challenge"


@dataclass(frozen=True)
class PointRule:
    kind: str
    label: str
    points: int
    note: str


# One table, served to the interface, so no component carries its own copy of a
# number that could quietly disagree with the one the server adds up.
POINT_RULES: dict[str, PointRule] = {
    rule.kind: rule
    for rule in (
        PointRule(LESSON, "Video lesson watched", 10, "Once per lesson"),
        PointRule(PROMPT, "In-video question answered", 2, "First answer to each question"),
        PointRule(CHECKPOINT_SAT, "Course assessment sat", 15, "First sitting of each assessment"),
        PointRule(CHECKPOINT_PASSED, "Course assessment passed", 10, "First pass of each assessment"),
        PointRule(ASSESSMENT_SAT, "Competency assessment sat", 20, "Once per competency per day"),
        PointRule(ASSESSMENT_PASSED, "Competency assessment passed", 10, "Once per competency per day"),
        PointRule(ASSESSMENT_RECORD, "Assessment on record", 20, "Earlier recorded assessments"),
        PointRule(COURSE_COMPLETED, "Course completed", 30, "Every video watched, every assessment passed"),
        PointRule(DAILY_GOAL, "Daily goal met", 10, "Bonus, once a day"),
        PointRule(WEEKLY_GOAL, "Weekly goal met", 50, "Bonus, once a week"),
        PointRule(STREAK_MILESTONE, "Streak milestone", 25, "Bonus at 7, 14, 21 days and on"),
        PointRule(WEEKLY_CHALLENGE, "Weekly challenge completed", 50, "Bonus, once a week"),
    )
}

STREAK_MILESTONE_DAYS = 7
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
# Minutes a study day is assumed to take when an officer has no unwatched video
# to measure one against. Ten is the default lesson length in the curriculum.
DEFAULT_SESSION_MINUTES = 10


def points(kind: str) -> int:
    return POINT_RULES[kind].points


# --- dates ------------------------------------------------------------------
def _naive(value: datetime | None) -> datetime | None:
    """Stored timestamps are naive UTC (SQLite drops the zone); compare in kind."""
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _utc(now: datetime | None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now if now.tzinfo else now.replace(tzinfo=timezone.utc)


# --- goals ------------------------------------------------------------------
@dataclass(frozen=True)
class GoalSetting:
    weekly_days_target: int
    daily_points_target: int
    # None when this is the platform default rather than a choice the officer made.
    effective_from: date | None = None


DEFAULT_GOAL = GoalSetting(DEFAULT_WEEKLY_DAYS, DEFAULT_DAILY_POINTS)


class Goals:
    """An officer's goal history, answering "what was the goal that week"."""

    def __init__(self, rows: list[LearningGoal]):
        self.rows = sorted(rows, key=lambda r: r.effective_from)

    def for_week(self, start: date) -> GoalSetting:
        current = DEFAULT_GOAL
        for row in self.rows:
            if row.effective_from > start:
                break
            current = GoalSetting(
                row.weekly_days_target, row.daily_points_target, row.effective_from
            )
        return current

    def for_day(self, day: date) -> GoalSetting:
        return self.for_week(week_start(day))

    def pending_after(self, start: date) -> GoalSetting | None:
        """A change the officer asked for that has not started yet."""
        for row in self.rows:
            if row.effective_from > start:
                return GoalSetting(
                    row.weekly_days_target, row.daily_points_target, row.effective_from
                )
        return None


def set_learning_goal(
    db: Session,
    user_id: str,
    weekly_days_target: int,
    daily_points_target: int,
    now: datetime | None = None,
) -> GoalSetting:
    """Record a new goal, and decide when it takes effect.

    A goal raised takes effect this week: asking more of yourself mid-week can
    only make this week's goal harder to meet. A goal lowered waits for Monday,
    because otherwise it could be lowered on a Sunday afternoon to collect a
    weekly bonus the week did not earn. Either way, past weeks keep the goal
    that was in force while they happened.
    """
    today = _naive(_utc(now)).date()
    this_week = week_start(today)
    rows = list(
        db.scalars(select(LearningGoal).where(LearningGoal.user_id == user_id)).all()
    )
    current = Goals(rows).for_week(this_week)

    # A newer choice replaces any change still waiting to start. Flushed before
    # anything is written, so a replacement for the same Monday does not collide
    # with the row it replaces on the (officer, week) constraint.
    pending = [row for row in rows if row.effective_from > this_week]
    for row in pending:
        db.delete(row)
    if pending:
        db.flush()
    rows = [row for row in rows if row.effective_from <= this_week]

    unchanged = (
        weekly_days_target == current.weekly_days_target
        and daily_points_target == current.daily_points_target
    )
    # A first choice is recorded even when it matches the platform default: an
    # officer who picks three days has set a target, where one on the default
    # has not, and the interface asks only the second to set one.
    if unchanged and current.effective_from is not None:
        db.commit()
        return current

    lowered = (
        weekly_days_target < current.weekly_days_target
        or daily_points_target < current.daily_points_target
    )
    effective_from = this_week + timedelta(days=7) if lowered else this_week

    row = next((r for r in rows if r.effective_from == effective_from), None)
    if row is None:
        row = LearningGoal(user_id=user_id, effective_from=effective_from)
        db.add(row)
    row.weekly_days_target = weekly_days_target
    row.daily_points_target = daily_points_target
    row.created_at = datetime.now(timezone.utc)
    db.commit()
    return GoalSetting(weekly_days_target, daily_points_target, effective_from)


# --- the ledger -------------------------------------------------------------
@dataclass
class LedgerEntry:
    at: datetime
    kind: str
    points: int
    label: str
    competency_id: str | None = None
    course_identifier: str | None = None
    bonus: bool = False

    @property
    def day(self) -> date:
        return self.at.date()


@dataclass
class _LessonRow:
    at: datetime
    lesson_id: int
    title: str
    course_identifier: str
    duration_min: int = 0


@dataclass
class _Record:
    """Everything one officer did up to the end of `today`, loaded once."""

    lessons: list[_LessonRow]
    attempts: list[CheckpointAttempt]
    results: list[AssessmentResult]
    answers: list[VideoPromptAnswer]
    enrolments: list[Enrolment]


@dataclass
class _State:
    record: _Record
    earning: list[LedgerEntry]
    bonuses: list[LedgerEntry]
    # Day -> number of things done, on exactly the study calendar's definition.
    active: dict[date, int]
    # Day -> the first moment anything was done on it.
    first_at: dict[date, datetime]
    goals: Goals

    @property
    def entries(self) -> list[LedgerEntry]:
        return sorted(self.earning + self.bonuses, key=lambda e: (e.at, e.bonus))


def _load(db: Session, user_id: str, today: date) -> _Record:
    """Read the event tables. Anything dated after today is not history yet.

    The cut-off is the end of `today`, the same as the study calendar: it drops
    a seeded lesson spread past the date the seed ran, so a points total cannot
    include something the calendar does not show.
    """

    def upto(value: datetime | None) -> bool:
        value = _naive(value)
        return value is not None and value.date() <= today

    lessons = [
        _LessonRow(
            _naive(progress.completed_at),
            progress.lesson_id,
            title,
            progress.course_identifier,
            duration or 0,
        )
        for progress, title, duration in db.execute(
            select(LessonProgress, Lesson.title, Lesson.duration_min)
            .join(Lesson, Lesson.id == LessonProgress.lesson_id)
            .where(LessonProgress.user_id == user_id)
            .order_by(LessonProgress.completed_at, LessonProgress.id)
        ).all()
        if upto(progress.completed_at)
    ]
    attempts = [
        a
        for a in db.scalars(
            select(CheckpointAttempt)
            .where(CheckpointAttempt.user_id == user_id)
            .order_by(CheckpointAttempt.id)
        ).all()
        if upto(a.created_at)
    ]
    results = [
        r
        for r in db.scalars(
            select(AssessmentResult)
            .where(AssessmentResult.user_id == user_id)
            .order_by(AssessmentResult.id)
        ).all()
        if upto(r.created_at)
    ]
    answers = [
        a
        for a in db.scalars(
            select(VideoPromptAnswer)
            .where(VideoPromptAnswer.user_id == user_id)
            .order_by(VideoPromptAnswer.id)
        ).all()
        if upto(a.answered_at)
    ]
    enrolments = list(
        db.scalars(
            select(Enrolment)
            .where(Enrolment.user_id == user_id)
            .order_by(Enrolment.enrolled_at)
        ).all()
    )
    return _Record(lessons, attempts, results, answers, enrolments)


@dataclass
class _Names:
    topics: dict[str, Topic] = field(default_factory=dict)
    competencies: dict[str, str] = field(default_factory=dict)

    def competency_of_topic(self, topic_id: str) -> str | None:
        topic = self.topics.get(topic_id)
        return topic.competency_id if topic else None

    def competency_name(self, competency_id: str | None) -> str:
        if not competency_id:
            return "a competency"
        return self.competencies.get(competency_id, competency_id)


def _names(db: Session) -> _Names:
    return _Names(
        topics={t.id: t for t in db.scalars(select(Topic)).all()},
        competencies={c.id: c.name for c in db.scalars(select(Competency)).all()},
    )


def _earning_entries(record: _Record, names: _Names, today: date) -> list[LedgerEntry]:
    course_names = {e.course_identifier: e.course_name for e in record.enrolments}
    entries: list[LedgerEntry] = []

    for row in record.lessons:
        entries.append(
            LedgerEntry(
                row.at,
                LESSON,
                points(LESSON),
                f"Watched {row.title}",
                course_identifier=row.course_identifier,
            )
        )

    sat_checkpoints: set[int] = set()
    passed_checkpoints: set[int] = set()
    sat_competency_days: set[tuple[str, date]] = set()
    passed_competency_days: set[tuple[str, date]] = set()
    for attempt in record.attempts:
        at = _naive(attempt.created_at)
        competency_id = names.competency_of_topic(attempt.topic_id)
        if attempt.course_identifier == SELF_ASSESSMENT_COURSE:
            key = (competency_id or attempt.topic_id, at.date())
            name = names.competency_name(competency_id)
            if key not in sat_competency_days:
                sat_competency_days.add(key)
                entries.append(
                    LedgerEntry(
                        at,
                        ASSESSMENT_SAT,
                        points(ASSESSMENT_SAT),
                        f"Sat the {name} assessment",
                        competency_id=competency_id,
                    )
                )
            if attempt.passed and key not in passed_competency_days:
                passed_competency_days.add(key)
                entries.append(
                    LedgerEntry(
                        at,
                        ASSESSMENT_PASSED,
                        points(ASSESSMENT_PASSED),
                        f"Passed the {name} assessment",
                        competency_id=competency_id,
                    )
                )
            continue

        course = course_names.get(attempt.course_identifier) or "a course"
        if attempt.checkpoint_id not in sat_checkpoints:
            sat_checkpoints.add(attempt.checkpoint_id)
            entries.append(
                LedgerEntry(
                    at,
                    CHECKPOINT_SAT,
                    points(CHECKPOINT_SAT),
                    f"Sat the assessment in {course}",
                    competency_id=competency_id,
                    course_identifier=attempt.course_identifier,
                )
            )
        if attempt.passed and attempt.checkpoint_id not in passed_checkpoints:
            passed_checkpoints.add(attempt.checkpoint_id)
            entries.append(
                LedgerEntry(
                    at,
                    CHECKPOINT_PASSED,
                    points(CHECKPOINT_PASSED),
                    f"Passed the assessment in {course}",
                    competency_id=competency_id,
                    course_identifier=attempt.course_identifier,
                )
            )

    for result in record.results:
        entries.append(
            LedgerEntry(
                _naive(result.created_at),
                ASSESSMENT_RECORD,
                points(ASSESSMENT_RECORD),
                f"{names.competency_name(result.competency_id)} assessment on record",
                competency_id=result.competency_id,
            )
        )

    answered: set[int] = set()
    for answer in record.answers:
        if answer.prompt_id in answered:
            continue
        answered.add(answer.prompt_id)
        entries.append(
            LedgerEntry(
                _naive(answer.answered_at),
                PROMPT,
                points(PROMPT),
                "Answered an in-video question",
            )
        )

    for enrolment in record.enrolments:
        finished = _naive(enrolment.completed_at)
        if finished is None or finished.date() > today:
            continue
        entries.append(
            LedgerEntry(
                finished,
                COURSE_COMPLETED,
                points(COURSE_COMPLETED),
                f"Completed {enrolment.course_name or 'a course'}",
                course_identifier=enrolment.course_identifier,
            )
        )

    entries.sort(key=lambda e: e.at)
    return entries


def _active_days(record: _Record) -> tuple[dict[date, int], dict[date, datetime]]:
    """Days anything was done, on the study calendar's own definition.

    Every row counts here, repeats included - a second sitting earns no points
    but it is still a day the officer turned up, and that is what a streak and a
    weekly goal of study days measure.
    """
    counts: dict[date, int] = defaultdict(int)
    first_at: dict[date, datetime] = {}
    stamps = (
        [row.at for row in record.lessons]
        + [_naive(a.created_at) for a in record.attempts]
        + [_naive(r.created_at) for r in record.results]
        + [_naive(a.answered_at) for a in record.answers]
    )
    for stamp in stamps:
        if stamp is None:
            continue
        day = stamp.date()
        counts[day] += 1
        if day not in first_at or stamp < first_at[day]:
            first_at[day] = stamp
    return dict(counts), first_at


# --- the weekly challenge ---------------------------------------------------
@dataclass(frozen=True)
class Challenge:
    id: str
    title: str
    detail: str
    target: int
    unit: str


CHALLENGES: tuple[Challenge, ...] = (
    Challenge(
        "assess_two",
        "Measure two competencies",
        "Sit assessments on two different competencies this week. Measurement is "
        "what turns a level you reported into a level on record.",
        2,
        "competencies",
    ),
    Challenge(
        "watch_five",
        "Watch five course videos",
        "Watch five videos across your courses this week.",
        5,
        "videos",
    ),
    Challenge(
        "earn_150",
        "Earn 150 Learning Points",
        "Earn 150 points from learning this week. Bonuses do not count towards it.",
        150,
        "points",
    ),
)


def challenge_for(start: date) -> Challenge:
    """Rotates by ISO week, so everyone in the cadre faces the same challenge."""
    iso_year, iso_week, _ = start.isocalendar()
    return CHALLENGES[(iso_year * 53 + iso_week) % len(CHALLENGES)]


def _challenge_progress(
    challenge: Challenge,
    start: date,
    end: date,
    record: _Record,
    earning: list[LedgerEntry],
    names: _Names,
) -> tuple[int, datetime | None]:
    """How far into this week's challenge the officer got, and when they finished."""

    def in_week(stamp: datetime | None) -> bool:
        return stamp is not None and start <= stamp.date() <= end

    if challenge.id == "watch_five":
        stamps = sorted(row.at for row in record.lessons if in_week(row.at))
        done_at = stamps[challenge.target - 1] if len(stamps) >= challenge.target else None
        return len(stamps), done_at

    if challenge.id == "earn_150":
        running, done_at = 0, None
        for entry in earning:
            if not in_week(entry.at):
                continue
            running += entry.points
            if done_at is None and running >= challenge.target:
                done_at = entry.at
        return running, done_at

    # assess_two: distinct competencies with a sitting, course or self-assessment.
    seen: list[str] = []
    done_at = None
    for attempt in sorted(record.attempts, key=lambda a: _naive(a.created_at)):
        at = _naive(attempt.created_at)
        if not in_week(at):
            continue
        competency = names.competency_of_topic(attempt.topic_id) or attempt.topic_id
        if competency not in seen:
            seen.append(competency)
            if done_at is None and len(seen) >= challenge.target:
                done_at = at
    return len(seen), done_at


def _bonus_entries(
    record: _Record,
    earning: list[LedgerEntry],
    active_first_at: dict[date, datetime],
    goals: Goals,
    names: _Names,
    today: date,
) -> list[LedgerEntry]:
    bonuses: list[LedgerEntry] = []

    # Daily goal: the moment the day's learning points first reach its target.
    by_day: dict[date, list[LedgerEntry]] = defaultdict(list)
    for entry in earning:
        by_day[entry.day].append(entry)
    for day, items in by_day.items():
        target = goals.for_day(day).daily_points_target
        running = 0
        for entry in sorted(items, key=lambda e: e.at):
            running += entry.points
            if running >= target:
                bonuses.append(
                    LedgerEntry(entry.at, DAILY_GOAL, points(DAILY_GOAL), "Daily goal met", bonus=True)
                )
                break

    # Weekly goal: the study day that reached the week's target.
    days_by_week: dict[date, list[date]] = defaultdict(list)
    for day in sorted(active_first_at):
        days_by_week[week_start(day)].append(day)
    for start, days in days_by_week.items():
        target = goals.for_week(start).weekly_days_target
        if len(days) >= target:
            reached = days[target - 1]
            bonuses.append(
                LedgerEntry(
                    active_first_at[reached],
                    WEEKLY_GOAL,
                    points(WEEKLY_GOAL),
                    "Weekly goal met",
                    bonus=True,
                )
            )

    # Streak milestones: every seventh consecutive study day.
    run, previous = 0, None
    for day in sorted(active_first_at):
        run = run + 1 if previous is not None and day - previous == timedelta(days=1) else 1
        previous = day
        if run % STREAK_MILESTONE_DAYS == 0:
            bonuses.append(
                LedgerEntry(
                    active_first_at[day],
                    STREAK_MILESTONE,
                    points(STREAK_MILESTONE),
                    f"{run}-day streak",
                    bonus=True,
                )
            )

    # Weekly challenge, for every week anything happened in.
    for start in days_by_week:
        challenge = challenge_for(start)
        _, done_at = _challenge_progress(
            challenge, start, min(start + timedelta(days=6), today), record, earning, names
        )
        if done_at is not None:
            bonuses.append(
                LedgerEntry(
                    done_at,
                    WEEKLY_CHALLENGE,
                    points(WEEKLY_CHALLENGE),
                    f"Weekly challenge: {challenge.title}",
                    bonus=True,
                )
            )

    return bonuses


def _build(db: Session, user_id: str, today: date, names: _Names | None = None) -> _State:
    names = names or _names(db)
    record = _load(db, user_id, today)
    goals = Goals(
        list(db.scalars(select(LearningGoal).where(LearningGoal.user_id == user_id)).all())
    )
    earning = _earning_entries(record, names, today)
    active, first_at = _active_days(record)
    bonuses = _bonus_entries(record, earning, first_at, goals, names, today)
    return _State(record, earning, bonuses, active, first_at, goals)


def ledger(db: Session, user_id: str, now: datetime | None = None) -> list[LedgerEntry]:
    """Every point this officer has earned, oldest first, with what earned it."""
    if db.get(User, user_id) is None:
        raise KeyError(f"Unknown user: {user_id}")
    today = _naive(_utc(now)).date()
    return _build(db, user_id, today).entries


# --- course state, shared by quests and the next best action ---------------
def _course_states(
    db: Session, user_id: str, record: _Record, client, now: datetime
) -> list[dict]:
    last_studied: dict[str, datetime] = {}
    for row in record.lessons:
        if row.course_identifier not in last_studied or row.at > last_studied[row.course_identifier]:
            last_studied[row.course_identifier] = row.at

    states = []
    for enrolment in record.enrolments:
        progress = course_progress(db, user_id, enrolment.course_identifier)
        status = derive_status(enrolment, progress, now)
        catalogue = client.read_course(enrolment.course_identifier) if client else None
        lessons = [lesson for module in progress["modules"] for lesson in module["lessons"]]
        states.append(
            {
                "identifier": enrolment.course_identifier,
                "name": enrolment.course_name or (catalogue.name if catalogue else enrolment.course_identifier),
                "catalogue": catalogue,
                "competency_ids": list(catalogue.competency_ids) if catalogue else [],
                "status": status,
                "progress": progress,
                "next_action": next_action(progress, status),
                "lessons": {lesson["id"]: lesson for lesson in lessons},
                "unwatched_minutes": [l["duration_min"] for l in lessons if not l["completed"]],
                "last_studied_at": last_studied.get(enrolment.course_identifier),
                "enrolled_at": _naive(enrolment.enrolled_at),
            }
        )
    return states


def current_course(courses: list[dict]) -> dict | None:
    """The course in hand: the one to pick up where the officer left off.

    Started before not started, then most recently studied - the way every large
    learning platform resumes, because the course somebody was in the middle of
    yesterday is the one they can re-enter fastest today. The dashboard's
    continue card and the day's learning quest both name this course, so the
    page never sends an officer two ways at once.
    """
    candidates = [
        c
        for c in courses
        if c["status"] in (IN_PROGRESS, NOT_STARTED) and c["next_action"] is not None
    ]
    if not candidates:
        return None

    def order(course: dict):
        studied = course["last_studied_at"] or course["enrolled_at"]
        return (
            0 if course["status"] == IN_PROGRESS else 1,
            -studied.timestamp() if studied else 0,
            course["name"],
        )

    return sorted(candidates, key=order)[0]


def _bank_competencies(db: Session) -> set[str]:
    """Competencies the question bank can actually assess."""
    return {
        competency_id
        for (competency_id,) in db.execute(
            select(Topic.competency_id)
            .join(BankQuestion, BankQuestion.topic_id == Topic.id)
            .distinct()
        ).all()
    }


def _level(level: int) -> str:
    return PROFICIENCY_LABELS.get(level, str(level))


def _evidence_phrase(item) -> str:
    if item.evidence == "self_reported":
        return "self-reported and has never been measured"
    if item.evidence == "unmeasured":
        return "not on record at all"
    if item.evidence == "provisional":
        return (
            f"provisional - the evidence spans {_level(item.level_low)} to "
            f"{_level(item.level_high)}"
        )
    return f"measured from {item.questions_answered} answers"


# --- quests -----------------------------------------------------------------
def _learn_quest(record: _Record, courses: list[dict], open_gaps: list, today: date) -> dict:
    """Progress in the course in hand: its next video, or its assessment.

    Done by a video watched today or by a sitting of a course assessment today -
    both are the course moving. A competency assessment is the measure quest's,
    so one sitting never ticks two quests.
    """
    watched_today = [row for row in record.lessons if row.at.date() == today]
    if watched_today:
        last = watched_today[-1]
        return {
            "id": "learn",
            "kind": "learn",
            "title": f"Watched {last.title}",
            "detail": "A video today. It counts towards your streak and your weekly goal.",
            "points": points(LESSON),
            "done": True,
            "cta": None,
        }
    course_names = {e.course_identifier: e.course_name for e in record.enrolments}
    sat_course_today = [
        a
        for a in record.attempts
        if _naive(a.created_at).date() == today and a.course_identifier != SELF_ASSESSMENT_COURSE
    ]
    if sat_course_today:
        course_name = course_names.get(sat_course_today[-1].course_identifier) or "a course"
        return {
            "id": "learn",
            "kind": "learn",
            "title": f"Sat the assessment in {course_name}",
            "detail": "Course progress today. It counts towards your streak and your weekly goal.",
            "points": points(CHECKPOINT_SAT),
            "done": True,
            "cta": None,
        }

    names = {gap.competency_id: gap.competency_name for gap in open_gaps}
    # The same course the continue card names, whatever its next step is.
    course = current_course(courses)
    if course is not None and course["next_action"]["kind"] == "checkpoint":
        return {
            "id": "learn",
            "kind": "learn",
            "title": f"Take the assessment in {course['name']}",
            "detail": "Every video before it is watched, so it is open. Passing it moves the course on.",
            "points": points(CHECKPOINT_SAT),
            "done": False,
            "cta": {"kind": "course", "course_identifier": course["identifier"]},
        }
    if course is not None:
        lesson = course["lessons"].get(course["next_action"]["lesson_id"], {})
        builds = next((names[cid] for cid in course["competency_ids"] if cid in names), None)
        detail = f"Next up: {course['next_action']['label']}"
        if lesson.get("duration_min"):
            detail += f" ({lesson['duration_min']} min)"
        if builds:
            detail += f". It builds {builds}, one of your open gaps."
        else:
            detail += "."
        return {
            "id": "learn",
            "kind": "learn",
            "title": f"Watch the next video in {course['name']}",
            "detail": detail,
            "points": points(LESSON),
            "done": False,
            "cta": {
                "kind": "course",
                "course_identifier": course["identifier"],
                "lesson_id": course["next_action"]["lesson_id"],
            },
        }

    if open_gaps:
        top = open_gaps[0]
        return {
            "id": "learn",
            "kind": "learn",
            "title": f"Start a course that builds {top.competency_name}",
            "detail": "Your recommended training lists courses matched to this gap. "
            "Enrol in one and watch its first video.",
            "points": points(LESSON),
            "done": False,
            "cta": {"kind": "recommendations", "competency_id": top.competency_id},
        }
    return {
        "id": "learn",
        "kind": "learn",
        "title": "Watch a video from your training",
        "detail": "Every requirement of your role is met, so this is for the step up.",
        "points": points(LESSON),
        "done": False,
        "cta": {"kind": "recommendations"},
    }


def _review_target(
    record: _Record, names: _Names, today: date, role_competencies: set[str]
) -> tuple[str, float, int] | None:
    """The weakest topic on record as it stood before today.

    Judged on yesterday's record deliberately. Judged live, sitting the quest's
    own topic would lift its accuracy, promote some other topic to "weakest",
    and un-tick the quest the officer had just completed.

    A topic under a competency the officer's role requires comes first: a weak
    spot in something the designation asks for matters more than one picked up
    on a course taken out of interest.
    """
    tally: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for attempt in record.attempts:
        if _naive(attempt.created_at).date() >= today:
            continue
        for item in attempt.items:
            topic_id = item.get("topic_id", attempt.topic_id)
            tally[topic_id][1] += 1
            tally[topic_id][0] += 1 if item.get("correct") else 0

    rows = [
        (round(100 * correct / total, 1), total, topic_id)
        for topic_id, (correct, total) in tally.items()
        if total and topic_id in names.topics
    ]
    rows = [row for row in rows if classify(row[0]) != "strong"]
    if not rows:
        return None
    accuracy, total, topic_id = sorted(
        rows,
        key=lambda r: (
            0 if names.competency_of_topic(r[2]) in role_competencies else 1,
            r[0],
            -r[1],
            r[2],
        ),
    )[0]
    return topic_id, accuracy, total


def _measure_and_review_quests(
    record: _Record,
    report,
    names: _Names,
    bank: set[str],
    today: date,
) -> list[dict]:
    sat_today = [a for a in record.attempts if _naive(a.created_at).date() == today]
    # Measuring is a competency assessment; a course assessment is the learn
    # quest's progress. Revisiting a topic can happen in either.
    measured_today = [a for a in sat_today if a.course_identifier == SELF_ASSESSMENT_COURSE]
    review = _review_target(
        record, names, today, {item.competency_id for item in report.items}
    )
    review_competency = names.competency_of_topic(review[0]) if review else None

    # --- measure --------------------------------------------------------
    if measured_today:
        last = measured_today[-1]
        competency = names.competency_name(names.competency_of_topic(last.topic_id))
        measure = {
            "id": "measure",
            "kind": "measure",
            "title": f"Sat the {competency} assessment",
            "detail": "Every answer is on record now, whatever the score.",
            "points": points(ASSESSMENT_SAT),
            "done": True,
            "cta": None,
        }
    else:
        assessable = [i for i in report.items if i.competency_id in bank]
        ordered = (
            [i for i in assessable if i.recommended_action == "assess"]
            + [i for i in assessable if i.recommended_action == "train"]
            + [i for i in assessable if i.recommended_action == "maintain" and i.evidence != "measured"]
        )
        # Where there is a choice, measure something other than the review
        # quest's topic, so the day's quests point at two different things.
        preferred = [i for i in ordered if i.competency_id != review_competency] or ordered
        if preferred:
            item = preferred[0]
            if item.evidence in ("self_reported", "unmeasured"):
                detail = (
                    f"Your {item.competency_name} level is {_evidence_phrase(item)}, and your "
                    f"role needs {_level(item.target_level)}. A sitting replaces the estimate "
                    "with a measurement."
                )
            elif item.evidence == "provisional":
                detail = (
                    f"The evidence is {_evidence_phrase(item)}. Another sitting narrows it "
                    "to a level you can act on."
                )
            else:
                detail = (
                    f"Measured at {_level(item.attained_level)}; your role needs "
                    f"{_level(item.target_level)}. Re-sitting shows what your training has moved."
                )
            measure = {
                "id": "measure",
                "kind": "measure",
                "title": f"Measure {item.competency_name}",
                "detail": detail,
                "points": points(ASSESSMENT_SAT),
                "done": False,
                "cta": {"kind": "assessment", "competency_id": item.competency_id},
            }
        else:
            measure = None

    # --- review ---------------------------------------------------------
    if review:
        topic_id, accuracy, total = review
        topic = names.topics[topic_id]
        revisited = any(
            item.get("topic_id", attempt.topic_id) == topic_id
            for attempt in sat_today
            for item in attempt.items
        )
        quest = {
            "id": "review",
            "kind": "review",
            "title": f"Revisited {topic.name}" if revisited else f"Revisit {topic.name}",
            # Named with its competency as well: some topics written from course
            # videos carry a module's name ("Videos 1-5"), which alone says little.
            "detail": (
                f"{names.competency_name(topic.competency_id)}. Answered questions on it "
                "today, and the topic record now counts them."
                if revisited
                else f"{names.competency_name(topic.competency_id)}: {accuracy:g}% across "
                f"{total} answers, the weakest topic on your record. Its competency "
                "assessment draws on it."
            ),
            "points": points(ASSESSMENT_SAT),
            "done": revisited,
            "cta": None if revisited else {"kind": "assessment", "competency_id": topic.competency_id},
        }
    else:
        answered = len({a.prompt_id for a in record.answers if _naive(a.answered_at).date() == today})
        quest = {
            "id": "review",
            "kind": "review",
            "title": "Answer 3 in-video questions",
            "detail": f"{min(answered, 3)} of 3 today. They pause a video to check what was just said.",
            "points": 3 * points(PROMPT),
            "done": answered >= 3,
            "cta": None if answered >= 3 else {"kind": "courses"},
        }

    return [q for q in (measure, quest) if q is not None]


# --- achievements -----------------------------------------------------------
def _achievement(
    id: str, title: str, description: str, progress: int, target: int, unlocked_on: date | None
) -> dict:
    unlocked = progress >= target
    return {
        "id": id,
        "title": title,
        "description": description,
        "unlocked": unlocked,
        "progress": min(progress, target),
        "target": target,
        "unlocked_on": unlocked_on if unlocked else None,
    }


def _achievements(
    state: _State,
    report,
    courses: list[dict],
    stored_levels: dict[str, int],
    longest_streak: int,
    this_week_active: int,
    this_week_target: int,
) -> list[dict]:
    record = state.record
    entries = state.entries

    sittings = sorted(
        [_naive(a.created_at) for a in record.attempts] + [_naive(r.created_at) for r in record.results]
    )

    improved_by_history = sorted(
        _naive(r.created_at) for r in record.results if r.new_level > r.prior_level
    )
    improved_now = [
        item
        for item in report.items
        if item.evidence == "measured"
        and item.attained_level > stored_levels.get(item.competency_id, 0)
    ]

    completions = sorted(
        _naive(e.completed_at) for e in record.enrolments if e.completed_at is not None
    )

    modules_done = sum(
        1
        for course in courses
        for module in course["progress"]["modules"]
        if module["lessons_total"] > 0
        and module["lessons_completed"] == module["lessons_total"]
        and (module["checkpoint_id"] is None or module["checkpoint_passed"])
    )

    def first(kind: str) -> date | None:
        return next((e.day for e in entries if e.kind == kind), None)

    # Record order is completion order, so the twenty-fifth video is the day it was earned.
    videos = record.lessons
    VIDEO_MILESTONE = 25

    return [
        _achievement(
            "first_assessment",
            "First measurement",
            "Sat an assessment. Measured evidence starts here.",
            len(sittings),
            1,
            sittings[0].date() if sittings else None,
        ),
        _achievement(
            "evidence_backed",
            "Evidence-backed",
            "Have a competency level established by measurement, not self-report.",
            report.measured_competencies,
            1,
            None,
        ),
        _achievement(
            "level_up",
            "Level up",
            # Worded for what both sources actually show: a level raised on an
            # assessment on record, or a measured level above the starting one.
            # Not "measured" - a recorded assessment is not necessarily measurement
            # in the gap engine's sense, and the profile says which levels are.
            "Raise a competency level on a recorded assessment.",
            1 if (improved_by_history or improved_now) else 0,
            1,
            improved_by_history[0].date() if improved_by_history else None,
        ),
        _achievement(
            "first_course",
            "Course complete",
            "Finish a course: every video watched and every assessment passed.",
            len(completions),
            1,
            completions[0].date() if completions else None,
        ),
        _achievement(
            "five_modules",
            "Five modules",
            "Complete five course modules.",
            modules_done,
            5,
            None,
        ),
        _achievement(
            "streak_7",
            "Seven-day streak",
            "Study on seven consecutive days.",
            longest_streak,
            STREAK_MILESTONE_DAYS,
            first(STREAK_MILESTONE),
        ),
        _achievement(
            "week_on_target",
            "Week on target",
            "Meet your weekly goal.",
            this_week_target if first(WEEKLY_GOAL) else this_week_active,
            this_week_target,
            first(WEEKLY_GOAL),
        ),
        # A milestone in learning rather than in points: the points are the
        # engine's way of weighing effort, not something to collect.
        _achievement(
            "videos_25",
            "Twenty-five videos",
            "Watch twenty-five course videos to the end.",
            len(videos),
            VIDEO_MILESTONE,
            videos[VIDEO_MILESTONE - 1].at.date() if len(videos) >= VIDEO_MILESTONE else None,
        ),
    ]


# --- the officer's view -----------------------------------------------------
def _week_points(state: _State, start: date, today: date) -> int:
    return sum(e.points for e in state.entries if start <= e.day <= today)


def _cohort(db: Session, user: User, today: date, mine: int, names: _Names) -> dict:
    """Where this officer stands in their department this week - without names.

    The officer screens only ever show an officer's own record, and they sit
    behind a profile choice rather than a password. So colleagues appear here
    as a count and a rank, never as people.
    """
    start = week_start(today)
    colleagues = [
        u.id
        for u in db.scalars(select(User).where(User.department == user.department)).all()
        if u.id != user.id
    ]
    theirs = [_week_points(_build(db, uid, today, names), start, today) for uid in colleagues]
    return {
        "department": user.department,
        "rank": 1 + sum(1 for p in theirs if p > mine),
        "of": len(colleagues) + 1,
        "points_this_week": mine,
        "colleagues_studying": sum(1 for p in theirs if p > 0),
    }


def _suggestion(remaining: int) -> str:
    if remaining <= 0:
        return "Goal met. Anything more today is extra."
    videos = math.ceil(remaining / points(LESSON))
    text = f"Watch {videos} more video{'s' if videos != 1 else ''}"
    if remaining <= points(ASSESSMENT_SAT):
        text += " or sit one competency assessment"
    return text + "."


def momentum(
    db: Session, user_id: str, now: datetime | None = None, client=None
) -> dict:
    """Everything the dashboard needs to say how this week is going."""
    user = db.get(User, user_id)
    if user is None:
        raise KeyError(f"Unknown user: {user_id}")

    now = _utc(now)
    today = _naive(now).date()
    start = week_start(today)
    names = _names(db)
    state = _build(db, user_id, today, names)
    entries = state.entries

    report = compute_gaps(db, user_id)
    courses = _course_states(db, user_id, state.record, client, now)
    bank = _bank_competencies(db)
    calendar = activity(db, user_id, today=today)
    studied_today = bool(calendar.days) and calendar.days[-1].count > 0

    goal = state.goals.for_week(start)
    pending = state.goals.pending_after(start)

    # --- today ------------------------------------------------------------
    earned_today = sum(e.points for e in state.earning if e.day == today)
    target_today = goal.daily_points_target
    daily = {
        "target": target_today,
        "earned": earned_today,
        "pct": min(100, round(100 * earned_today / target_today)) if target_today else 100,
        "met": earned_today >= target_today,
        "remaining": max(0, target_today - earned_today),
        "suggestion": _suggestion(target_today - earned_today),
    }

    # --- this week --------------------------------------------------------
    earning_by_day: dict[date, int] = defaultdict(int)
    for entry in state.earning:
        earning_by_day[entry.day] += entry.points
    days = []
    for offset in range(7):
        day = start + timedelta(days=offset)
        days.append(
            {
                "day": day,
                "weekday": WEEKDAYS[offset],
                "active": state.active.get(day, 0) > 0 and day <= today,
                "points": earning_by_day.get(day, 0),
                "goal_met": earning_by_day.get(day, 0) >= state.goals.for_day(day).daily_points_target,
                "is_today": day == today,
                "is_future": day > today,
            }
        )
    active_days = sum(1 for d in days if d["active"])
    remaining_days = max(0, goal.weekly_days_target - active_days)
    # Days still open to study on, counting today only if nothing is done yet.
    days_left = (6 - today.weekday()) + (0 if studied_today else 1)
    unwatched = [
        minutes
        for course in courses
        if course["status"] in (IN_PROGRESS, NOT_STARTED)
        for minutes in course["unwatched_minutes"]
    ]
    session = round(sum(unwatched) / len(unwatched)) if unwatched else DEFAULT_SESSION_MINUTES
    weekly = {
        "week_start": start,
        "week_end": start + timedelta(days=6),
        "days": days,
        "active_days": active_days,
        "target": goal.weekly_days_target,
        "pct": min(100, round(100 * active_days / goal.weekly_days_target)),
        "met": active_days >= goal.weekly_days_target,
        "remaining_days": remaining_days,
        "days_left": days_left,
        "on_track": remaining_days <= days_left,
        "effort_remaining_min": remaining_days * max(1, session),
        "points": _week_points(state, start, today),
        # The week in plain terms, for an interface that would rather not talk in
        # points: things done, and the running time of the videos watched.
        "items_completed": sum(n for d, n in state.active.items() if start <= d <= today),
        "minutes_learned": sum(
            row.duration_min for row in state.record.lessons if start <= row.at.date() <= today
        ),
    }

    # --- streak -----------------------------------------------------------
    current = calendar.current_streak
    streak = {
        "current": current,
        "longest": calendar.longest_streak,
        "studied_today": studied_today,
        "at_risk": current > 0 and not studied_today,
        "next_milestone": (current // STREAK_MILESTONE_DAYS + 1) * STREAK_MILESTONE_DAYS,
    }

    # --- quests and the challenge ------------------------------------------
    open_gaps = [item for item in report.items if item.gap > 0]
    quests = [_learn_quest(state.record, courses, open_gaps, today)] + _measure_and_review_quests(
        state.record, report, names, bank, today
    )

    challenge = challenge_for(start)
    progress, done_at = _challenge_progress(
        challenge, start, today, state.record, state.earning, names
    )
    weekly_challenge = {
        "id": challenge.id,
        "title": challenge.title,
        "detail": challenge.detail,
        "progress": min(progress, challenge.target),
        "target": challenge.target,
        "unit": challenge.unit,
        "reward": points(WEEKLY_CHALLENGE),
        "done": done_at is not None,
    }

    stored_levels = {
        uc.competency_id: uc.attained_level
        for uc in db.scalars(select(UserCompetency).where(UserCompetency.user_id == user_id)).all()
    }
    # The longest streak over the whole record, not only the calendar's year,
    # so an achievement once earned is not lost when the year rolls past it.
    all_time_longest = calendar.longest_streak
    run, previous = 0, None
    for day in sorted(state.active):
        if day > today:
            continue
        run = run + 1 if previous is not None and day - previous == timedelta(days=1) else 1
        previous = day
        all_time_longest = max(all_time_longest, run)

    achievements = _achievements(
        state,
        report,
        courses,
        stored_levels,
        all_time_longest,
        active_days,
        goal.weekly_days_target,
    )

    week_points = weekly["points"]
    return {
        "user_id": user_id,
        "generated_at": now,
        "today": today,
        "points": {
            "total": sum(e.points for e in entries),
            "today": sum(e.points for e in entries if e.day == today),
            "this_week": week_points,
        },
        "rules": [
            {"kind": r.kind, "label": r.label, "points": r.points, "note": r.note}
            for r in POINT_RULES.values()
        ],
        "recent": [
            {"at": e.at, "kind": e.kind, "label": e.label, "points": e.points, "bonus": e.bonus}
            for e in reversed(entries[-8:])
        ],
        "goal": _goal_out(goal),
        "pending_goal": _goal_out(pending) if pending else None,
        "daily_goal": daily,
        "weekly_goal": weekly,
        "streak": streak,
        "quests": quests,
        "weekly_challenge": weekly_challenge,
        "achievements": achievements,
        "cohort": _cohort(db, user, today, week_points, names),
    }


def _goal_out(goal: GoalSetting) -> dict:
    return {
        "weekly_days_target": goal.weekly_days_target,
        "daily_points_target": goal.daily_points_target,
        "effective_from": goal.effective_from,
    }


# --- the next best action ----------------------------------------------------
def _continue_learning(courses: list[dict], report, competency_names: dict[str, str]) -> dict | None:
    course = current_course(courses)
    if course is None:
        return None
    progress = course["progress"]
    action = course["next_action"]
    gaps = {i.competency_id: i.competency_name for i in report.items if i.gap > 0}
    lesson = course["lessons"].get(action.get("lesson_id")) if action["kind"] == "lesson" else None

    remaining_checkpoint_points = sum(
        (0 if module["attempts"] else points(CHECKPOINT_SAT)) + points(CHECKPOINT_PASSED)
        for module in progress["modules"]
        if module["checkpoint_id"] is not None and not module["checkpoint_passed"]
    )
    lessons_remaining = progress["lessons_total"] - progress["lessons_completed"]
    catalogue = course["catalogue"]
    return {
        "course_identifier": course["identifier"],
        "course_name": course["name"],
        "provider": catalogue.provider if catalogue else "iGOT Karmayogi",
        "status": course["status"],
        "progress_pct": progress["progress_pct"],
        "lessons_completed": progress["lessons_completed"],
        "lessons_total": progress["lessons_total"],
        "lessons_remaining": lessons_remaining,
        "minutes_remaining": sum(course["unwatched_minutes"]),
        "next_kind": action["kind"],
        "next_label": action["label"],
        "next_lesson_id": action.get("lesson_id"),
        "next_checkpoint_id": action.get("checkpoint_id"),
        "next_minutes": lesson["duration_min"] if lesson else None,
        "last_studied_on": course["last_studied_at"].date() if course["last_studied_at"] else None,
        "builds": [competency_names.get(cid, cid) for cid in course["competency_ids"]],
        "closes_gap": next((gaps[cid] for cid in course["competency_ids"] if cid in gaps), None),
        "points_available": lessons_remaining * points(LESSON)
        + remaining_checkpoint_points
        + points(COURSE_COMPLETED),
    }


def _course_out(course) -> dict:
    return course.model_dump() if hasattr(course, "model_dump") else dict(course)


def _best_action(db: Session, client, user_id: str, report, courses: list[dict], bank: set[str]) -> dict:
    open_gaps = [item for item in report.items if item.gap > 0]
    base = {
        "competency_id": None,
        "competency_name": None,
        "attained_level": None,
        "target_level": None,
        "evidence": None,
        "course": None,
        "enrolled": False,
        "course_progress_pct": None,
        "lesson_id": None,
    }

    recommendations = recommend_courses(client, report.items) if client and open_gaps else []
    for item in open_gaps:
        detail = {
            **base,
            "competency_id": item.competency_id,
            "competency_name": item.competency_name,
            "attained_level": item.attained_level,
            "target_level": item.target_level,
            "evidence": item.evidence,
        }
        shortfall = f"{_level(item.attained_level)}, where your role needs {_level(item.target_level)}"

        # The gap engine's own call: a shortfall nobody has measured is a guess,
        # and training booked on a guess may be training the officer never needed.
        if item.recommended_action == "assess" and item.competency_id in bank:
            return {
                **detail,
                "kind": "assess",
                "headline": f"Measure your {item.competency_name} before training for it",
                "reason": (
                    f"{item.competency_name} is the largest weighted gap for your role - "
                    f"{shortfall} - but that level is {_evidence_phrase(item)}. One sitting "
                    "shows where you actually stand, so no course is booked on a guess."
                ),
                "points": points(ASSESSMENT_SAT),
                "cta_label": "Take the assessment",
            }

        enrolled = [
            c
            for c in courses
            if item.competency_id in c["competency_ids"]
            and c["status"] in (IN_PROGRESS, NOT_STARTED)
            and c["next_action"] is not None
        ]
        if enrolled:
            course = sorted(enrolled, key=lambda c: 0 if c["status"] == IN_PROGRESS else 1)[0]
            action = course["next_action"]
            return {
                **detail,
                "kind": "continue",
                "headline": f"Keep going with {course['name']}",
                "reason": (
                    f"It builds {item.competency_name}, your largest weighted gap ({shortfall}, "
                    f"{_evidence_phrase(item)}). You are {course['progress']['progress_pct']}% "
                    f"through; next up is {action['label']}."
                ),
                "course": _course_out(course["catalogue"]) if course["catalogue"] else None,
                "enrolled": True,
                "course_progress_pct": course["progress"]["progress_pct"],
                "lesson_id": action.get("lesson_id"),
                "points": points(LESSON) if action["kind"] == "lesson" else points(CHECKPOINT_SAT),
                "cta_label": "Continue learning",
            }

        rec = next(
            (r for r in recommendations if r.primary_competency_id == item.competency_id), None
        ) or next(
            (r for r in recommendations if item.competency_id in r.covers_gap_competencies), None
        )
        if rec is not None:
            enrolled_ids = {c["identifier"] for c in courses}
            classroom = rec.course.source == "nssta"
            measured = item.evidence == "measured"
            why = (
                "It is measured, so training is the right next step."
                if measured
                else "No assessment covers it yet, so training is the route available."
            )
            return {
                **detail,
                "kind": "start",
                "headline": f"{'Request a place on' if classroom else 'Start'} {rec.course.name}",
                "reason": f"{rec.reason}. {why}",
                "course": rec.course.model_dump(),
                "enrolled": rec.course.identifier in enrolled_ids,
                "points": points(LESSON),
                "cta_label": "Request a place" if classroom else "Start training",
            }

    target_role, ahead = progression_gaps(db, user_id)
    if target_role is not None and ahead:
        item = ahead[0]
        recs = recommend_courses(client, ahead, limit=3) if client else []
        rec = recs[0] if recs else None
        return {
            **base,
            "kind": "progress",
            "competency_id": item.competency_id,
            "competency_name": item.competency_name,
            "attained_level": item.attained_level,
            "target_level": item.target_level,
            "evidence": item.evidence,
            "headline": f"Prepare for {target_role.name}",
            "reason": (
                "You meet every requirement of your designation. The step up to "
                f"{target_role.name} will also ask for {item.competency_name} at "
                f"{_level(item.target_level)}."
                + (f" {rec.course.name} is the closest match in the catalogue." if rec else "")
            ),
            "course": rec.course.model_dump() if rec else None,
            "enrolled": bool(rec) and rec.course.identifier in {c["identifier"] for c in courses},
            "points": points(LESSON),
            "cta_label": "Start training" if rec else "See career progression",
        }

    return {
        **base,
        "kind": "maintain",
        "headline": "Every requirement of your role is met",
        "reason": (
            "Nothing above your designation asks for more. Re-sitting an assessment now "
            "and then keeps the record current as it ages."
        ),
        "points": points(ASSESSMENT_SAT),
        "cta_label": "Review your profile",
    }


def next_best_action(db: Session, client, user_id: str, now: datetime | None = None) -> dict:
    """What to do next, and why - built from the gap engine and the recommender.

    This decides between things those engines already produce; it ranks no
    course of its own. The one judgement it adds is the order: finish what is
    started, but measure before training where the level is not yet measured.
    """
    if db.get(User, user_id) is None:
        raise KeyError(f"Unknown user: {user_id}")
    now = _utc(now)
    today = _naive(now).date()
    record = _load(db, user_id, today)
    report = compute_gaps(db, user_id)
    courses = _course_states(db, user_id, record, client, now)
    competency_names = {c.id: c.name for c in db.scalars(select(Competency)).all()}
    return {
        "user_id": user_id,
        "continue_learning": _continue_learning(courses, report, competency_names),
        "best_action": _best_action(db, client, user_id, report, courses, _bank_competencies(db)),
    }


# --- the department's view --------------------------------------------------
ENGAGEMENT_WEEKS = 8


def cohort_engagement(db: Session, users: list[User], now: datetime | None = None) -> dict:
    """Engagement across a set of officers, for the administrator.

    Named, unlike the officer's own cohort line: this sits behind an
    administrator's password, which is what makes it the place to say who.
    """
    now = _utc(now)
    today = _naive(now).date()
    start = week_start(today)
    last_start = start - timedelta(days=7)
    weeks = [start - timedelta(days=7 * i) for i in range(ENGAGEMENT_WEEKS - 1, -1, -1)]
    names = _names(db)

    reports = {r.user_id: r for r in compute_gaps_bulk(db, users)}
    stored: dict[tuple[str, str], int] = {
        (uc.user_id, uc.competency_id): uc.attained_level
        for uc in db.scalars(
            select(UserCompetency).where(UserCompetency.user_id.in_([u.id for u in users]))
        ).all()
    }

    series = {w: {"week_start": w, "active_officers": 0, "actions": 0, "points": 0} for w in weeks}
    learners = []
    studied: dict[str, dict] = {}
    totals = {
        "active_this_week": 0,
        "active_last_week": 0,
        "goal_met_this_week": 0,
        "goal_met_last_week": 0,
        "streak_2_plus": 0,
        "streak_7_plus": 0,
        "assessments_this_week": 0,
        "videos_this_week": 0,
        "points_this_week": 0,
        "officers_improved": 0,
    }
    window_start = today - timedelta(days=29)

    for user in users:
        state = _build(db, user.id, today, names)
        record = state.record
        calendar = activity(db, user.id, today=today)

        for week in weeks:
            end = week + timedelta(days=6)
            actions = sum(n for d, n in state.active.items() if week <= d <= min(end, today))
            if actions:
                series[week]["active_officers"] += 1
                series[week]["actions"] += actions
            series[week]["points"] += sum(e.points for e in state.entries if week <= e.day <= end)

        this_week_days = sum(1 for d in state.active if start <= d <= today)
        last_week_days = sum(1 for d in state.active if last_start <= d < start)
        points_this_week = _week_points(state, start, today)

        totals["active_this_week"] += 1 if this_week_days else 0
        totals["active_last_week"] += 1 if last_week_days else 0
        totals["goal_met_this_week"] += (
            1 if this_week_days >= state.goals.for_week(start).weekly_days_target else 0
        )
        totals["goal_met_last_week"] += (
            1 if last_week_days >= state.goals.for_week(last_start).weekly_days_target else 0
        )
        totals["streak_2_plus"] += 1 if calendar.current_streak >= 2 else 0
        totals["streak_7_plus"] += 1 if calendar.current_streak >= 7 else 0
        totals["assessments_this_week"] += sum(
            1 for a in record.attempts if start <= _naive(a.created_at).date() <= today
        )
        totals["videos_this_week"] += sum(1 for row in record.lessons if start <= row.at.date() <= today)
        totals["points_this_week"] += points_this_week

        report = reports.get(user.id)
        improved = any(r.new_level > r.prior_level for r in record.results) or bool(
            report
            and any(
                item.evidence == "measured"
                and item.attained_level > stored.get((user.id, item.competency_id), 0)
                for item in report.items
            )
        )
        totals["officers_improved"] += 1 if improved else 0

        learners.append(
            {
                "user_id": user.id,
                "name": user.name,
                "role_name": user.role.name if user.role else user.role_id,
                "department": user.department,
                "points_this_week": points_this_week,
                "study_days_this_week": this_week_days,
                "current_streak": calendar.current_streak,
            }
        )

        course_names = {e.course_identifier: e.course_name for e in record.enrolments}
        for row in record.lessons:
            if row.at.date() < window_start:
                continue
            course = studied.setdefault(
                row.course_identifier,
                {
                    "course_identifier": row.course_identifier,
                    "course_name": course_names.get(row.course_identifier, row.course_identifier),
                    "lessons_watched": 0,
                    "officers": set(),
                },
            )
            course["lessons_watched"] += 1
            course["officers"].add(user.id)

    count = len(users)
    top = sorted(
        (l for l in learners if l["points_this_week"] > 0),
        key=lambda l: (-l["points_this_week"], -l["study_days_this_week"], l["name"]),
    )[:5]
    most_studied = sorted(
        (
            {**c, "officers": len(c["officers"])}
            for c in studied.values()
        ),
        key=lambda c: (-c["lessons_watched"], -c["officers"], c["course_name"]),
    )[:5]

    return {
        "officer_count": count,
        "week_start": start,
        **totals,
        "goal_attainment_pct": round(100 * totals["goal_met_this_week"] / count, 1) if count else 0.0,
        "goal_attainment_last_week_pct": (
            round(100 * totals["goal_met_last_week"] / count, 1) if count else 0.0
        ),
        "weeks": list(series.values()),
        "top_learners": top,
        "most_studied_courses": most_studied,
        "note": (
            "Derived from recorded activity - videos watched, assessments sat, in-video "
            "questions answered. Nothing on this page can be set by hand."
        ),
    }
