"""The learning dashboard: courses, progress, checkpoints, topic mastery."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.config import get_settings
from app.deps import DbSession, KarmayogiDep
from app.engines import tutor
from app.llm.providers import get_llm_provider
from app.engines.attempt_throttle import seconds_until_next_attempt
from app.engines.checkpoint_rotation import BankItem, select_checkpoint_questions
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
    TutorTopic,
    TutorReplyOut,
    TutorSource,
    TutorLesson,
    TutorAskRequest,
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
    """Every question this topic's bank holds - the pool a checkpoint draws
    from, not necessarily what any one attempt is served."""
    return list(
        db.scalars(
            select(BankQuestion)
            .where(BankQuestion.topic_id == topic_id)
            .order_by(BankQuestion.id)
        ).all()
    )


def _prior_attempts(
    db: DbSession, user_id: str, checkpoint_id: int
) -> list[CheckpointAttempt]:
    """This officer's sittings of one checkpoint, oldest first.

    Ordered by primary key rather than created_at: two attempts made in the
    same test, or the same second of wall-clock time, must still resolve to a
    stable order, and an autoincrement id is guaranteed unique where a
    timestamp is not.
    """
    return list(
        db.scalars(
            select(CheckpointAttempt)
            .where(
                CheckpointAttempt.user_id == user_id,
                CheckpointAttempt.checkpoint_id == checkpoint_id,
            )
            .order_by(CheckpointAttempt.id)
        ).all()
    )


def _require_unlocked(db: DbSession, user_id: str, checkpoint: Checkpoint) -> None:
    """Refuse a checkpoint whose module has not been watched through.

    Enforced on submission as well as on opening. Only the GET checked this,
    so the gate was advisory: a request posted straight to /submit skipped the
    videos entirely and still scored, still moved the officer's measured level
    and still counted toward course progress. A rule the UI follows and the API
    does not is not a rule.
    """
    progress = course_progress(db, user_id, checkpoint.course_identifier)
    module = next(
        (m for m in progress["modules"] if m["checkpoint_id"] == checkpoint.id), None
    )
    if module and not module["checkpoint_unlocked"]:
        # The message has to name whatever the gate actually measures. A module
        # with videos of its own gates on those; a module with none is an
        # ingested course's final assessment, which progress.py gates on the
        # whole course. Reading the module's own counts in that second case
        # produced "Watch all 0 videos in this module first (0 done)" - a
        # refusal that tells the officer to do nothing and try again.
        if module["lessons_total"]:
            total, done, scope = (
                module["lessons_total"],
                module["lessons_completed"],
                "this module",
            )
        else:
            total, done, scope = (
                progress["lessons_total"],
                progress["lessons_completed"],
                "this course",
            )
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Watch all {total} videos in {scope} first ({done} done).",
        )


def _require_cooldown_elapsed(prior: list[CheckpointAttempt]) -> None:
    """Refuse a sitting that follows the last one too closely.

    Guessing your way through a four-item checkpoint works about one attempt
    in twenty. Spacing the attempts is what makes that impractical without
    capping how many times a genuinely struggling officer may try.
    """
    if not prior:
        return
    wait = seconds_until_next_attempt(
        prior[-1].created_at,
        cooldown_seconds=get_settings().checkpoint_cooldown_seconds,
    )
    if wait > 0:
        seconds = int(wait) + 1
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Another attempt is available in {seconds} second"
            f"{'' if seconds == 1 else 's'}.",
        )


def _validate_answers(answers: list[int], questions: list[BankQuestion]) -> None:
    """Every answer must name an option that exists on its own question.

    An index outside the options used to score as merely wrong, which quietly
    accepted a payload no version of the interface can produce - and left the
    review screen indexing past the end of the options array to render it.
    """
    if len(answers) != len(questions):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Expected {len(questions)} answers, received {len(answers)}",
        )
    for position, (answer, question) in enumerate(zip(answers, questions), start=1):
        if not 0 <= answer < len(question.options):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Question {position} has no option {answer}.",
            )


def _select_checkpoint_questions(
    db: DbSession,
    checkpoint: Checkpoint,
    prior: list[CheckpointAttempt],
) -> list[BankQuestion]:
    """What this attempt should ask, given everything this officer was asked
    before.

    GET builds this to show the quiz; POST rebuilds it to score the answers
    against. Both calls pass the same `prior` - the attempts recorded before
    this one began - so as long as no other attempt is written in between,
    the two independently arrive at an identical list without either one
    trusting the other's account of it. That is the same assumption the
    self-assessment router already makes for the same reason (see its
    `_questions` docstring); this does not introduce a new one.
    """
    bank = _checkpoint_questions(db, checkpoint.topic_id)
    if not bank:
        return []

    by_id = {q.id: q for q in bank}
    times_seen: dict[int, int] = {}
    last_seen_attempt: dict[int, int] = {}
    for attempt_index, attempt in enumerate(prior, start=1):
        for entry in attempt.items:
            question_id = entry.get("question_id")
            if question_id is None:
                continue
            times_seen[question_id] = times_seen.get(question_id, 0) + 1
            last_seen_attempt[question_id] = attempt_index

    chosen = select_checkpoint_questions(
        [BankItem(q.id, q.difficulty) for q in bank],
        times_seen,
        last_seen_attempt,
        attempt_no=len(prior) + 1,
    )
    return [by_id[item.id] for item in chosen]


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
                outline=catalogue.outline if catalogue else [],
                url=catalogue.url if catalogue else "",
                source=catalogue.source if catalogue else "igot",
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

    _require_unlocked(db, user_id, checkpoint)

    prior = _prior_attempts(db, user_id, checkpoint_id)
    questions = _select_checkpoint_questions(db, checkpoint, prior)
    if not questions:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "No questions are available for this topic yet"
        )

    topic = db.get(Topic, checkpoint.topic_id)
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

    # Same gate as opening it: a submission is the thing that actually counts,
    # so it is the one that most needs checking.
    _require_unlocked(db, user_id, checkpoint)

    prior = _prior_attempts(db, user_id, checkpoint_id)
    _require_cooldown_elapsed(prior)

    questions = _select_checkpoint_questions(db, checkpoint, prior)
    _validate_answers(payload.answers, questions)

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
        # Withheld unless the officer passed. Every attempt used to return the
        # correct option and its explanation for all four questions whatever
        # the score, so one deliberate failure handed over the answer key to a
        # bank shallow enough that the retry would ask them again. What is
        # stored is untouched - the estimator still sees every response - this
        # is only about what the sitting hands back.
        items=results if passed else [],
    )


@router.get("/users/{user_id}/topic-mastery", response_model=list[TopicMastery])
def user_topic_mastery(user_id: str, db: DbSession):
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return [TopicMastery(**row) for row in topic_mastery(db, user_id)]


@router.post("/courses/{course_identifier}/tutor", response_model=TutorReplyOut)
def ask_tutor(
    course_identifier: str, user_id: str, payload: TutorAskRequest, db: DbSession
):
    """Answer a question about one enrolled course.

    Scoped deliberately: the officer must be enrolled, and every fact in the reply
    comes from that course's own lessons and assessment attempts. There is no
    route here to the rest of the platform.
    """
    provider = get_llm_provider()
    try:
        reply = tutor.answer(db, user_id, course_identifier, payload.message, provider)
    except KeyError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Not enrolled in that course"
        ) from None

    enrolment = db.scalar(
        select(Enrolment).where(
            Enrolment.user_id == user_id,
            Enrolment.course_identifier == course_identifier,
        )
    )
    return TutorReplyOut(
        course_identifier=course_identifier,
        course_name=enrolment.course_name if enrolment else course_identifier,
        answer=reply.answer,
        source=reply.source,
        intent=reply.intent,
        lessons_to_rewatch=[TutorLesson(**lesson) for lesson in reply.lessons_to_rewatch],
        sources=[TutorSource(**passage) for passage in reply.sources],
        weak_topics=[
            TutorTopic(
                topic_id=row["topic_id"],
                topic_name=row["topic_name"],
                accuracy_pct=row["accuracy_pct"],
                questions_answered=row["questions_answered"],
                verdict=row["verdict"],
            )
            for row in reply.weak_topics
        ],
        suggestions=reply.suggestions,
    )
