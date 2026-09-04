"""Career progression: training for the designation above (spec 8.2, future requirements)."""
from sqlalchemy import select

from app.engines.progression import next_designation, progression_gaps
from app.engines.recommend import recommend_courses
from app.integration.mock import MockKarmayogiClient
from app.models import Role


def test_next_designation_follows_the_stream(db):
    """A JSO becomes an SSO, not a Section Officer."""
    jso = db.get(Role, "JSO")
    assert next_designation(db, jso).id == "SSO"

    aso = db.get(Role, "ASO")
    assert next_designation(db, aso).id == "SO"


def test_next_designation_always_moves_up(db):
    for role in db.scalars(select(Role)).all():
        nxt = next_designation(db, role)
        if nxt is not None:
            assert nxt.grade > role.grade, f"{role.id} -> {nxt.id} is not a step up"


def test_the_top_of_the_ladder_has_no_next_step(db):
    """Running out of ladder is an answer, not an error."""
    secretary = db.get(Role, "SECY")
    assert secretary.grade == max(r.grade for r in db.scalars(select(Role)).all())
    assert next_designation(db, secretary) is None


def test_progression_only_reports_what_the_step_up_adds(db):
    """Competencies already demanded today belong on the main dashboard.

    Repeating them here would double-count them and make the step look larger
    than it is.
    """
    target, items = progression_gaps(db, "u-jso-anita")
    assert target is not None and target.id == "SSO"

    current = {r.competency_id: r.target_level for r in db.get(Role, "JSO").requirements}
    for item in items:
        assert item.gap > 0
        assert current.get(item.competency_id, -1) < item.target_level


def test_progression_yields_courses_for_the_next_designation(db):
    target, items = progression_gaps(db, "u-jso-farah")  # ASO -> SO
    assert target.id == "SO"
    assert items, "an ASO has something to learn before becoming a Section Officer"

    recs = recommend_courses(MockKarmayogiClient(), items, limit=6)
    covered = {c for r in recs for c in r.covers_gap_competencies}
    assert covered, "no training offered for the step up"
    assert covered <= {i.competency_id for i in items}


def test_progression_endpoint(client):
    body = client.get("/api/progression/u-jso-anita").json()
    assert body["current_role_id"] == "JSO"
    assert body["next_role_id"] == "SSO"
    assert body["at_top_of_ladder"] is False
    assert body["items"]
    assert body["recommendations"]

    assert client.get("/api/progression/nobody").status_code == 404
