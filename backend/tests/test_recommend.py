"""Recommendation engine acceptance criteria (spec 8.2)."""
from app.engines.gap import compute_gaps, top_gaps
from app.engines.recommend import catalogue_coverage, recommend_courses
from app.integration.mock import MockKarmayogiClient


def test_every_top_gap_yields_at_least_one_course(db):
    """AC 8.2, first half."""
    client = MockKarmayogiClient()
    report = compute_gaps(db, "u-jso-anita")
    gaps = top_gaps(report, 5)
    recommendations = recommend_courses(client, report.items, limit=20)

    covered = {cid for r in recommendations for cid in r.covers_gap_competencies}
    for gap in gaps:
        assert gap.competency_id in covered, f"no course for {gap.competency_id}"


def test_top_gaps_stay_covered_at_the_default_limit(db):
    """AC 8.2 again, with no spare room.

    The catalogue is large enough that courses covering one popular competency
    can fill the whole list, so every rescued gap has to survive the trim - not
    just the last one rescued.
    """
    client = MockKarmayogiClient()
    report = compute_gaps(db, "u-jso-anita")
    recommendations = recommend_courses(client, report.items)  # default limit

    covered = {cid for r in recommendations for cid in r.covers_gap_competencies}
    for gap in top_gaps(report, 5):
        assert gap.competency_id in covered, f"no course for {gap.competency_id}"


def test_no_single_competency_floods_the_list(db):
    """A lopsided catalogue must not crowd out the officer's other gaps.

    iGOT carries dozens of data-quality and SQL courses and only a handful on
    sampling, so ranking by score alone handed a JSO six ways to learn SQL and
    one way to learn sampling - her largest gap.
    """
    from collections import Counter

    from app.engines.recommend import PER_COMPETENCY

    client = MockKarmayogiClient()
    report = compute_gaps(db, "u-jso-anita")
    recommendations = recommend_courses(client, report.items)

    per_competency = Counter(r.primary_competency_id for r in recommendations)
    assert max(per_competency.values()) <= PER_COMPETENCY
    # The biggest gap must get at least as many routes as anything else.
    biggest = top_gaps(report, 1)[0].competency_id
    assert per_competency[biggest] == max(per_competency.values())


def test_multi_gap_course_outranks_single_gap_course(db):
    """AC 8.2, second half: coverage breadth wins."""
    client = MockKarmayogiClient()
    report = compute_gaps(db, "u-jso-anita")
    recommendations = recommend_courses(client, report.items, limit=20)

    top = recommendations[0]
    assert top.covers_count >= 2
    # Pinning an identifier here would break every time the catalogue is
    # refreshed from iGOT; the acceptance criterion is that breadth wins.
    single_gap = [r for r in recommendations if r.covers_count == 1]
    assert not single_gap or top.score > single_gap[0].score


def test_officer_meeting_every_target_gets_no_recommendations(db):
    client = MockKarmayogiClient()
    report = compute_gaps(db, "u-admin-meera")
    assert recommend_courses(client, report.items) == []


def test_recommendations_are_ranked_descending(db):
    client = MockKarmayogiClient()
    report = compute_gaps(db, "u-si-vikram")
    scores = [r.score for r in recommend_courses(client, report.items, limit=10)]
    assert scores == sorted(scores, reverse=True)


def test_catalogue_covers_every_role_required_competency(db):
    """Spec 13: coverage metric should be 100% on the seeded catalogue."""
    from sqlalchemy import select

    from app.models import RoleRequirement

    required = {cid for (cid,) in db.execute(select(RoleRequirement.competency_id).distinct())}
    assert catalogue_coverage(MockKarmayogiClient(), required) == 100.0
