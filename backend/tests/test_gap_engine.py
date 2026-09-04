"""Gap engine acceptance criteria (spec 8.1)."""
from app.engines.gap import compute_gaps, top_gaps


def test_jso_with_low_sampling_and_quality_ranks_them_first(db):
    """AC 8.1: a JSO weak on C01/C03 gets them at the top, with correct numbers."""
    report = compute_gaps(db, "u-jso-anita")
    ranked = top_gaps(report, 2)

    assert {i.competency_id for i in ranked} == {"C01", "C03"}
    for item in ranked:
        assert item.target_level == 3
        assert item.attained_level == 1
        assert item.gap == 2
        assert item.weight == 1.0
        assert item.weighted_gap == 2.0


def test_weighted_gap_outranks_larger_raw_gap():
    """A high-criticality shortfall must beat a bigger gap on a low-weight competency."""
    from app.schemas import GapItem
    from app.models import CompetencyType

    critical = GapItem(
        competency_id="C01", competency_name="a", competency_type=CompetencyType.DOMAIN,
        target_level=3, attained_level=2, gap=1, weight=1.0, weighted_gap=1.0,
        meets_target=False,
    )
    minor = GapItem(
        competency_id="C12", competency_name="b", competency_type=CompetencyType.DOMAIN,
        target_level=2, attained_level=0, gap=2, weight=0.3, weighted_gap=0.6,
        meets_target=False,
    )
    assert sorted([minor, critical], key=lambda i: -i.weighted_gap)[0] is critical


def test_gap_is_never_negative(db):
    """Exceeding a target contributes zero gap, not a negative one."""
    report = compute_gaps(db, "u-admin-meera")
    assert all(i.gap >= 0 for i in report.items)
    assert report.total_weighted_gap >= 0


def test_readiness_is_a_percentage(db):
    for user_id in ("u-jso-anita", "u-da-neha", "u-si-vikram"):
        report = compute_gaps(db, user_id)
        assert 0.0 <= report.readiness_pct <= 100.0


def test_unknown_user_raises(db):
    import pytest

    with pytest.raises(KeyError):
        compute_gaps(db, "nobody")


def test_designation_hierarchy_is_well_formed(db):
    """The designation table is the competency profile's anchor, so it has to hold.

    Targets and weights are expanded from a documented seniority rule rather
    than typed per designation, which is exactly the kind of thing that goes
    quietly wrong.
    """
    from sqlalchemy import select

    from app.models import Competency, Role

    roles = db.scalars(select(Role)).all()
    known = {c.id for c in db.scalars(select(Competency)).all()}

    assert len(roles) == 17
    assert {r.stream for r in roles} >= {"Statistical", "Administration"}

    for role in roles:
        assert role.requirements, f"{role.id} expects no competencies"
        assert role.grade > 0, f"{role.id} has no grade"
        for req in role.requirements:
            assert req.competency_id in known, f"{role.id} wants unknown {req.competency_id}"
            assert 0 <= req.target_level <= 4
            assert req.weight in (1.0, 0.6, 0.3)

    # Seniority has to mean something: a Secretary is not held to a junior bar.
    mts = next(r for r in roles if r.id == "MTS")
    secretary = next(r for r in roles if r.id == "SECY")
    assert max(r.target_level for r in secretary.requirements) > max(
        r.target_level for r in mts.requirements
    )
