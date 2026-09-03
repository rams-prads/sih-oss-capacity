"""The full learner loop over the API, and the admin view (spec 8.3, 8.5, 8.6)."""
import io

SAMPLE = (
    "Stratified random sampling divides the population into homogeneous strata before "
    "drawing an independent sample from each stratum. This reduces the variance of the "
    "estimator relative to simple random sampling of the same size.\n\n"
    "The sampling frame is the list of units from which the sample is actually drawn, and "
    "any mismatch between the frame and the target population produces coverage error that "
    "weighting alone cannot repair.\n\n"
    "Probability proportional to size selection gives larger units a greater chance of "
    "inclusion, which improves efficiency when the study variable is correlated with the "
    "measure of size used for selection.\n\n"
    "Non-sampling error includes measurement error, processing error and non-response, and "
    "in large official surveys it frequently exceeds sampling error in magnitude.\n\n"
    "Imputation replaces a missing value with a plausible substitute derived from responding "
    "units, and the imputation method must be recorded so that variance estimates can "
    "account for the additional uncertainty introduced.\n\n"
    "Editing rules detect records that violate logical or arithmetic constraints, and "
    "selective editing concentrates limited review effort on the records whose correction "
    "would most change the published aggregate.\n\n"
    "A well designed questionnaire places sensitive questions late in the interview, after "
    "the respondent has committed time to the exercise and rapport has been established.\n\n"
    "Computer assisted personal interviewing enforces skip patterns and range checks at the "
    "point of collection, which removes an entire class of downstream editing work.\n"
)


def test_health_reports_the_active_backends(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["karmayogi_mode"] == "mock"


def test_taxonomy_endpoints(client):
    competencies = client.get("/api/competencies").json()
    assert len(competencies) == 36
    # Every competency domain the problem statement names has to be present,
    # including the administrative ladder the OSS actually runs on.
    assert {c["id"] for c in competencies} >= {"C01", "C15", "C20", "C22", "C24", "C29", "C31"}

    roles = client.get("/api/roles").json()
    # The real designation hierarchy, MTS through Secretary, in both streams.
    assert len(roles) == 17
    assert {r["id"] for r in roles} >= {"MTS", "JSO", "ASO", "SSO", "DDG", "SECY"}
    # Returned in hierarchy order, and each designation states its stream.
    assert [r["grade"] for r in roles] == sorted(r["grade"] for r in roles)
    assert all(r["stream"] for r in roles)
    jso = next(r for r in roles if r["id"] == "JSO")
    assert len(jso["requirements"]) == 8


def test_login_and_authenticated_identity(client):
    token = client.post(
        "/api/auth/login", json={"user_id": "u-jso-anita", "password": "officer123"}
    ).json()
    assert token["user"]["role_name"] == "Junior Statistical Officer"

    me = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token['access_token']}"}
    ).json()
    assert me["id"] == "u-jso-anita"


def test_enrolment_round_trip(client):
    """Enrol, then let progress come from watching a video - never set by hand."""
    response = client.post(
        "/api/users/u-jso-farah/enrolments", json={"course_identifier": "do_3137421900011"}
    )
    assert response.status_code == 201

    rows = client.get("/api/users/u-jso-farah/enrolments").json()
    assert any(r["course_identifier"] == "do_3137421900011" for r in rows)

    board = client.get("/api/users/u-jso-farah/learning").json()
    course = next(
        c for c in board["courses"] if c["course_identifier"] == "do_3137421900011"
    )
    assert course["status"] == "not_started"
    assert course["progress_pct"] == 0

    first_lesson = course["modules"][0]["lessons"][0]["id"]
    after = client.post(f"/api/users/u-jso-farah/lessons/{first_lesson}/complete").json()
    assert after["progress_pct"] > 0
    assert after["status"] == "in_progress"


def test_upload_generate_take_quiz_shrinks_the_gap(client):
    """AC 8.3 + 8.4: upload -> MCQs -> score -> attained level rises -> gap shrinks."""
    user_id = "u-jso-anita"  # C01 attained 1, JSO target 3
    before = client.get(f"/api/gaps/{user_id}").json()
    prior_gap = next(i for i in before["items"] if i["competency_id"] == "C01")["gap"]
    assert prior_gap > 0

    upload = client.post(
        "/api/materials",
        files={"file": ("sampling.txt", io.BytesIO(SAMPLE.encode()), "text/plain")},
    )
    assert upload.status_code == 201
    material_id = upload.json()["source_material_id"]

    generated = client.post(
        "/api/quizzes",
        json={"source_material_id": material_id, "competency_id": "C01", "num_questions": 6},
    )
    assert generated.status_code == 201
    body = generated.json()
    assert body["generated"] >= 5           # AC 8.3
    assert body["validity_rate"] > 0

    quiz = body["quiz"]
    for question in quiz["questions"]:
        assert len(question["options"]) == 4
        assert "answer_index" not in question   # answer key is not leaked to the learner

    full = client.get(f"/api/quizzes/{quiz['id']}").json()
    assert len(full["questions"]) == body["generated"]

    # Answer everything correctly by reading the key from the database.
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Question

    with SessionLocal() as session:
        answers = [
            q.answer_index
            for q in session.scalars(
                select(Question).where(Question.quiz_id == quiz["id"]).order_by(Question.position)
            )
        ]

    result = client.post(
        f"/api/quizzes/{quiz['id']}/submit", params={"user_id": user_id}, json={"answers": answers}
    ).json()

    assert result["score_pct"] == 100.0
    assert result["new_level"] > result["prior_level"]
    assert result["new_gap"] < result["prior_gap"]
    assert len(result["review"]) == len(answers)

    after = client.get(f"/api/gaps/{user_id}").json()
    new_gap = next(i for i in after["items"] if i["competency_id"] == "C01")["gap"]
    assert new_gap < prior_gap
    assert after["readiness_pct"] > before["readiness_pct"]


def test_quiz_rejects_a_mismatched_answer_count(client):
    upload = client.post(
        "/api/materials", files={"file": ("s.txt", io.BytesIO(SAMPLE.encode()), "text/plain")}
    ).json()
    quiz = client.post(
        "/api/quizzes",
        json={
            "source_material_id": upload["source_material_id"],
            "competency_id": "C03",
            "num_questions": 5,
        },
    ).json()["quiz"]

    response = client.post(
        f"/api/quizzes/{quiz['id']}/submit", params={"user_id": "u-jso-anita"}, json={"answers": [0]}
    )
    assert response.status_code == 400


def test_messy_upload_is_rejected_without_crashing(client):
    """AC 8.3: no crash on messy input."""
    response = client.post(
        "/api/materials", files={"file": ("tiny.txt", io.BytesIO(b"too short"), "text/plain")}
    )
    assert response.status_code in (201, 400)

    binary = client.post(
        "/api/materials",
        files={"file": ("image.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64), "image/png")},
    )
    assert binary.status_code == 400

    corrupt = client.post(
        "/api/materials",
        files={"file": ("broken.pdf", io.BytesIO(b"%PDF-1.4 not really a pdf"), "application/pdf")},
    )
    assert corrupt.status_code == 400


def _admin_headers(client):
    token = client.post(
        "/api/auth/login", json={"user_id": "u-admin-meera", "password": "admin123"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_admin_overview_and_metrics(client):
    """AC 8.6: heatmap and top gaps render from seeded multi-user data."""
    headers = _admin_headers(client)
    overview = client.get("/api/admin/overview", headers=headers).json()
    assert overview["officer_count"] >= 8
    assert overview["heatmap"]
    assert 1 <= len(overview["top_gaps"]) <= 3
    assert overview["catalogue_coverage_pct"] == 100.0
    for cohort in overview["cohort_recommendations"]:
        assert cohort["course"] is not None

    scoped = client.get(
        "/api/admin/overview",
        params={"department": "MoSPI - Field Operations Division"},
        headers=headers,
    ).json()
    assert scoped["officer_count"] == 2

    metrics = client.get("/api/admin/metrics", headers=headers).json()
    assert metrics["competencies"] == 36
    assert metrics["roles"] == 17
    # The catalogue is refreshed from the live iGOT API, so its exact size moves.
    assert metrics["catalogue_size"] > 100
    # No generated quizzes yet, so the validity rate has nothing to report on.
    assert metrics["mcq_validity_rate_pct"] == 0.0

    upload = client.post(
        "/api/materials", files={"file": ("s.txt", io.BytesIO(SAMPLE.encode()), "text/plain")}
    ).json()
    client.post(
        "/api/quizzes",
        json={
            "source_material_id": upload["source_material_id"],
            "competency_id": "C01",
            "num_questions": 6,
        },
    )
    assert client.get("/api/admin/metrics", headers=headers).json()["mcq_validity_rate_pct"] > 0
