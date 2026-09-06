"""Officer feedback and the administrator's inbox for it."""

OFFICER = {"X-User-Id": "u-jso-anita"}
OTHER_OFFICER = {"X-User-Id": "u-jso-rakesh"}


def admin_headers(client):
    token = client.post(
        "/api/auth/login", json={"user_id": "u-admin-meera", "password": "admin123"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def send(client, headers=None, **over):
    payload = {
        "category": "platform",
        "subject": "The rail tooltips are slow",
        "message": "The navigation labels take a moment to appear on first hover.",
        "rating": 4,
    }
    payload.update(over)
    # `or OFFICER` would quietly re-authenticate the anonymous case.
    return client.post(
        "/api/feedback", json=payload, headers=OFFICER if headers is None else headers
    )


def test_an_officer_can_send_feedback(client):
    response = send(client)
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "new"
    assert body["user_id"] == "u-jso-anita"
    # Named at the point of submission, so the inbox does not have to guess.
    assert body["user_name"]
    assert body["category_label"] == "Platform and usability"


def test_feedback_is_attributed_to_the_caller_not_to_a_field(client):
    """The body carries no user id, so nobody can write in as somebody else."""
    body = send(client, headers=OTHER_OFFICER, user_id="u-jso-anita").json()
    assert body["user_id"] == "u-jso-rakesh"


def test_anonymous_callers_cannot_send_feedback(client):
    assert send(client, headers={}).status_code == 401


def test_a_message_too_short_to_act_on_is_rejected(client):
    assert send(client, message="broken").status_code == 422


def test_an_unknown_category_is_filed_rather_than_lost(client):
    """Losing somebody's words over a select box would be absurd."""
    body = send(client, category="not-a-category").json()
    assert body["category"] == "other"


def test_a_rating_outside_the_scale_is_rejected(client):
    assert send(client, rating=9).status_code == 422
    assert send(client, rating=None).status_code == 201


def test_an_officer_sees_only_their_own_submissions(client):
    send(client, headers=OFFICER, subject="Mine")
    send(client, headers=OTHER_OFFICER, subject="Theirs")

    mine = client.get("/api/feedback/mine", headers=OFFICER).json()
    assert [row["subject"] for row in mine] == ["Mine"]


def test_the_inbox_needs_an_administrator(client):
    send(client)
    assert client.get("/api/admin/feedback").status_code == 401
    # The officer header is not a way in, here as anywhere else.
    assert client.get("/api/admin/feedback", headers=OFFICER).status_code == 401


def test_the_inbox_carries_every_officers_feedback(client):
    send(client, headers=OFFICER, subject="Mine")
    send(client, headers=OTHER_OFFICER, subject="Theirs")

    inbox = client.get("/api/admin/feedback", headers=admin_headers(client)).json()
    assert inbox["total"] == 2
    assert inbox["new_count"] == 2
    assert {row["subject"] for row in inbox["items"]} == {"Mine", "Theirs"}
    # Who wrote in matters as much as what they wrote.
    assert all(row["user_name"] and row["department"] for row in inbox["items"])


def test_filtering_the_inbox_does_not_rewrite_its_counts(client):
    """The tab that says "12 new" must still say 12 once it is selected."""
    headers = admin_headers(client)
    send(client, category="platform")
    send(client, category="assessments")

    filtered = client.get(
        "/api/admin/feedback", params={"category": "platform"}, headers=headers
    ).json()
    assert len(filtered["items"]) == 1
    assert filtered["total"] == 2
    assert filtered["new_count"] == 2


def test_the_breakdown_reports_a_rating_per_category(client):
    headers = admin_headers(client)
    send(client, category="platform", rating=2)
    send(client, category="platform", rating=4)
    send(client, category="assessments", rating=None)

    inbox = client.get("/api/admin/feedback", headers=headers).json()
    by_category = {row["category"]: row for row in inbox["by_category"]}
    assert by_category["platform"]["avg_rating"] == 3.0
    # Unrated feedback is counted but must not be scored as a zero.
    assert by_category["assessments"]["avg_rating"] is None
    assert by_category["assessments"]["count"] == 1
    assert inbox["rated_count"] == 2
    assert inbox["avg_rating"] == 3.0
    # Only categories anybody actually used.
    assert set(by_category) == {"platform", "assessments"}


def test_an_administrator_answers_and_the_officer_sees_the_answer(client):
    """The reply going back is what makes the form worth using twice."""
    feedback_id = send(client).json()["id"]

    handled = client.patch(
        f"/api/admin/feedback/{feedback_id}",
        json={"status": "actioned", "admin_note": "Fixed in this week's release."},
        headers=admin_headers(client),
    ).json()
    assert handled["status"] == "actioned"
    assert handled["handled_at"]

    mine = client.get("/api/feedback/mine", headers=OFFICER).json()
    assert mine[0]["status"] == "actioned"
    assert mine[0]["admin_note"] == "Fixed in this week's release."


def test_a_note_can_be_added_without_moving_the_status(client):
    feedback_id = send(client).json()["id"]
    body = client.patch(
        f"/api/admin/feedback/{feedback_id}",
        json={"admin_note": "Asked the content team."},
        headers=admin_headers(client),
    ).json()
    assert body["admin_note"] == "Asked the content team."
    assert body["status"] == "new"
    # Put back to new is a declaration that it has not been handled.
    assert body["handled_at"] is None


def test_an_unknown_status_is_rejected(client):
    feedback_id = send(client).json()["id"]
    response = client.patch(
        f"/api/admin/feedback/{feedback_id}",
        json={"status": "wontfix"},
        headers=admin_headers(client),
    )
    assert response.status_code == 400


def test_only_an_administrator_can_answer(client):
    feedback_id = send(client).json()["id"]
    response = client.patch(
        f"/api/admin/feedback/{feedback_id}",
        json={"status": "actioned"},
        headers=OFFICER,
    )
    assert response.status_code == 401


def test_answering_something_that_is_not_there(client):
    response = client.patch(
        "/api/admin/feedback/9999", json={"status": "reviewed"}, headers=admin_headers(client)
    )
    assert response.status_code == 404
