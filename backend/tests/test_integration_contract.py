"""The mock must mirror the Sunbird envelope exactly (spec 7.3, 7.4)."""
from app.integration.base import KarmayogiClient
from app.integration.mock import MockKarmayogiClient


def test_mock_satisfies_the_client_protocol():
    assert isinstance(MockKarmayogiClient(), KarmayogiClient)


def test_real_client_satisfies_the_same_protocol():
    """SunbirdKarmayogiClient must be a drop-in swap, without constructing it."""
    from app.integration.sunbird import SunbirdKarmayogiClient

    for method in ("search_courses", "read_course", "enrol", "get_progress"):
        assert callable(getattr(SunbirdKarmayogiClient, method))
    assert SunbirdKarmayogiClient.mode == "sunbird"


def test_search_response_uses_the_sunbird_envelope():
    payload = MockKarmayogiClient().search_response(["C01"], max_level=3)

    assert payload["id"] == "api.content.search"
    assert payload["ver"] == "1.0"
    assert payload["params"]["status"] == "successful"
    assert payload["responseCode"] == "OK"
    assert payload["result"]["count"] == len(payload["result"]["content"])

    node = payload["result"]["content"][0]
    for field in ("identifier", "name", "se_competencies", "targetLevel", "duration", "provider"):
        assert field in node


def test_search_filters_by_competency_and_level():
    client = MockKarmayogiClient()
    courses = client.search_courses(["C01"], max_level=2)
    assert courses
    for course in courses:
        assert "C01" in course.competency_ids
        assert course.target_level <= 2


def test_read_course_maps_duration_to_minutes():
    course = MockKarmayogiClient().read_course("do_3137421900011")
    assert course is not None
    assert course.duration_min == 90  # 5400 seconds
    assert MockKarmayogiClient().read_course("do_nonexistent") is None


def test_http_sandbox_speaks_the_contract(client):
    """The /mock-sunbird service returns what the real gateway would."""
    response = client.post(
        "/mock-sunbird/content/v1/search",
        json={"request": {"filters": {"primaryCategory": ["Course"], "se_competencies": ["C03"]}}},
    )
    body = response.json()
    assert response.status_code == 200
    assert body["responseCode"] == "OK"
    assert body["result"]["count"] > 0

    enrol = client.post(
        "/mock-sunbird/course/v1/enrol",
        json={"request": {"userId": "u-jso-anita", "courseId": "do_3137421900015"}},
    )
    assert enrol.json()["result"]["response"] == "SUCCESS"

    listing = client.get("/mock-sunbird/course/v1/user/enrollment/list/u-jso-anita")
    assert listing.json()["result"]["courses"][0]["courseId"] == "do_3137421900015"
