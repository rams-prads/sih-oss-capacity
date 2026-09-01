"""Login and the administrator guard."""
from app.security import hash_password, verify_password


def test_password_hash_round_trip():
    stored = hash_password("officer123")
    assert stored.startswith("pbkdf2_sha256$")
    assert "officer123" not in stored
    assert verify_password("officer123", stored)
    assert not verify_password("officer124", stored)


def test_same_password_hashes_differently_each_time():
    """A per-password salt means identical passwords do not collide in the table."""
    assert hash_password("officer123") != hash_password("officer123")


def test_verify_rejects_garbage_without_raising():
    assert not verify_password("x", "")
    assert not verify_password("x", "not-a-hash")
    assert not verify_password("x", "md5$1$aa$bb")


def test_login_succeeds_with_the_right_password(client):
    body = client.post(
        "/api/auth/login", json={"user_id": "u-jso-anita", "password": "officer123"}
    ).json()
    assert body["user"]["id"] == "u-jso-anita"
    assert body["access_token"]


def test_login_rejects_a_wrong_password(client):
    response = client.post(
        "/api/auth/login", json={"user_id": "u-jso-anita", "password": "wrong"}
    )
    assert response.status_code == 401


def test_login_does_not_reveal_whether_an_officer_exists(client):
    """Both failures must look identical, or the endpoint enumerates ids."""
    missing = client.post("/api/auth/login", json={"user_id": "nobody", "password": "x"})
    wrong = client.post("/api/auth/login", json={"user_id": "u-jso-anita", "password": "x"})
    assert missing.status_code == wrong.status_code == 401
    assert missing.json()["detail"] == wrong.json()["detail"]


def test_admin_analytics_reject_an_anonymous_caller(client):
    for path in ("/api/admin/overview", "/api/admin/metrics"):
        assert client.get(path).status_code == 401


def test_the_demo_header_never_grants_admin_access(client):
    """X-User-Id is a convenience for switching officers, not a way in."""
    response = client.get("/api/admin/overview", headers={"X-User-Id": "u-admin-meera"})
    assert response.status_code == 401


def test_a_signed_in_non_admin_is_forbidden(client):
    token = client.post(
        "/api/auth/login", json={"user_id": "u-jso-anita", "password": "officer123"}
    ).json()["access_token"]
    response = client.get(
        "/api/admin/overview", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403


def test_a_signed_in_admin_is_allowed(client):
    token = client.post(
        "/api/auth/login", json={"user_id": "u-admin-meera", "password": "admin123"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/admin/overview", headers=headers).status_code == 200
    assert client.get("/api/admin/metrics", headers=headers).status_code == 200


def test_a_tampered_token_is_rejected(client):
    token = client.post(
        "/api/auth/login", json={"user_id": "u-admin-meera", "password": "admin123"}
    ).json()["access_token"]
    response = client.get(
        "/api/admin/overview", headers={"Authorization": f"Bearer {token[:-3]}abc"}
    )
    assert response.status_code == 401
