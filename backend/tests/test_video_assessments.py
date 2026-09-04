"""Module assessments generated from the lesson videos themselves."""
import io
import json
from pathlib import Path

import pytest
from sqlalchemy import select

from app.models import BankQuestion, Checkpoint, Topic

SEED = Path(__file__).resolve().parents[1] / "seed" / "igot_video_questions.json"
USER = "u-jso-anita"


def _generated():
    if not SEED.exists():
        return {}
    return json.load(io.open(SEED, encoding="utf-8")).get("courses", {})


generated = _generated()
needs_seed = pytest.mark.skipif(
    not generated, reason="no generated video questions committed yet"
)


@needs_seed
def test_every_generated_question_is_well_formed():
    """The generator validates before writing; this guards the committed file."""
    from app.quiz.service import validate_question
    from app.llm.base import GeneratedQuestion

    total = 0
    for course in generated.values():
        for module in course["modules"]:
            assert module["questions"], "a module with no questions should not be written"
            for row in module["questions"]:
                question = GeneratedQuestion.model_validate(row)
                assert validate_question(question), question.stem
                assert question.explanation, "an assessment must explain its answer"
                total += 1
    assert total >= 4


@needs_seed
def test_generated_questions_become_takeable_assessments(db):
    """Seeding turns the file into topics, questions and module checkpoints."""
    course_id, course = next(iter(generated.items()))
    checkpoints = db.scalars(
        select(Checkpoint).where(Checkpoint.course_identifier == course_id)
    ).all()
    assert len(checkpoints) == len(course["modules"])

    for checkpoint in checkpoints:
        topic = db.get(Topic, checkpoint.topic_id)
        assert topic is not None, "each module assessment needs its own topic"
        questions = db.scalars(
            select(BankQuestion).where(BankQuestion.topic_id == checkpoint.topic_id)
        ).all()
        assert questions, f"{checkpoint.title} has no questions"


@needs_seed
def test_a_video_assessed_course_has_no_duplicate_course_level_quiz(db):
    """Its modules carry the assessments, so the bank must not add another."""
    course_id, course = next(iter(generated.items()))
    module_indices = {m["module_index"] for m in course["modules"]}
    checkpoints = db.scalars(
        select(Checkpoint).where(Checkpoint.course_identifier == course_id)
    ).all()
    assert {c.module_index for c in checkpoints} == module_indices


@needs_seed
def test_the_assessment_gates_on_its_own_module(client, db):
    """Locked until that module's videos are watched, then takeable."""
    course_id, course = next(iter(generated.items()))
    assert client.post(
        f"/api/users/{USER}/enrolments", json={"course_identifier": course_id}
    ).status_code == 201

    board = client.get(f"/api/users/{USER}/learning").json()
    entry = next(c for c in board["courses"] if c["course_identifier"] == course_id)
    module = next(m for m in entry["modules"] if m["checkpoint_id"] is not None and m["lessons"])
    assert module["checkpoint_unlocked"] is False

    for lesson in module["lessons"]:
        client.post(f"/api/users/{USER}/lessons/{lesson['id']}/complete")

    board = client.get(f"/api/users/{USER}/learning").json()
    entry = next(c for c in board["courses"] if c["course_identifier"] == course_id)
    reopened = next(m for m in entry["modules"] if m["checkpoint_id"] == module["checkpoint_id"])
    assert reopened["checkpoint_unlocked"] is True

    quiz = client.get(
        f"/api/checkpoints/{module['checkpoint_id']}", params={"user_id": USER}
    ).json()
    assert quiz["questions"]
    assert all("answer_index" not in q for q in quiz["questions"]), "answer key leaked"
