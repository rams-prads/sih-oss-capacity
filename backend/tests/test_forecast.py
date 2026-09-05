"""Capacity forecast: projecting gaps forward at the cadre's observed rate."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.engines.forecast import MIN_OBSERVATIONS, forecast
from app.models import AssessmentResult, User


@pytest.fixture
def admin_headers(client):
    token = client.post(
        "/api/auth/login", json={"user_id": "u-admin-meera", "password": "admin123"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _add(db, user_id, competency_id, prior, new, days_ago):
    db.add(
        AssessmentResult(
            user_id=user_id,
            quiz_id=f"t-{user_id}-{competency_id}-{days_ago}",
            competency_id=competency_id,
            score_pct=70.0,
            per_item=[True] * 6 + [False] * 2,
            prior_level=prior,
            new_level=new,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None)
            - timedelta(days=days_ago),
        )
    )


def test_forecast_reports_the_cadre_and_its_window(db):
    out = forecast(db)
    assert out.officers > 0
    assert out.window_days == 180
    assert out.competencies, "a cadre with gaps should have something to project"


def test_a_single_observation_is_not_a_rate(db):
    """One data point cannot be a trend, and saying so beats guessing."""
    out = forecast(db)
    for row in out.competencies:
        if row.observations < MIN_OBSERVATIONS:
            assert row.months_to_close is None
            assert "too few" in row.basis


def test_a_measured_rate_produces_a_projection_and_shows_its_arithmetic(db):
    projected = [r for r in forecast(db).competencies if r.months_to_close is not None]
    assert projected, "the seeded history should support at least one projection"
    for row in projected:
        assert row.observations >= MIN_OBSERVATIONS
        assert row.levels_per_month > 0
        # The reader must be able to check the number without reading the code.
        assert str(row.observations) in row.basis
        assert "levels/month" in row.basis


def test_a_stalled_competency_is_named_rather_than_projected(db):
    """Assessed repeatedly and going nowhere is a finding, not a forecast."""
    out = forecast(db)
    stalled = [
        r
        for r in out.competencies
        if r.observations >= MIN_OBSERVATIONS and r.months_to_close is None
    ]
    for row in stalled:
        assert "not gaining ground" in row.basis
        assert row.competency_name in out.widening


def test_losing_a_level_slows_the_projection_rather_than_being_dropped(db):
    """A retake that went backwards is evidence too."""
    user = db.scalar(select(User).where(User.id == "u-jso-farah"))
    assert user is not None

    _add(db, user.id, "C03", 1, 3, 90)
    db.flush()
    up = next(r for r in forecast(db).competencies if r.competency_id == "C03")

    _add(db, user.id, "C03", 3, 1, 30)   # and back down again
    db.flush()
    down = next(r for r in forecast(db).competencies if r.competency_id == "C03")

    assert down.levels_gained < up.levels_gained
    assert down.observations == up.observations + 1


def test_stalled_competencies_are_listed_before_unmeasured_ones(db):
    """An unmeasured competency is a data gap, not a capacity finding."""
    rows = forecast(db).competencies
    ranks = [
        0 if (r.observations >= MIN_OBSERVATIONS and r.months_to_close is None)
        else (1 if r.observations >= MIN_OBSERVATIONS else 2)
        for r in rows
    ]
    assert ranks == sorted(ranks), "ordering should not mix the three kinds"


def test_stalling_courses_report_where_training_is_leaking(db):
    out = forecast(db)
    for course in out.stalling_courses:
        assert course["completed"] < course["enrolled"]
        assert 0 <= course["avg_progress_pct"] <= 100


def test_the_endpoint_requires_an_administrator(client, admin_headers):
    assert client.get("/api/admin/forecast").status_code == 401
    body = client.get("/api/admin/forecast", headers=admin_headers).json()
    assert body["officers"] > 0
    assert "not a model" in body["note"]
