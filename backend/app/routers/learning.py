"""The learning dashboard: courses, progress, checkpoints, topic mastery."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import DbSession, KarmayogiDep
from app.engines.progress import (
    COMPLETED,
    EXPIRED,
    IN_PROGRESS,
    NOT_STARTED,
    classify,
    course_progress,
    derive_status,
    next_action,
    topic_mastery,
)
from app.models import (
    BankQuestion,
    Checkpoint,
    CheckpointAttempt,
    Enrolment,
    Lesson,
    LessonProgress,
    Topic,
    User,
)
from app.schemas import (
    CheckpointItemResult,
    CheckpointQuestionOut,
    CheckpointQuizOut,
    CheckpointSubmitOut,
    CheckpointSubmitRequest,
    LearningCourse,
    LearningDashboard,
    LearningSummary,
    TopicMastery,
)

router = APIRouter(tags=["learning"])


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _checkpoint_questions(db: DbSession, topic_id: str) -> list[BankQuestion]:
    return list(
        db.scalars(
            select(BankQuestion)
            .where(BankQuestion.topic_id == topic_id)
            .order_by(BankQuestion.id)
        ).all()
    )


@router.get("/users/{user_id}/learning", response_model=LearningDashboard)
def learning_dashboard(user_id: str, db: DbSession, client: KarmayogiDep):
    """Everything the learner needs on one screen."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    enrolments = db.scalars(
        select(Enrolment).where(Enrolment.user_id == user_id).order_by(Enrolment.enrolled_at)
    ).all()

    now = datetime.now(timezone.utc)
    courses: list[LearningCourse] = []
    counts = {NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0, EXPIRED: 0}
    lessons_done = lessons_total = checkpoints_passed = 0
    all_scores: list[float] = []

    for enrolment in enrolments:
        progress = course_progress(db, user_id, enrolment.course_identifier)
        course_status = derive_status(enrolment, progress, now)
        counts[course_status] += 1

        lessons_done += progress["lessons_completed"]
        lessons_total += progress["lessons_total"]
        checkpoints_passed += progress["checkpoints_passed"]

        scores = [m["best_score_pct"] for m in progress["modules"] if m["best_score_pct"] is not None]
        all_scores.extend(scores)

        expires_at = _aware(enrolment.expires_at)
        days_remaining = None
        if expires_at is not None and course_status not in (COMPLETED, EXPIRED):
            days_remaining = max(0, (expires_at - now).days)

        catalogue = client.read_course(enrolment.course_identifier)
        courses.append(
            LearningCourse(
                course_identifier=enrolment.course_identifier,
                course_name=enrolment.course_name or (catalogue.name if catalogue else ""),
                provider=catalogue.provider if catalogue else "iGOT Karmayogi",
                competency_ids=catalogue.competency_ids if catalogue else [],
                status=course_status,
                progress_pct=progress["progress_pct"],
                lessons_completed=progress["lessons_completed"],
                lessons_total=progress["lessons_total"],
                checkpoints_passed=progress["checkpoints_passed"],
                checkpoints_total=progress["checkpoints_total"],
                enrolled_at=enrolment.enrolled_at,
                completed_at=enrolment.completed_at,
                expires_at=enrolment.expires_at,
                days_remaining=days_remaining,
                avg_checkpoint_score=round(sum(scores) / len(scores), 1) if scores else None,
                next_action=next_action(progress, course_status),
                modules=progress["modules"],
            )
        )

    # Show the courses that need attention first, finished and lapsed ones last.
    order = {IN_PROGRESS: 0, NOT_STARTED: 1, EXPIRED: 2, COMPLETED: 3}
    courses.sort(key=lambda c: (order[c.status], -c.progress_pct, c.course_name))

    mastery = [TopicMastery(**row) for row in topic_mastery(db, user_id)]
    answered = sum(m.questions_answered for m in mastery)
    correct = sum(m.questions_correct for m in mastery)
    total_units = lessons_total + sum(c.checkpoints_total for c in courses)
    done_units = lessons_done + checkpoints_passed

    summary = LearningSummary(
        enrolled=len(enrolments),
        in_progress=counts[IN_PROGRESS],
        completed=counts[COMPLETED],
        expired=counts[EXPIRED],
        not_started=counts[NOT_STARTED],
        lessons_completed=lessons_done,
        lessons_total=lessons_total,
        checkpoints_passed=checkpoints_passed,
        overall_progress_pct=round(100 * done_units / total_units) if total_units else 0,
        avg_checkpoint_score=round(sum(all_scores) / len(all_scores), 1) if all_scores else None,
        questions_answered=answered,
        questions_correct=correct,
    )

    ranked = sorted(mastery, key=lambda m: -m.accuracy_pct)
    return LearningDashboard(
        user_id=user.id,
        user_name=user.name,
        role_name=user.role.name if user.role else user.role_id,
        department=user.department,
        summary=summary,
        courses=courses,
        topic_mastery=mastery,
        strongest_topics=[m for m in ranked if m.verdict != "weak"][:3],
        weakest_topics=[m for m in reversed(ranked) if m.verdict != "strong"][:3],
    )


@router.post("/users/{user_id}/lessons/{lesson_id}/complete", status_code=200)
def complete_lesson(user_id: str, lesson_id: int, db: DbSession):
    """Mark a video watched. Progress recomputes from this, never from a set value."""
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found")
    enrolment = db.scalar(
        select(Enrolment).where(
            Enrolment.user_id == user_id,
            Enrolment.course_identifier == lesson.course_identifier,
        )
    )
    if enrolment is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Enrol in the course first")

    existing = db.scalar(
        select(LessonProgress).where(
            LessonProgress.user_id == user_id, LessonProgress.lesson_id == lesson_id
        )
    )
    if existing is None:
        db.add(
            LessonProgress(
                user_id=user_id,
                lesson_id=lesson_id,
                course_identifier=lesson.course_identifier,
            )
        )
        db.commit()

    progress = course_progress(db, user_id, lesson.course_identifier)
    new_status = derive_status(enrolment, progress)
    _sync_enrolment(db, enrolment, progress, new_status)
    return {
        "course_identifier": lesson.course_identifier,
        "progress_pct": progress["progress_pct"],
        "status": new_status,
        "next_action": next_action(progress, new_status),
    }


def _sync_enrolment(db: DbSession, enrolment: Enrolment, progress: dict, new_status: str) -> None:
    """Keep the stored enrolment row in step with the derived progress."""
    enrolment.progress_pct = progress["progress_pct"]
    if new_status == COMPLETED and enrolment.status != COMPLETED:
        enrolment.status = COMPLETED
        enrolment.completed_at = datetime.now(timezone.utc)
    elif new_status != COMPLETED:
        enrolment.status = new_status
    db.commit()


@router.get("/checkpoints/{checkpoint_id}", response_model=CheckpointQuizOut)
def get_checkpoint(checkpoint_id: int, user_id: str, db: DbSession):
    """The module quiz. Opens only once its lessons have been watched."""
    checkpoint = db.get(Checkpoint, checkpoint_id)
    if checkpoint is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Checkpoint not found")

    progress = course_progress(db, user_id, checkpoint.course_identifier)
    module = next(
        (m for m in progress["modules"] if m["checkpoint_id"] == checkpoint_id), None
    )
    if module and not module["checkpoint_unlocked"]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Watch all {module['lessons_total']} videos in this module first "
            f"({module['lessons_completed']} done).",
        )

    questions = _checkpoint_questions(db, checkpoint.topic_id)
    if not questions:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "No questions are available for this topic yet"
        )

    topic = db.get(Topic, checkpoint.topic_id)
    prior = db.scalars(
        select(CheckpointAttempt).where(
            CheckpointAttempt.user_id == user_id,
            CheckpointAttempt.checkpoint_id == checkpoint_id,
        )
    ).all()
    enrolment = db.scalar(
        select(Enrolment).where(
            Enrolment.user_id == user_id,
            Enrolment.course_identifier == checkpoint.course_identifier,
        )
    )

    return CheckpointQuizOut(
        checkpoint_id=checkpoint.id,
        course_identifier=checkpoint.course_identifier,
        course_name=enrolment.course_name if enrolment else "",
        title=checkpoint.title,
        topic_id=checkpoint.topic_id,
        topic_name=topic.name if topic else checkpoint.topic_id,
        pass_pct=checkpoint.pass_pct,
        attempt_no=len(prior) + 1,
        questions=[
            CheckpointQuestionOut(
                id=q.id, stem=q.stem, options=q.options, difficulty=q.difficulty
            )
            for q in questions
        ],
    )


@router.post("/checkpoints/{checkpoint_id}/submit", response_model=CheckpointSubmitOut)
def submit_checkpoint(
    checkpoint_id: int, user_id: str, payload: CheckpointSubmitRequest, db: DbSession
):
    """Score a module checkpoint and record which topics were right and wrong."""
    checkpoint = db.get(Checkpoint, checkpoint_id)
    if checkpoint is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Checkpoint not found")
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    questions = _checkpoint_questions(db, checkpoint.topic_id)
    if len(payload.answers) != len(questions):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Expected {len(questions)} answers, received {len(payload.answers)}",
        )

    items = []
    results = []
    for answer, question in zip(payload.answers, questions):
        correct = answer == question.answer_index
        items.append(
            {"question_id": question.id, "topic_id": checkpoint.topic_id, "correct": correct}
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
    passed = score >= checkpoint.pass_pct

    prior = db.scalars(
        select(CheckpointAttempt).where(
            CheckpointAttempt.user_id == user_id,
            CheckpointAttempt.checkpoint_id == checkpoint_id,
        )
    ).all()

    db.add(
        CheckpointAttempt(
            user_id=user_id,
            checkpoint_id=checkpoint_id,
            course_identifier=checkpoint.course_identifier,
            topic_id=checkpoint.topic_id,
            score_pct=score,
            passed=passed,
            attempt_no=len(prior) + 1,
            items=items,
        )
    )
    db.commit()

    progress = course_progress(db, user_id, checkpoint.course_identifier)
    enrolment = db.scalar(
        select(Enrolment).where(
            Enrolment.user_id == user_id,
            Enrolment.course_identifier == checkpoint.course_identifier,
        )
    )
    course_status = derive_status(enrolment, progress) if enrolment else IN_PROGRESS
    if enrolment:
        _sync_enrolment(db, enrolment, progress, course_status)

    mastery = {m["topic_id"]: m for m in topic_mastery(db, user_id)}
    topic_row = mastery.get(checkpoint.topic_id)
    topic = db.get(Topic, checkpoint.topic_id)

    return CheckpointSubmitOut(
        checkpoint_id=checkpoint_id,
        course_identifier=checkpoint.course_identifier,
        topic_id=checkpoint.topic_id,
        topic_name=topic.name if topic else checkpoint.topic_id,
        score_pct=score,
        correct_count=correct_count,
        total=len(items),
        passed=passed,
        pass_pct=checkpoint.pass_pct,
        attempt_no=len(prior) + 1,
        course_progress_pct=progress["progress_pct"],
        course_status=course_status,
        topic_accuracy_pct=topic_row["accuracy_pct"] if topic_row else score,
        topic_verdict=topic_row["verdict"] if topic_row else classify(score),
        items=results,
    )


@router.get("/users/{user_id}/topic-mastery", response_model=list[TopicMastery])
def user_topic_mastery(user_id: str, db: DbSession):
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return [TopicMastery(**row) for row in topic_mastery(db, user_id)]
