"""What iGOT publishes about a course, as the about panel is served it."""
from app.integration.base import learning_outcomes

DEMO = "u-jso-anita"


def test_the_outcomes_are_the_bullets_the_author_wrote():
    html = (
        "</p><ul>"
        "<li>Develop&nbsp;custom&nbsp;User-Defined&nbsp;Functions&nbsp;(UDFs).</li>"
        "<li>Implement&nbsp;indexing&nbsp;strategies&nbsp;to&nbsp;accelerate&nbsp;queries.</li>"
        "</ul>"
    )
    assert learning_outcomes(html) == [
        "Develop custom User-Defined Functions (UDFs).",
        "Implement indexing strategies to accelerate queries.",
    ]


def test_entities_and_markup_inside_a_bullet_are_resolved():
    html = "<ul><li>Analyze a nation&rsquo;s <b>GDP</b> &amp; its drivers</li></ul>"
    assert learning_outcomes(html) == ["Analyze a nation’s GDP & its drivers"]


def test_prose_in_the_same_field_is_not_an_outcome():
    """A handful of courses use `instructions` for a case synopsis or an email."""
    assert learning_outcomes("<p>for any queries please contact eguru@ntpc.co.in</p>") == []
    assert learning_outcomes("") == []
    assert learning_outcomes("<p>This case study chronicles a transformation.</p>") == []


def test_the_catalogue_carries_the_about_fields(client):
    courses = client.get(f"/api/users/{DEMO}/learning").json()["courses"]
    igot = [c for c in courses if c["source"] == "igot"]
    assert igot, "the demo officer is enrolled in iGOT courses"

    assert any(c["learning_outcomes"] for c in igot), "iGOT publishes outcomes and they reach here"
    assert any(c["keywords"] for c in igot)
    assert any(c["rating"] for c in igot)
    assert any(c["difficulty"] for c in igot)
    assert any(c["certificate"] for c in igot)
    assert any(c["kcm"] for c in igot)

    for course in igot:
        assert course["rating"] <= 5
        assert course["rating_count"] >= 0
        assert course["difficulty"] in {"", "Beginner", "Intermediate", "Advanced"}
        assert course["published_on"] == "" or len(course["published_on"]) == 10
        for tag in course["kcm"]:
            assert tag["area"] or tag["theme"]
        for outcome in course["learning_outcomes"]:
            assert "<" not in outcome and "&nbsp;" not in outcome


def test_a_classroom_programme_is_not_dressed_up_as_an_igot_course(client):
    """NSSTA publishes none of this, and nothing invents it for them."""
    courses = client.get(f"/api/users/{DEMO}/learning").json()["courses"]
    for course in [c for c in courses if c["source"] == "nssta"]:
        assert course["learning_outcomes"] == []
        assert course["keywords"] == []
        assert course["rating"] == 0
        assert course["certificate"] is False
        assert course["kcm"] == []
