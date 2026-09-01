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
    assert len(competencies) == 15
    assert {c["id"] for c in competencies} >= {"C01", "C15"}

    roles = client.get("/api/roles").json()
    assert {r["id"] for r in roles} == {"JSO", "SI", "DA"}
    jso = next(r for r in roles if r["id"] == "JSO")
    assert len(jso["requirements"]) == 7


def test_login_and_authenticated_identity(client):
    token = client.post("/api/auth/login", json={"user_id": "u-jso-anita"}).json()
    assert token["user"]["role_name"] == "Junior Statistical Officer"

    me = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token['access_token']}"}
    ).json()
    assert me["id"] == "u-jso-anita"


def test_enrolment_round_trip(client):
    response = client.post(
        "/api/users/u-jso-farah/enrolments", json={"course_identifier": "do_3137421900011"}
    )
    assert response.status_code == 201

    rows = client.get("/api/users/u-jso-farah/enrolments").json()
    assert any(r["course_identifier"] == "do_3137421900011" for r in rows)

    updated = client.patch(
        "/api/users/u-jso-farah/enrolments/do_3137421900011", json={"progress_pct": 100}
    ).json()
    assert updated["status"] == "completed"


def test_upload_generate_take_quiz_shrinks_the_gap(client):
    """AC 8.3 + 8.4: upload -> MCQs -> score -> attained level rises -> gap shrinks."""
    user_id = "u-jso-farah"  # C01 attained 2, JSO target 3
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


def test_admin_overview_and_metrics(client):
    """AC 8.6: heatmap and top gaps render from seeded multi-user data."""
    overview = client.get("/api/admin/overview").json()
    assert overview["officer_count"] >= 8
    assert overview["heatmap"]
    assert 1 <= len(overview["top_gaps"]) <= 3
    assert overview["catalogue_coverage_pct"] == 100.0
    for cohort in overview["cohort_recommendations"]:
        assert cohort["course"] is not None

    scoped = client.get(
        "/api/admin/overview", params={"department": "MoSPI - Field Operations Division"}
    ).json()
    assert scoped["officer_count"] == 2

    metrics = client.get("/api/admin/metrics").json()
    assert metrics["competencies"] == 15
    assert metrics["roles"] == 3
    assert metrics["catalogue_size"] == 26
    assert metrics["mcq_validity_rate_pct"] > 0
