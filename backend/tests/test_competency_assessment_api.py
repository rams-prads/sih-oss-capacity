"""Sitting a competency assessment straight from the bank, over the API.

This is the route that turns a self-reported level into a measured one, so it
is the one with the most to gain from being gamed - and it had no coverage at
all before the anti-cheating work went in.
"""
from sqlalchemy import func, select

from app.models import BankQuestion, RoleRequirement, Topic, User

USER = "u-jso-anita"


def _assessable_competency(db) -> str:
    """A competency this officer's role requires that has questions written."""
    role_id = db.get(User, USER).role_id
    required = [
        r.competency_id
        for r in db.scalars(
            select(RoleRequirement).where(RoleRequirement.role_id == role_id)
        ).all()
    ]
    counts = dict(
        db.execute(
            select(Topic.competency_id, func.count(BankQuestion.id))
            .join(BankQuestion, BankQuestion.topic_id == Topic.id)
            .group_by(Topic.competency_id)
        ).all()
    )
    for competency_id in required:
        if counts.get(competency_id, 0) > 0:
            return competency_id
    raise AssertionError("no required competency has any bank questions")


def _key_for(db, quiz) -> list[int]:
    """The correct option for each question the sitting actually served."""
    answers = {
        q.id: q.answer_index
        for q in db.scalars(
            select(BankQuestion).where(
                BankQuestion.id.in_([q["id"] for q in quiz["questions"]])
            )
        ).all()
    }
    return [answers[q["id"]] for q in quiz["questions"]]


def _open(client, competency_id):
    return client.get(f"/api/competency-assessment/{USER}/{competency_id}").json()


def _submit(client, competency_id, answers):
    return client.post(
        f"/api/competency-assessment/{USER}/{competency_id}/submit",
        json={"answers": answers},
    )


def test_a_sitting_never_ships_the_answer_key_with_the_questions(client, db):
    competency_id = _assessable_competency(db)
    quiz = _open(client, competency_id)
    assert quiz["questions"]
    assert all("answer_index" not in q for q in quiz["questions"])


def test_passing_releases_the_full_review(client, db):
    competency_id = _assessable_competency(db)
    quiz = _open(client, competency_id)

    body = _submit(client, competency_id, _key_for(db, quiz)).json()
    assert body["score_pct"] == 100.0
    assert body["passed"] is True
    assert len(body["items"]) == len(quiz["questions"])
    assert all(i["correct"] for i in body["items"])


def test_failing_withholds_the_review(client, db):
    """Otherwise a deliberate failure is the cheapest way to buy the answer
    key for a bank the next sitting draws from again."""
    competency_id = _assessable_competency(db)
    quiz = _open(client, competency_id)

    key = _key_for(db, quiz)
    wrong = [(answer + 1) % 4 for answer in key]
    body = _submit(client, competency_id, wrong).json()

    assert body["passed"] is False
    assert body["items"] == []
    # The score is still reported honestly - what is withheld is which ones.
    assert body["total"] == len(quiz["questions"])


def test_the_record_keeps_what_the_officer_was_not_shown(client, db):
    """Redaction is about the response, never about the measurement: the
    estimator has to see every answer or the level it reports is wrong."""
    competency_id = _assessable_competency(db)
    quiz = _open(client, competency_id)
    wrong = [(answer + 1) % 4 for answer in _key_for(db, quiz)]

    before = _open(client, competency_id)["attempt_no"]
    _submit(client, competency_id, wrong)
    after = _open(client, competency_id)

    assert after["attempt_no"] == before + 1
    assert after["evidence"] in {"measured", "provisional"}


def test_an_answer_outside_the_options_is_refused(client, db):
    competency_id = _assessable_competency(db)
    quiz = _open(client, competency_id)
    answers = [0] * len(quiz["questions"])

    answers[0] = -1
    assert _submit(client, competency_id, answers).status_code == 400
    answers[0] = 99
    assert _submit(client, competency_id, answers).status_code == 400


def test_the_answer_count_must_match(client, db):
    competency_id = _assessable_competency(db)
    assert _submit(client, competency_id, [0, 1]).status_code == 400


def test_sittings_are_throttled(client, db, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "checkpoint_cooldown_seconds", 60)

    competency_id = _assessable_competency(db)
    quiz = _open(client, competency_id)
    answers = [0] * len(quiz["questions"])

    assert _submit(client, competency_id, answers).status_code == 200
    throttled = _submit(client, competency_id, answers)
    assert throttled.status_code == 429
    assert "available in" in throttled.json()["detail"]
