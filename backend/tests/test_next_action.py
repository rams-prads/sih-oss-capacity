"""The next best action: what to do next, and why.

It decides between things the gap engine and the recommender already produce,
so most of what is tested here is the order it takes them in - and that the
reason it gives is the evidence it actually acted on.
"""
from __future__ import annotations

from app.engines import momentum as engine
from app.integration.base import Course
from app.schemas import GapItem, GapReport

DEMO = "u-jso-anita"


def test_measure_before_training_when_the_level_is_self_reported(client):
    """The gap engine's own rule: a shortfall nobody has measured is a guess."""
    best = client.get(f"/api/users/{DEMO}/next-action").json()["best_action"]
    gaps = client.get(f"/api/gaps/{DEMO}").json()["items"]
    top = next(i for i in gaps if i["gap"] > 0)

    assert best["kind"] == "assess"
    assert best["competency_id"] == top["competency_id"]
    assert best["evidence"] == top["evidence"] == "self_reported"
    assert "self-reported" in best["reason"]
    assert best["points"] == engine.points(engine.ASSESSMENT_SAT)


def test_continue_learning_is_the_course_in_progress_most_recently_studied(client):
    card = client.get(f"/api/users/{DEMO}/next-action").json()["continue_learning"]
    board = client.get(f"/api/users/{DEMO}/learning").json()
    course = next(c for c in board["courses"] if c["course_identifier"] == card["course_identifier"])

    assert card["status"] == "in_progress" == course["status"]
    assert card["progress_pct"] == course["progress_pct"]
    assert card["next_kind"] == "lesson"
    assert card["next_lesson_id"] == course["next_action"]["lesson_id"]
    assert card["lessons_remaining"] == course["lessons_total"] - course["lessons_completed"]
    # The seeded recent study is on this course: it was the last thing opened.
    assert card["last_studied_on"] is not None
    assert card["closes_gap"] is not None
    assert card["points_available"] >= card["lessons_remaining"] * engine.points(engine.LESSON)


# --- the order of preference, on a controlled record --------------------------
def _gap(cid: str, name: str, *, gap: int, action: str, evidence: str) -> GapItem:
    return GapItem(
        competency_id=cid,
        competency_name=name,
        competency_type="DOMAIN",
        target_level=3,
        attained_level=3 - gap,
        gap=gap,
        weight=1.0,
        weighted_gap=float(gap),
        meets_target=gap == 0,
        evidence=evidence,
        confidence_pct=90.0 if evidence == "measured" else 0.0,
        level_low=3 - gap,
        level_high=3 - gap,
        questions_answered=12 if evidence == "measured" else 0,
        recommended_action=action,
    )


def _report(items: list[GapItem]) -> GapReport:
    return GapReport(
        user_id=DEMO,
        user_name="Anita Deshmukh",
        role_id="JSO",
        role_name="Junior Statistical Officer",
        department="MoSPI",
        items=items,
        total_weighted_gap=sum(i.weighted_gap for i in items),
        max_weighted_gap=9.0,
        readiness_pct=50.0,
    )


class _Catalogue:
    mode = "mock"

    def __init__(self, courses: list[Course]):
        self.courses = courses

    def search_courses(self, competency_ids, max_level):
        return [c for c in self.courses if set(competency_ids) & set(c.competency_ids)]

    def read_course(self, identifier):
        return next((c for c in self.courses if c.identifier == identifier), None)


def _course_state(identifier: str, competency_ids: list[str], status: str = "in_progress") -> dict:
    return {
        "identifier": identifier,
        "name": f"Course {identifier}",
        "catalogue": Course(identifier=identifier, name=f"Course {identifier}", competency_ids=competency_ids),
        "competency_ids": competency_ids,
        "status": status,
        "progress": {"progress_pct": 40, "modules": []},
        "next_action": {"kind": "lesson", "lesson_id": 1, "label": "Lesson one"},
        "lessons": {},
        "unwatched_minutes": [10],
        "last_studied_at": None,
        "enrolled_at": None,
    }


def test_an_enrolled_course_on_a_measured_gap_is_continued(db):
    report = _report([_gap("C01", "Sampling", gap=2, action="train", evidence="measured")])
    courses = [_course_state("do_mine", ["C01"])]
    best = engine._best_action(db, _Catalogue([]), DEMO, report, courses, bank={"C01"})
    assert best["kind"] == "continue"
    assert best["enrolled"] is True
    assert best["course_progress_pct"] == 40
    assert "Sampling" in best["reason"]


def test_a_measured_gap_with_nothing_enrolled_starts_the_recommenders_course(db):
    report = _report([_gap("C01", "Sampling", gap=2, action="train", evidence="measured")])
    catalogue = _Catalogue(
        [Course(identifier="do_rec", name="Sampling in Practice", competency_ids=["C01"], target_level=3)]
    )
    best = engine._best_action(db, catalogue, DEMO, report, [], bank={"C01"})
    assert best["kind"] == "start"
    assert best["course"]["identifier"] == "do_rec"
    # The reason is the recommender's own, not a second opinion.
    assert best["reason"].startswith("Closes your Sampling gap")
    assert best["cta_label"] == "Start training"


def test_a_classroom_programme_asks_for_a_place_rather_than_starting(db):
    report = _report([_gap("C01", "Sampling", gap=2, action="train", evidence="measured")])
    catalogue = _Catalogue(
        [
            Course(
                identifier="nssta_1",
                name="Sampling Workshop",
                competency_ids=["C01"],
                target_level=3,
                source="nssta",
            )
        ]
    )
    best = engine._best_action(db, catalogue, DEMO, report, [], bank=set())
    assert best["kind"] == "start"
    assert best["cta_label"] == "Request a place"


def test_an_unmeasurable_gap_falls_through_to_training(db):
    """Assess only where the bank can: otherwise the advice would be a dead end."""
    report = _report([_gap("C99", "Unwritten", gap=1, action="assess", evidence="self_reported")])
    catalogue = _Catalogue(
        [Course(identifier="do_c99", name="Unwritten Basics", competency_ids=["C99"], target_level=3)]
    )
    best = engine._best_action(db, catalogue, DEMO, report, [], bank=set())
    assert best["kind"] == "start"
    assert "No assessment covers it yet" in best["reason"]


def test_with_every_requirement_met_it_prepares_for_the_next_designation(db):
    report = _report([_gap("C01", "Sampling", gap=0, action="maintain", evidence="measured")])
    best = engine._best_action(db, _Catalogue([]), DEMO, report, [], bank={"C01"})
    assert best["kind"] == "progress"
    assert "Senior Statistical Officer" in best["headline"]
