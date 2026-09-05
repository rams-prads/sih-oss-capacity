"""Where the cadre's capacity is heading, from the record of where it has been.

The problem statement asks the administrator dashboard to predict future skill
requirements and support workforce decisions. Everything else on that dashboard
is a snapshot: readiness today, gaps today. This is the only part that looks
forward.

It is deliberately arithmetic rather than a model. Every officer's proficiency
change is already stored with a timestamp - AssessmentResult carries prior_level
and new_level, Enrolment carries enrolled_at and completed_at - so the observed
rate of change is a measurement, not an inference. A projection built from it can
be explained to the officer it describes and checked by the administrator acting
on it, which a fitted model on nine officers could not be.

The honesty rules this follows:

  - Nothing is projected from a single data point. A competency with one
    observation reports its rate as unknown rather than guessing a trend.
  - Projections state the window they were measured over, so a reader can judge
    them.
  - Where the data cannot support a forecast, that is the answer. An empty
    forecast is a true statement about a young system, and better than a
    confident line drawn through two points.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.engines.gap import compute_gaps_bulk
from app.models import (
    AssessmentResult,
    CheckpointAttempt,
    Competency,
    Enrolment,
    RoleRequirement,
    User,
)

# A rate measured over fewer than this many level changes is not a rate.
MIN_OBSERVATIONS = 2
# How far back the observed rate is measured over.
WINDOW_DAYS = 180
# Projections beyond this are not meaningfully different from "no idea".
MAX_HORIZON_MONTHS = 36


@dataclass
class CompetencyForecast:
    competency_id: str
    competency_name: str
    officers_below_target: int
    total_gap_levels: float          # levels still to gain across the cadre
    levels_gained: float             # levels actually gained in the window
    observations: int                # how many measured level changes
    levels_per_month: float          # observed rate across the cadre
    months_to_close: float | None    # None when the rate cannot be measured
    basis: str                       # the sentence a reader can check


@dataclass
class ForecastOut:
    department: str
    window_days: int
    observed_from: datetime
    officers: int
    competencies: list[CompetencyForecast] = field(default_factory=list)
    widening: list[str] = field(default_factory=list)
    stalling_courses: list[dict] = field(default_factory=list)
    note: str = ""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _naive(value: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; compare like with like."""
    if value is None:
        return None
    return value.replace(tzinfo=None) if value.tzinfo else value


def forecast(db: Session, department: str | None = None, window_days: int = WINDOW_DAYS) -> ForecastOut:
    """Project how long the cadre's current gaps take to close at the observed rate."""
    now = _utcnow()
    since = _naive(now - timedelta(days=window_days))

    users = db.scalars(
        select(User).where(User.department == department) if department else select(User)
    ).all()
    if not users:
        return ForecastOut(
            department=department or "All departments",
            window_days=window_days,
            observed_from=since,
            officers=0,
            note="No officers in this department.",
        )

    user_ids = {u.id for u in users}
    names = {c.id: c.name for c in db.scalars(select(Competency)).all()}

    # Where the cadre stands now: how many levels are still owed per competency.
    gap_levels: dict[str, float] = defaultdict(float)
    officers_short: dict[str, int] = defaultdict(int)
    for report in compute_gaps_bulk(db, users):
        for item in report.items:
            if item.gap > 0:
                gap_levels[item.competency_id] += item.gap
                officers_short[item.competency_id] += 1

    # How fast it has actually moved: every recorded change of level, in window.
    gained: dict[str, float] = defaultdict(float)
    observations: dict[str, int] = defaultdict(int)
    for result in db.scalars(
        select(AssessmentResult).where(AssessmentResult.user_id.in_(user_ids))
    ).all():
        created = _naive(result.created_at)
        if created is None or created < since:
            continue
        # A level that went down is evidence too: it slows the projection rather
        # than being quietly dropped.
        gained[result.competency_id] += result.new_level - result.prior_level
        observations[result.competency_id] += 1

    months = max(window_days / 30.0, 1e-6)
    forecasts: list[CompetencyForecast] = []
    widening: list[str] = []

    for competency_id, owed in gap_levels.items():
        seen = observations.get(competency_id, 0)
        moved = gained.get(competency_id, 0.0)
        rate = moved / months if seen >= MIN_OBSERVATIONS else 0.0

        if seen < MIN_OBSERVATIONS:
            months_to_close = None
            basis = (
                f"{seen} measured change{'' if seen == 1 else 's'} in {window_days} days - "
                "too few to state a rate."
            )
        elif rate <= 0:
            months_to_close = None
            basis = (
                f"{moved:+.1f} levels across {seen} assessments in {window_days} days: "
                "the cadre is not gaining ground here."
            )
            widening.append(competency_id)
        else:
            months_to_close = round(min(owed / rate, MAX_HORIZON_MONTHS * 1.0), 1)
            basis = (
                f"{moved:+.1f} levels gained across {seen} assessments in {window_days} days "
                f"= {rate:.2f} levels/month; {owed:.0f} levels still owed."
            )

        forecasts.append(
            CompetencyForecast(
                competency_id=competency_id,
                competency_name=names.get(competency_id, competency_id),
                officers_below_target=officers_short[competency_id],
                total_gap_levels=round(owed, 1),
                levels_gained=round(moved, 1),
                observations=seen,
                levels_per_month=round(rate, 3),
                months_to_close=months_to_close,
                basis=basis,
            )
        )

    # Ordered by what an administrator should act on, which is not the same as
    # worst-looking. A competency that has been assessed three times and moved
    # nowhere is a capacity finding and comes first. One nobody has been assessed
    # on is a measurement gap, not a capacity problem, so it goes last however
    # large its arithmetic gap looks.
    def _priority(f: CompetencyForecast) -> tuple:
        measured = f.observations >= MIN_OBSERVATIONS
        stalled = measured and f.months_to_close is None
        return (
            0 if stalled else (1 if measured else 2),   # stalled, then projected, then unmeasured
            -(f.months_to_close or 0),                  # slowest to close first
            -f.total_gap_levels,
        )

    forecasts.sort(key=_priority)

    return ForecastOut(
        department=department or "All departments",
        window_days=window_days,
        observed_from=since,
        officers=len(users),
        competencies=forecasts,
        widening=[names.get(c, c) for c in widening],
        stalling_courses=stalling_courses(db, user_ids),
        note=(
            "Projections are the cadre's own observed rate of change, not a model. "
            "A competency with fewer than "
            f"{MIN_OBSERVATIONS} measured changes reports no rate rather than a guess."
        ),
    )


def stalling_courses(db: Session, user_ids: set[str], limit: int = 5) -> list[dict]:
    """Enrolments taken up but not finishing - where training spend is leaking.

    Counted from enrolment dates rather than a status field, so it reflects what
    officers did rather than what was recorded about them.
    """
    rows = db.scalars(select(Enrolment).where(Enrolment.user_id.in_(user_ids))).all()
    by_course: dict[str, dict] = {}
    for row in rows:
        entry = by_course.setdefault(
            row.course_identifier,
            {"course_identifier": row.course_identifier, "course_name": row.course_name,
             "enrolled": 0, "completed": 0, "expired": 0, "progress_total": 0},
        )
        entry["enrolled"] += 1
        entry["progress_total"] += row.progress_pct
        if row.completed_at is not None:
            entry["completed"] += 1
        elif row.expires_at is not None and _naive(row.expires_at) < _naive(_utcnow()):
            entry["expired"] += 1

    stalled = []
    for entry in by_course.values():
        if entry["enrolled"] < 1 or entry["completed"] == entry["enrolled"]:
            continue
        stalled.append(
            {
                "course_identifier": entry["course_identifier"],
                "course_name": entry["course_name"],
                "enrolled": entry["enrolled"],
                "completed": entry["completed"],
                "expired": entry["expired"],
                "avg_progress_pct": round(entry["progress_total"] / entry["enrolled"], 1),
            }
        )
    stalled.sort(key=lambda e: (e["avg_progress_pct"], -e["enrolled"]))
    return stalled[:limit]
