"""Recommendation engine (spec 8.2).

Maps gap competencies onto catalogue courses fetched through the Karmayogi
client (Sunbird contract). Ranking, highest first:

  1. course addresses a high weighted-gap competency   (priority mass)
  2. course covers several of the officer's gaps at once (coverage bonus)
  3. course target level sits closest to the required target, without
     overshooting into material the officer is not ready for
"""
from __future__ import annotations

from app.integration.base import Course, KarmayogiClient
from app.schemas import CourseOut, GapItem, Recommendation

COVERAGE_BONUS = 0.6
LEVEL_PENALTY = 0.35


def _to_out(course: Course) -> CourseOut:
    return CourseOut(**course.model_dump())


def recommend_courses(
    client: KarmayogiClient,
    gap_items: list[GapItem],
    top_n_gaps: int = 5,
    limit: int = 8,
) -> list[Recommendation]:
    open_gaps = [g for g in gap_items if g.gap > 0][:top_n_gaps]
    if not open_gaps:
        return []

    gap_by_id = {g.competency_id: g for g in open_gaps}
    candidates: dict[str, Course] = {}
    # Search per competency: keeps each call a genuine Sunbird content search.
    for gap in open_gaps:
        matches = client.search_courses([gap.competency_id], max_level=gap.target_level)
        if not matches:
            # No course sits at or below the target level. An advanced course still
            # closes the gap, so fall back to an uncapped search rather than leaving
            # the officer with no route to this competency.
            matches = client.search_courses([gap.competency_id], max_level=0)
        for course in matches:
            candidates.setdefault(course.identifier, course)

    recommendations: list[Recommendation] = []
    for course in candidates.values():
        covered = [cid for cid in course.competency_ids if cid in gap_by_id]
        if not covered:
            continue

        priority_mass = sum(gap_by_id[cid].weighted_gap for cid in covered)
        coverage_bonus = COVERAGE_BONUS * (len(covered) - 1)

        primary = max(covered, key=lambda cid: gap_by_id[cid].weighted_gap)
        primary_gap = gap_by_id[primary]
        level_distance = abs(course.target_level - primary_gap.target_level)
        score = round(priority_mass + coverage_bonus - LEVEL_PENALTY * level_distance, 3)

        names = [gap_by_id[cid].competency_name for cid in covered]
        if len(covered) > 1:
            reason = f"Covers {len(covered)} of your top gaps: " + ", ".join(names)
        else:
            reason = (
                f"Closes your {names[0]} gap "
                f"(level {primary_gap.attained_level} to {primary_gap.target_level})"
            )

        recommendations.append(
            Recommendation(
                course=_to_out(course),
                score=score,
                covers_gap_competencies=covered,
                covers_count=len(covered),
                reason=reason,
                primary_competency_id=primary,
                primary_competency_name=primary_gap.competency_name,
            )
        )

    recommendations.sort(key=lambda r: (-r.score, -r.covers_count, r.course.identifier))
    return recommendations[:limit]


def catalogue_coverage(client: KarmayogiClient, required_competency_ids: set[str]) -> float:
    """% of role-required competencies with at least one matching course (spec 13)."""
    if not required_competency_ids:
        return 0.0
    covered = {
        cid
        for cid in required_competency_ids
        if client.search_courses([cid], max_level=0)
    }
    return round(100 * len(covered) / len(required_competency_ids), 1)
