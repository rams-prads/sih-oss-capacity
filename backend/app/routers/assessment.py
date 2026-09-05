"""Assessing one competency directly, without a course or an upload.

The gap report tells an officer where they fall short and offers to assess
them. Until now that button led to the quiz generator, which needs a document
uploaded before it can ask anything - so proving you know sampling theory
required first finding a file about sampling theory. The question bank already
holds topic-tagged questions for these competencies; this serves them.

The important part is what a sitting is recorded as. The generator writes an
AssessmentResult and a UserCompetency level, which the gap engine reads as
`self_reported` - the weakest evidence tier. A sitting here is written as a
CheckpointAttempt instead, which is the only thing the IRT estimator reads, so
answering questions here is what actually moves an officer from "we are taking
your word for it" towards "this was measured".
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import DbSession
from app.engines.gap import compute_gaps
from app.models import (
    BankQuestion,
    Checkpoint,
    CheckpointAttempt,
    Competency,
    Topic,
    User,
)
from app.schemas import (
    CheckpointItemResult,
    CompetencyAssessmentOut,
    CompetencyAssessmentQuestion,
    CompetencyAssessmentResultOut,
    CompetencyAssessmentSubmitRequest,
)

router = APIRouter(tags=["assessment"])

# Twelve is the most the bank can usually spread across one competency's topics
# while keeping a difficulty range, and it is about as long as an officer will
# sit through in one go.
MAX_QUESTIONS = 12

# These sittings are not part of any course, but CheckpointAttempt is bound to a
# checkpoint and a checkpoint to a course. Rather than making those columns
# nullable - which create_all cannot apply to databases that already exist -
# self-assessments live under one reserved course identifier. Nobody enrols in
# it, so it never appears in a learning dashboard.
SELF_COURSE = "self-assessment"


def _competency_topics(db: DbSession, competency_id: str) -> list[Topic]:
    return list(
        db.scalars(
            select(Topic).where(Topic.competency_id == competency_id).order_by(Topic.id)
        ).all()
    )


def _questions(db: DbSession, topic_ids: list[str]) -> list[BankQuestion]:
    """A difficulty-spread selection, chosen the same way on both requests.

    Submission re-derives this list rather than trusting the client to send the
    questions back, so the two must agree. Ordering is therefore fully
    determined by stored columns, never by insertion order alone.
    """
    if not topic_ids:
        return []
    rows = list(
        db.scalars(
            select(BankQuestion)
            .where(BankQuestion.topic_id.in_(topic_ids))
            .order_by(BankQuestion.difficulty, BankQuestion.id)
        ).all()
    )
    if len(rows) <= MAX_QUESTIONS:
        return rows
    # Take every nth item so the sitting spans easy to hard. A run of easy
    # questions would flatter every officer equally and measure nothing.
    step = max(1, len(rows) // MAX_QUESTIONS)
    return rows[::step][:MAX_QUESTIONS]


def _state(db: DbSession, user_id: str, competency_id: str):
    """This officer's current standing on one competency, from the gap report."""
    report = compute_gaps(db, user_id)
    for item in report.items:
        if item.competency_id == competency_id:
            return report, item
    return report, None


def _checkpoint_for(db: DbSession, topic: Topic) -> Checkpoint:
    """The reserved checkpoint that self-assessments on this topic hang from."""
    existing = db.scalar(
        select(Checkpoint).where(
            Checkpoint.course_identifier == SELF_COURSE,
            Checkpoint.topic_id == topic.id,
        )
    )
    if existing is not None:
        return existing

    used = db.scalars(
        select(Checkpoint.module_index).where(
            Checkpoint.course_identifier == SELF_COURSE
        )
    ).all()
    checkpoint = Checkpoint(
        course_identifier=SELF_COURSE,
        module_index=(max(used) + 1 if used else 0),
        title=f"Self-assessment: {topic.name}"[:300],
        topic_id=topic.id,
        pass_pct=60,
    )
    db.add(checkpoint)
    db.flush()
    return checkpoint


@router.get(
    "/competency-assessment/{user_id}/{competency_id}",
    response_model=CompetencyAssessmentOut,
)
def competency_assessment(user_id: str, competency_id: str, db: DbSession):
    """The questions that would establish this officer's level on one competency."""
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    competency = db.get(Competency, competency_id)
    if competency is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Competency not found")

    topics = _competency_topics(db, competency_id)
    names = {t.id: t.name for t in topics}
    rows = _questions(db, [t.id for t in topics])
    if not rows:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"No questions have been written for {competency.name} yet",
        )

    _, item = _state(db, user_id, competency_id)
    prior = db.scalars(
        select(CheckpointAttempt).where(
            CheckpointAttempt.user_id == user_id,
            CheckpointAttempt.course_identifier == SELF_COURSE,
            CheckpointAttempt.topic_id.in_([t.id for t in topics]),
        )
    ).all()

    return CompetencyAssessmentOut(
        user_id=user_id,
        competency_id=competency_id,
        competency_name=competency.name,
        target_level=item.target_level if item else 0,
        attained_level=item.attained_level if item else 0,
        gap=item.gap if item else 0,
        evidence=item.evidence if item else "unmeasured",
        attempt_no=len(prior) + 1,
        questions=[
            CompetencyAssessmentQuestion(
                id=q.id,
                topic_id=q.topic_id,
                topic_name=names.get(q.topic_id, q.topic_id),
                stem=q.stem,
                options=q.options,
                difficulty=q.difficulty,
            )
            for q in rows
        ],
    )


@router.post(
    "/competency-assessment/{user_id}/{competency_id}/submit",
    response_model=CompetencyAssessmentResultOut,
)
def submit_competency_assessment(
    user_id: str,
    competency_id: str,
    payload: CompetencyAssessmentSubmitRequest,
    db: DbSession,
):
    """Score a sitting, record it as measurement, and report what it moved."""
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    competency = db.get(Competency, competency_id)
    if competency is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Competency not found")

    topics = {t.id: t for t in _competency_topics(db, competency_id)}
    rows = _questions(db, list(topics))
    if not rows:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"No questions have been written for {competency.name} yet",
        )
    if len(payload.answers) != len(rows):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Expected {len(rows)} answers, received {len(payload.answers)}",
        )

    # Read the before-state while the new attempt is still unwritten.
    before_report, before_item = _state(db, user_id, competency_id)

    items: list[dict] = []
    results: list[CheckpointItemResult] = []
    for answer, question in zip(payload.answers, rows):
        correct = answer == question.answer_index
        # Each item carries its own topic, so one sitting can span every topic
        # under the competency and still be attributed correctly.
        items.append(
            {
                "question_id": question.id,
                "topic_id": question.topic_id,
                "correct": correct,
            }
        )
        results.append(
            CheckpointItemResult(
                question_id=question.id,
                stem=question.stem,
                options=question.options,
                your_answer=answer,
                answer_index=question.answer_index,
                correct=correct,
                explanation=question.explanation,
            )
        )

    correct_count = sum(1 for i in items if i["correct"])
    score = round(100 * correct_count / len(items), 1)

    # One sitting is one attempt, so it reads as a single event in the study
    # record. The attempt hangs from whichever topic it drew on most.
    counts: dict[str, int] = {}
    for entry in items:
        counts[entry["topic_id"]] = counts.get(entry["topic_id"], 0) + 1
    dominant = max(counts, key=lambda t: (counts[t], t))
    checkpoint = _checkpoint_for(db, topics[dominant])

    prior = db.scalars(
        select(CheckpointAttempt).where(
            CheckpointAttempt.user_id == user_id,
            CheckpointAttempt.course_identifier == SELF_COURSE,
            CheckpointAttempt.topic_id.in_(list(topics)),
        )
    ).all()

    db.add(
        CheckpointAttempt(
            user_id=user_id,
            checkpoint_id=checkpoint.id,
            course_identifier=SELF_COURSE,
            topic_id=dominant,
            score_pct=score,
            passed=score >= checkpoint.pass_pct,
            attempt_no=len(prior) + 1,
            items=items,
        )
    )
    db.commit()

    after_report, after_item = _state(db, user_id, competency_id)

    return CompetencyAssessmentResultOut(
        competency_id=competency_id,
        competency_name=competency.name,
        score_pct=score,
        correct_count=correct_count,
        total=len(items),
        target_level=after_item.target_level if after_item else 0,
        level_before=before_item.attained_level if before_item else 0,
        level_after=after_item.attained_level if after_item else 0,
        gap_before=before_item.gap if before_item else 0,
        gap_after=after_item.gap if after_item else 0,
        evidence_before=before_item.evidence if before_item else "unmeasured",
        evidence_after=after_item.evidence if after_item else "unmeasured",
        confidence_pct=after_item.confidence_pct if after_item else 0.0,
        level_low=after_item.level_low if after_item else 0,
        level_high=after_item.level_high if after_item else 0,
        questions_answered=after_item.questions_answered if after_item else 0,
        readiness_before=before_report.readiness_pct,
        readiness_after=after_report.readiness_pct,
        recommended_action=after_item.recommended_action if after_item else "assess",
        items=results,
    )
