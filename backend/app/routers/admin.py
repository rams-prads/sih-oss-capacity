"""Department-level capacity analytics (spec 8.6) and headline metrics (spec 13).

This is the view a MoSPI training administrator uses: where the cadre is weak,
how many officers meet each role target, and which cohort trainings to schedule.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import AdminUser, DbSession, KarmayogiDep
from app.engines.progress import (
    COMPLETED,
    EXPIRED,
    IN_PROGRESS,
    NOT_STARTED,
    classify,
    course_progress,
    derive_status,
)
from app.engines.gap import compute_gaps_bulk
from app.engines.recommend import catalogue_coverage, recommend_courses
from app.models import (
    AssessmentResult,
    CheckpointAttempt,
    Competency,
    Enrolment,
    Question,
    Quiz,
    Role,
    RoleRequirement,
    Topic,
    User,
)
from app.schemas import (
    AdminLearningOverview,
    AdminOverview,
    AtRiskEnrolment,
    CourseRollup,
    CohortRecommendation,
    CompetencyStat,
    CourseOut,
    HeatmapCell,
    MetricsOut,
    TopicRollup,
)

router = APIRouter(tags=["admin"])


def _competency_stats(db: Session, reports) -> list[CompetencyStat]:
    competencies = {c.id: c for c in db.scalars(select(Competency)).all()}
    buckets: dict[str, list] = defaultdict(list)
    for report in reports:
        for item in report.items:
            buckets[item.competency_id].append(item)

    stats: list[CompetencyStat] = []
    for cid, items in buckets.items():
        competency = competencies.get(cid)
        if competency is None:
            continue
        n = len(items)
        meeting = sum(1 for i in items if i.meets_target)
        stats.append(
            CompetencyStat(
                competency_id=cid,
                competency_name=competency.name,
                competency_type=competency.type,
                avg_attained=round(sum(i.attained_level for i in items) / n, 2),
                avg_target=round(sum(i.target_level for i in items) / n, 2),
                avg_gap=round(sum(i.gap for i in items) / n, 2),
                avg_weighted_gap=round(sum(i.weighted_gap for i in items) / n, 2),
                officers_meeting_target=meeting,
                officers_requiring=n,
                pct_meeting_target=round(100 * meeting / n, 1),
            )
        )
    stats.sort(key=lambda s: (-s.avg_weighted_gap, s.competency_id))
    return stats


@router.get("/admin/overview", response_model=AdminOverview)
def department_overview(
    db: DbSession,
    client: KarmayogiDep,
    admin: AdminUser,
    department: str | None = None,
):
    stmt = select(User).order_by(User.name)
    if department:
        stmt = stmt.where(User.department == department)
    users = db.scalars(stmt).all()
    if not users:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No officers in that department")

    reports = compute_gaps_bulk(db, list(users))
    stats = _competency_stats(db, reports)

    heatmap = [
        HeatmapCell(
            user_id=report.user_id,
            user_name=report.user_name,
            competency_id=item.competency_id,
            attained_level=item.attained_level,
            target_level=item.target_level,
            gap=item.gap,
        )
        for report in reports
        for item in report.items
    ]

    required_ids = {
        cid for (cid,) in db.execute(select(RoleRequirement.competency_id).distinct()).all()
    }
    top_gaps = [s for s in stats if s.avg_gap > 0][:3]

    cohort: list[CohortRecommendation] = []
    for stat in top_gaps:
        # Reuse the learner ranking against a synthetic cadre-level gap so the
        # cohort suggestion and the individual recommendation agree.
        below = [
            i
            for report in reports
            for i in report.items
            if i.competency_id == stat.competency_id and i.gap > 0
        ]
        if not below:
            continue
        cadre_gap = below[0].model_copy(
            update={
                "target_level": max(i.target_level for i in below),
                "attained_level": min(i.attained_level for i in below),
                "gap": max(i.gap for i in below),
                "weight": max(i.weight for i in below),
                "weighted_gap": max(i.weighted_gap for i in below),
            }
        )
        recs = recommend_courses(client, [cadre_gap], top_n_gaps=1, limit=1)
        cohort.append(
            CohortRecommendation(
                competency_id=stat.competency_id,
                competency_name=stat.competency_name,
                officers_below_target=len(below),
                avg_gap=round(sum(i.gap for i in below) / len(below), 2),
                course=CourseOut(**recs[0].course.model_dump()) if recs else None,
            )
        )

    return AdminOverview(
        department=department or "All departments",
        officer_count=len(users),
        avg_readiness_pct=round(sum(r.readiness_pct for r in reports) / len(reports), 1),
        avg_weighted_gap=round(sum(r.total_weighted_gap for r in reports) / len(reports), 2),
        catalogue_coverage_pct=catalogue_coverage(client, required_ids),
        competency_stats=stats,
        top_gaps=top_gaps,
        heatmap=heatmap,
        cohort_recommendations=cohort,
    )


def _mcq_validity_rate(db: Session) -> float:
    """% of generated MCQs that passed the quality gate (spec 13)."""
    accepted = db.scalar(select(func.count()).select_from(Question)) or 0
    rejected = db.scalar(select(func.coalesce(func.sum(Quiz.rejected_count), 0))) or 0
    attempted = accepted + rejected
    return round(100 * accepted / attempted, 1) if attempted else 0.0


@router.get("/admin/metrics", response_model=MetricsOut)
def metrics(db: DbSession, client: KarmayogiDep, admin: AdminUser):
    users = db.scalars(select(User)).all()
    reports = compute_gaps_bulk(db, list(users))
    results = db.scalars(select(AssessmentResult)).all()

    required_ids = {
        cid for (cid,) in db.execute(select(RoleRequirement.competency_id).distinct()).all()
    }
    catalogue = client.search_courses([], max_level=0)

    # Gap closure: how much of the pre-assessment gap each assessment removed.
    closures = []
    for r in results:
        if r.prior_level >= 4:
            continue
        room = 4 - r.prior_level
        closures.append(100 * max(0, r.new_level - r.prior_level) / room)


    return MetricsOut(
        officers=len(users),
        departments=len({u.department for u in users}),
        competencies=db.scalar(select(func.count()).select_from(Competency)) or 0,
        roles=db.scalar(select(func.count()).select_from(Role)) or 0,
        catalogue_size=len(catalogue),
        catalogue_coverage_pct=catalogue_coverage(client, required_ids),
        assessments_taken=len(results),
        mcq_validity_rate_pct=_mcq_validity_rate(db),
        avg_gap_closure_pct=round(sum(closures) / len(closures), 1) if closures else 0.0,
        avg_readiness_pct=(
            round(sum(r.readiness_pct for r in reports) / len(reports), 1) if reports else 0.0
        ),
    )


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _topic_rollup(db: Session, user_ids: list[str]) -> list[TopicRollup]:
    """Per topic: how the cadre scores, and how many officers are weak on it."""
    attempts = db.scalars(
        select(CheckpointAttempt).where(CheckpointAttempt.user_id.in_(user_ids))
    ).all()
    if not attempts:
        return []

    topics = {t.id: t for t in db.scalars(select(Topic)).all()}
    competencies = {c.id: c.name for c in db.scalars(select(Competency)).all()}

    # (topic, officer) -> correct/total, so each officer is classified once.
    per_officer: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
    for attempt in attempts:
        for item in attempt.items:
            key = (item.get("topic_id", attempt.topic_id), attempt.user_id)
            per_officer[key][1] += 1
            per_officer[key][0] += 1 if item.get("correct") else 0

    grouped: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for (topic_id, _user), (correct, total) in per_officer.items():
        grouped[topic_id].append((correct, total))

    rows = []
    for topic_id, officer_scores in grouped.items():
        topic = topics.get(topic_id)
        answered = sum(total for _c, total in officer_scores)
        correct = sum(c for c, _t in officer_scores)
        verdicts = [
            classify(100 * c / t if t else 0.0) for c, t in officer_scores
        ]
        rows.append(
            TopicRollup(
                topic_id=topic_id,
                topic_name=topic.name if topic else topic_id,
                competency_id=topic.competency_id if topic else "",
                competency_name=competencies.get(topic.competency_id, "") if topic else "",
                officers_assessed=len(officer_scores),
                questions_answered=answered,
                avg_accuracy_pct=round(100 * correct / answered, 1) if answered else 0.0,
                weak=verdicts.count("weak"),
                developing=verdicts.count("developing"),
                strong=verdicts.count("strong"),
            )
        )
    # Weakest first: what the department should train on next.
    rows.sort(key=lambda r: (r.avg_accuracy_pct, -r.officers_assessed))
    return rows


@router.get("/admin/learning", response_model=AdminLearningOverview)
def department_learning(
    db: DbSession,
    admin: AdminUser,
    department: str | None = None,
    expiring_within_days: int = 30,
):
    """Course progress and topic mastery aggregated across the cadre.

    Answers the questions a training administrator actually asks: which topics is
    this department weak on, which courses stall, and whose enrolment is about to
    lapse unfinished.
    """
    stmt = select(User).order_by(User.name)
    if department:
        stmt = stmt.where(User.department == department)
    users = list(db.scalars(stmt).all())
    if not users:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No officers in that department")

    user_ids = [u.id for u in users]
    names = {u.id: u.name for u in users}
    now = datetime.now(timezone.utc)

    enrolments = db.scalars(
        select(Enrolment).where(Enrolment.user_id.in_(user_ids))
    ).all()

    counts = {NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0, EXPIRED: 0}
    progress_values: list[int] = []
    per_course: dict[str, dict] = {}
    expiring: list[AtRiskEnrolment] = []
    lapsed: list[AtRiskEnrolment] = []
    officers_with_enrolments = set()

    for enrolment in enrolments:
        officers_with_enrolments.add(enrolment.user_id)
        progress = course_progress(db, enrolment.user_id, enrolment.course_identifier)
        course_status = derive_status(enrolment, progress, now)
        counts[course_status] += 1
        progress_values.append(progress["progress_pct"])

        row = per_course.setdefault(
            enrolment.course_identifier,
            {
                "name": enrolment.course_name,
                NOT_STARTED: 0,
                IN_PROGRESS: 0,
                COMPLETED: 0,
                EXPIRED: 0,
                "progress": [],
            },
        )
        row[course_status] += 1
        row["progress"].append(progress["progress_pct"])

        expires_at = _aware(enrolment.expires_at)
        if course_status == EXPIRED:
            lapsed.append(
                AtRiskEnrolment(
                    user_id=enrolment.user_id,
                    user_name=names.get(enrolment.user_id, enrolment.user_id),
                    course_identifier=enrolment.course_identifier,
                    course_name=enrolment.course_name,
                    progress_pct=progress["progress_pct"],
                    status=course_status,
                )
            )
        elif expires_at is not None and course_status != COMPLETED:
            days = (expires_at - now).days
            if 0 <= days <= expiring_within_days:
                expiring.append(
                    AtRiskEnrolment(
                        user_id=enrolment.user_id,
                        user_name=names.get(enrolment.user_id, enrolment.user_id),
                        course_identifier=enrolment.course_identifier,
                        course_name=enrolment.course_name,
                        progress_pct=progress["progress_pct"],
                        days_remaining=days,
                        status=course_status,
                    )
                )

    rollup = _topic_rollup(db, user_ids)
    expiring.sort(key=lambda r: (r.days_remaining or 0, -r.progress_pct))
    lapsed.sort(key=lambda r: -r.progress_pct)

    course_rollup = [
        CourseRollup(
            course_identifier=cid,
            course_name=row["name"],
            enrolled=row[NOT_STARTED] + row[IN_PROGRESS] + row[COMPLETED] + row[EXPIRED],
            in_progress=row[IN_PROGRESS],
            completed=row[COMPLETED],
            expired=row[EXPIRED],
            not_started=row[NOT_STARTED],
            completion_rate_pct=round(
                100
                * row[COMPLETED]
                / (row[NOT_STARTED] + row[IN_PROGRESS] + row[COMPLETED] + row[EXPIRED]),
                1,
            ),
            avg_progress_pct=round(sum(row["progress"]) / len(row["progress"]), 1),
        )
        for cid, row in per_course.items()
    ]
    course_rollup.sort(key=lambda c: (c.completion_rate_pct, -c.enrolled))

    return AdminLearningOverview(
        department=department or "All departments",
        officer_count=len(users),
        enrolments=len(enrolments),
        in_progress=counts[IN_PROGRESS],
        completed=counts[COMPLETED],
        expired=counts[EXPIRED],
        not_started=counts[NOT_STARTED],
        avg_progress_pct=(
            round(sum(progress_values) / len(progress_values), 1) if progress_values else 0.0
        ),
        completion_rate_pct=(
            round(100 * counts[COMPLETED] / len(enrolments), 1) if enrolments else 0.0
        ),
        officers_with_no_enrolment=len(users) - len(officers_with_enrolments),
        topic_rollup=rollup,
        weakest_topics=rollup[:5],
        course_rollup=course_rollup,
        expiring_soon=expiring[:10],
        expired_incomplete=lapsed[:10],
    )
