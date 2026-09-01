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


def test_multi_gap_course_outranks_single_gap_course(db):
    """AC 8.2, second half: coverage breadth wins."""
    client = MockKarmayogiClient()
    report = compute_gaps(db, "u-jso-anita")
    recommendations = recommend_courses(client, report.items, limit=20)

    top = recommendations[0]
    assert top.covers_count == 2
    assert top.course.identifier == "do_3137421900016"  # C03 + C09


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
