"""Department engagement: whether the cadre is actually studying, week on week."""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine, inspect, text

from app.db import Base


@pytest.fixture
def admin_headers(client):
    token = client.post(
        "/api/auth/login", json={"user_id": "u-admin-meera", "password": "admin123"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_requires_an_administrator(client):
    assert client.get("/api/admin/engagement").status_code == 401
    assert (
        client.get("/api/admin/engagement", headers={"X-User-Id": "u-admin-meera"}).status_code
        == 401
    )
    officer = client.post(
        "/api/auth/login", json={"user_id": "u-jso-anita", "password": "officer123"}
    ).json()["access_token"]
    assert (
        client.get(
            "/api/admin/engagement", headers={"Authorization": f"Bearer {officer}"}
        ).status_code
        == 403
    )


def test_the_numbers_add_up(client, admin_headers):
    body = client.get("/api/admin/engagement", headers=admin_headers).json()
    assert body["officer_count"] == 9
    assert len(body["weeks"]) == 8
    starts = [w["week_start"] for w in body["weeks"]]
    assert starts == sorted(starts)
    assert starts[-1] == body["week_start"]
    for week in body["weeks"]:
        assert 0 <= week["active_officers"] <= body["officer_count"]
    assert 0 <= body["goal_attainment_pct"] <= 100
    assert body["streak_7_plus"] <= body["streak_2_plus"] <= body["officer_count"]
    # The demo officer's recent study falls in this week or the last one.
    assert body["active_this_week"] + body["active_last_week"] >= 1
    assert body["streak_2_plus"] >= 1


def test_top_learners_are_named_and_ranked(client, admin_headers):
    body = client.get("/api/admin/engagement", headers=admin_headers).json()
    points = [row["points_this_week"] for row in body["top_learners"]]
    assert points == sorted(points, reverse=True)
    assert all(p > 0 for p in points)
    assert len(body["top_learners"]) <= 5
    for row in body["top_learners"]:
        assert row["name"] and row["role_name"]


def test_most_studied_courses_count_real_viewing(client, admin_headers):
    body = client.get("/api/admin/engagement", headers=admin_headers).json()
    assert body["most_studied_courses"]
    watched = [c["lessons_watched"] for c in body["most_studied_courses"]]
    assert watched == sorted(watched, reverse=True)
    for course in body["most_studied_courses"]:
        assert course["officers"] >= 1
        assert course["lessons_watched"] >= course["officers"]


def test_scoping_to_a_department(client, admin_headers):
    body = client.get(
        "/api/admin/engagement",
        headers=admin_headers,
        params={"department": "MoSPI - Field Operations Division"},
    ).json()
    assert body["officer_count"] == 2
    assert body["department"] == "MoSPI - Field Operations Division"
    assert (
        client.get(
            "/api/admin/engagement", headers=admin_headers, params={"department": "Nowhere"}
        ).status_code
        == 404
    )


def test_startup_adds_the_goals_table_to_an_existing_database(tmp_path):
    """A database from before this feature gains the table and loses nothing.

    This is exactly what init_db does at startup - create_all creates the tables
    that are missing and leaves every existing one, and its rows, alone.
    """
    from app import models  # noqa: F401  (register every table)

    engine = create_engine(f"sqlite:///{(tmp_path / 'before.db').as_posix()}")
    existing = [t for name, t in Base.metadata.tables.items() if name != "learning_goals"]
    Base.metadata.create_all(bind=engine, tables=existing)
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO roles (id, name, description, stream, grade) VALUES ('JSO', 'Junior Statistical Officer', '', 'Statistical', 3)"))
        conn.execute(text("INSERT INTO users (id, name, email, role_id, department, is_admin, password_hash) VALUES ('u-old', 'Old Officer', '', 'JSO', 'MoSPI', 0, '')"))
    assert "learning_goals" not in inspect(engine).get_table_names()

    Base.metadata.create_all(bind=engine)

    assert "learning_goals" in inspect(engine).get_table_names()
    with engine.connect() as conn:
        assert conn.execute(text("SELECT name FROM users WHERE id = 'u-old'")).scalar() == "Old Officer"
    engine.dispose()
