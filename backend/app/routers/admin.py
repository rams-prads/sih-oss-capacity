"""Department-level capacity analytics (spec 8.6) and headline metrics (spec 13).

This is the view a MoSPI training administrator uses: where the cadre is weak,
how many officers meet each role target, and which cohort trainings to schedule.
"""
from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import DbSession, KarmayogiDep
from app.engines.gap import compute_gaps
from app.engines.recommend import catalogue_coverage, recommend_courses
from app.models import (
    AssessmentResult,
    Competency,
    Question,
    Quiz,
    Role,
    RoleRequirement,
    User,
)
from app.schemas import (
    AdminOverview,
    CohortRecommendation,
    CompetencyStat,
    CourseOut,
    HeatmapCell,
    MetricsOut,
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
def department_overview(db: DbSession, client: KarmayogiDep, department: str | None = None):
    stmt = select(User).order_by(User.name)
    if department:
        stmt = stmt.where(User.department == department)
    users = db.scalars(stmt).all()
    if not users:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No officers in that department")

    reports = [compute_gaps(db, u.id) for u in users]
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
def metrics(db: DbSession, client: KarmayogiDep):
    users = db.scalars(select(User)).all()
    reports = [compute_gaps(db, u.id) for u in users]
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
