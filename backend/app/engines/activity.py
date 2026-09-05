"""A daily record of an officer actually turning up.

Readiness and gaps say where someone stands. Neither says whether they are
studying at all, and an officer who did nothing for three weeks looks identical
to one who studied every evening until the day their proficiency happens to be
re-measured.

Everything needed was already stored and never read back as a series: a lesson
completion, an assessment attempt, a generated quiz and an answered in-video
prompt all carry a timestamp. This counts them per day.

What counts as showing up, deliberately: anything the officer *did*, not
anything that happened to them. Enrolling is not activity - it takes one click
and no learning - so a day spent enrolling in eight courses reads as empty,
which is the honest answer.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AssessmentResult,
    CheckpointAttempt,
    LessonProgress,
    User,
)

DEFAULT_DAYS = 364          # 52 whole weeks, so the grid has no ragged column


@dataclass
class ActivityDay:
    date: str
    count: int
    lessons: int
    assessments: int
    prompts: int


@dataclass
class ActivityOut:
    user_id: str
    start: str
    end: str
    days: list[ActivityDay] = field(default_factory=list)
    active_days: int = 0
    total_actions: int = 0
    current_streak: int = 0
    longest_streak: int = 0
    busiest_day: str = ""
    busiest_count: int = 0


def _as_date(value: datetime | None) -> date | None:
    if value is None:
        return None
    return (value.replace(tzinfo=None) if value.tzinfo else value).date()


def activity(db: Session, user_id: str, days: int = DEFAULT_DAYS) -> ActivityOut:
    """Per-day activity for one officer, plus the streaks that follow from it."""
    if db.get(User, user_id) is None:
        raise KeyError(f"Unknown user: {user_id}")

    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days - 1)

    lessons: dict[date, int] = defaultdict(int)
    assessments: dict[date, int] = defaultdict(int)
    prompts: dict[date, int] = defaultdict(int)

    for row in db.scalars(
        select(LessonProgress).where(LessonProgress.user_id == user_id)
    ).all():
        day = _as_date(row.completed_at)
        if day and start <= day <= today:
            lessons[day] += 1

    for row in db.scalars(
        select(CheckpointAttempt).where(CheckpointAttempt.user_id == user_id)
    ).all():
        day = _as_date(row.created_at)
        if day and start <= day <= today:
            assessments[day] += 1

    for row in db.scalars(
        select(AssessmentResult).where(AssessmentResult.user_id == user_id)
    ).all():
        day = _as_date(row.created_at)
        if day and start <= day <= today:
            assessments[day] += 1

    # In-video prompts arrived with the video player and may not exist on an
    # older database; their absence should cost this panel nothing.
    try:
        from app.models import VideoPromptAnswer

        for row in db.scalars(
            select(VideoPromptAnswer).where(VideoPromptAnswer.user_id == user_id)
        ).all():
            day = _as_date(getattr(row, "answered_at", None))
            if day and start <= day <= today:
                prompts[day] += 1
    except Exception:
        pass

    series: list[ActivityDay] = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        lesson_count = lessons.get(day, 0)
        assessment_count = assessments.get(day, 0)
        prompt_count = prompts.get(day, 0)
        series.append(
            ActivityDay(
                date=day.isoformat(),
                count=lesson_count + assessment_count + prompt_count,
                lessons=lesson_count,
                assessments=assessment_count,
                prompts=prompt_count,
            )
        )

    active = [d for d in series if d.count > 0]
    busiest = max(series, key=lambda d: d.count) if series else None

    return ActivityOut(
        user_id=user_id,
        start=start.isoformat(),
        end=today.isoformat(),
        days=series,
        active_days=len(active),
        total_actions=sum(d.count for d in series),
        current_streak=current_streak(series),
        longest_streak=longest_streak(series),
        busiest_day=busiest.date if busiest and busiest.count else "",
        busiest_count=busiest.count if busiest else 0,
    )


def current_streak(series: list[ActivityDay]) -> int:
    """Consecutive active days ending today, or ending yesterday.

    Yesterday counts because a streak should not be declared broken before the
    day it would be broken on: at nine in the morning an officer has not yet
    failed to study today.
    """
    if not series:
        return 0

    index = len(series) - 1
    if series[index].count == 0:
        index -= 1          # today is still open; look back one day
        if index < 0 or series[index].count == 0:
            return 0

    streak = 0
    while index >= 0 and series[index].count > 0:
        streak += 1
        index -= 1
    return streak


def longest_streak(series: list[ActivityDay]) -> int:
    best = run = 0
    for day in series:
        run = run + 1 if day.count > 0 else 0
        best = max(best, run)
    return best
