"""Registering an officer and establishing their starting proficiency."""
from sqlalchemy import select

from app.models import BankQuestion


NEW_OFFICER = {
    "name": "Priya Nair",
    "role_id": "JSO",
    "department": "MoSPI - National Statistical Office",
    "email": "priya.nair@example.gov.in",
    "password": "officer123",
}


def _register(client, **overrides):
    payload = {**NEW_OFFICER, **overrides}
    return client.post("/api/users", json=payload)


def _answer_key(db):
    return {q.id: q.answer_index for q in db.scalars(select(BankQuestion)).all()}


def test_registration_creates_an_officer_against_a_real_designation(client):
    response = _register(client)
    assert response.status_code == 201
    body = response.json()
    assert body["role_id"] == "JSO"
    assert body["role_name"] == "Junior Statistical Officer"
    assert body["is_admin"] is False

    # And they can sign in with the password they chose.
    token = client.post(
        "/api/auth/login", json={"user_id": body["id"], "password": "officer123"}
    )
    assert token.status_code == 200


def test_registration_rejects_an_unknown_designation(client):
    assert _register(client, role_id="NOPE").status_code == 404


def test_registration_rejects_a_duplicate_email(client):
    assert _register(client).status_code == 201
    assert _register(client).status_code == 409


def test_a_new_officer_starts_with_no_measured_competencies(client):
    user_id = _register(client).json()["id"]
    gaps = client.get(f"/api/gaps/{user_id}").json()
    assert gaps["readiness_pct"] == 0.0
    assert all(item["attained_level"] == 0 for item in gaps["items"])


def test_the_baseline_covers_the_designation_and_names_what_it_cannot_measure(client):
    user_id = _register(client).json()["id"]
    body = client.get(f"/api/assessment/{user_id}").json()

    assert body["questions"], "a JSO must have something to be assessed on"
    asked = {q["competency_id"] for q in body["questions"]}
    assert asked == set(body["competencies_assessed"])

    roles = client.get("/api/roles").json()
    required = {
        r["competency_id"]
        for role in roles
        if role["id"] == "JSO"
        for r in role["requirements"]
    }
    assert asked <= required, "the baseline must not test what the job does not need"
    # Anything the bank cannot cover is named rather than silently scored zero.
    assert body["competencies_without_questions"]


def test_the_baseline_sets_levels_from_what_was_answered(client, db):
    user_id = _register(client).json()["id"]
    body = client.get(f"/api/assessment/{user_id}").json()
    key = _answer_key(db)

    strong = body["questions"][0]["competency_id"]
    answers = [
        {
            "question_id": q["question_id"],
            "answer_index": key[q["question_id"]]
            if q["competency_id"] == strong
            else (key[q["question_id"]] + 1) % 4,
        }
        for q in body["questions"]
    ]
    result = client.post(f"/api/assessment/{user_id}/submit", json={"answers": answers}).json()

    by_competency = {e["competency_id"]: e for e in result["estimates"]}
    assert by_competency[strong]["attained_level"] > 0
    others = [e for cid, e in by_competency.items() if cid != strong]
    assert all(e["attained_level"] == 0 for e in others)

    # Readiness is no longer zero, because something has actually been measured.
    assert client.get(f"/api/gaps/{user_id}").json()["readiness_pct"] > 0


def test_a_short_baseline_cannot_certify_an_expert(client, db):
    """Three right answers is not evidence of mastery."""
    from app.routers.onboarding import BASELINE_CEILING

    user_id = _register(client).json()["id"]
    body = client.get(f"/api/assessment/{user_id}").json()
    key = _answer_key(db)
    answers = [
        {"question_id": q["question_id"], "answer_index": key[q["question_id"]]}
        for q in body["questions"]
    ]
    result = client.post(f"/api/assessment/{user_id}/submit", json={"answers": answers}).json()

    assert result["score_pct"] == 100.0
    assert all(e["attained_level"] <= BASELINE_CEILING for e in result["estimates"])
    assert BASELINE_CEILING < 4


def test_submitting_nothing_is_rejected(client):
    user_id = _register(client).json()["id"]
    assert client.post(f"/api/assessment/{user_id}/submit", json={"answers": []}).status_code == 400


def test_assessment_requires_a_real_user(client):
    assert client.get("/api/assessment/nobody").status_code == 404
