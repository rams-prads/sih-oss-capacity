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
    return _guarantee_cover(recommendations, open_gaps, limit)


def _guarantee_cover(
    ranked: list[Recommendation], open_gaps: list[GapItem], limit: int
) -> list[Recommendation]:
    """Make sure every open gap keeps a route, not just the best-scoring ones.

    Ranking alone is enough on a small catalogue, but once the real iGOT
    catalogue is loaded a competency with many courses fills the whole list and
    a lower-priority gap can end up with nothing at all - the officer sees a gap
    the platform never offers a way to close. So take the top by score, then for
    any gap still uncovered swap in its best course for the weakest one held.
    """
    selected = ranked[:limit]
    covered = {cid for r in selected for cid in r.covers_gap_competencies}

    # Collect every rescue first, then make room once. Dropping the weakest entry
    # inside the loop would evict a course added moments earlier for an earlier
    # gap, and that gap would silently lose its route again.
    additions: list[Recommendation] = []
    for gap in open_gaps:
        if gap.competency_id in covered:
            continue
        best = next(
            (r for r in ranked if gap.competency_id in r.covers_gap_competencies), None
        )
        if best is None:  # nothing in the catalogue touches this competency
            continue
        additions.append(best)
        covered.update(best.covers_gap_competencies)

    if additions:
        selected = selected[: max(0, limit - len(additions))] + additions

    selected.sort(key=lambda r: (-r.score, -r.covers_count, r.course.identifier))
    return selected


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
