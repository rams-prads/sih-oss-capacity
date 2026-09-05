"""Course progress, status and topic mastery.

Progress is always DERIVED from what the learner actually did - lessons watched
and checkpoints passed - never stored as a number somebody can set by hand. A
course is a sequence of modules; each module is three video lessons followed by
a checkpoint quiz that unlocks once those lessons are watched.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Checkpoint,
    CheckpointAttempt,
    Enrolment,
    Lesson,
    LessonProgress,
    Topic,
)

NOT_STARTED = "not_started"
IN_PROGRESS = "in_progress"
COMPLETED = "completed"
EXPIRED = "expired"


def _aware(value: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; compare them in UTC."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def course_progress(db: Session, user_id: str, course_identifier: str) -> dict:
    """One course's state for one learner."""
    lessons = db.scalars(
        select(Lesson)
        .where(Lesson.course_identifier == course_identifier)
        .order_by(Lesson.position)
    ).all()
    checkpoints = db.scalars(
        select(Checkpoint)
        .where(Checkpoint.course_identifier == course_identifier)
        .order_by(Checkpoint.module_index)
    ).all()

    done_lesson_ids = {
        lp.lesson_id
        for lp in db.scalars(
            select(LessonProgress).where(
                LessonProgress.user_id == user_id,
                LessonProgress.course_identifier == course_identifier,
            )
        ).all()
    }

    attempts = db.scalars(
        select(CheckpointAttempt)
        .where(
            CheckpointAttempt.user_id == user_id,
            CheckpointAttempt.course_identifier == course_identifier,
        )
        .order_by(CheckpointAttempt.created_at)
    ).all()
    best_by_checkpoint: dict[int, CheckpointAttempt] = {}
    attempt_counts: dict[int, int] = defaultdict(int)
    for attempt in attempts:
        attempt_counts[attempt.checkpoint_id] += 1
        best = best_by_checkpoint.get(attempt.checkpoint_id)
        if best is None or attempt.score_pct > best.score_pct:
            best_by_checkpoint[attempt.checkpoint_id] = attempt

    passed_checkpoint_ids = {
        cid for cid, a in best_by_checkpoint.items() if a.passed
    }

    total_units = len(lessons) + len(checkpoints)
    done_units = len(done_lesson_ids & {lesson.id for lesson in lessons}) + len(
        passed_checkpoint_ids
    )
    progress_pct = round(100 * done_units / total_units) if total_units else 0

    # Build the module view: lessons grouped with the checkpoint that gates them.
    lessons_by_module: dict[int, list[Lesson]] = defaultdict(list)
    for lesson in lessons:
        lessons_by_module[lesson.module_index].append(lesson)

    topic_names = {t.id: t.name for t in db.scalars(select(Topic)).all()}
    checkpoint_by_module = {c.module_index: c for c in checkpoints}
    all_lessons_done = bool(lessons) and all(
        lesson.id in done_lesson_ids for lesson in lessons
    )

    # Modules come from the union of both, not from checkpoints alone. An authored
    # course has a checkpoint per module; an ingested iGOT course has modules of
    # video with a single assessment at the end, so keying on checkpoints hid every
    # one of its lessons and left that assessment permanently locked.
    modules = []
    for module_index in sorted(set(lessons_by_module) | set(checkpoint_by_module)):
        module_lessons = lessons_by_module.get(module_index, [])
        checkpoint = checkpoint_by_module.get(module_index)
        lessons_done = sum(1 for lesson in module_lessons if lesson.id in done_lesson_ids)
        best = best_by_checkpoint.get(checkpoint.id) if checkpoint else None
        modules.append(
            {
                "module_index": module_index,
                # The section's own name, not the name of the quiz that ends
                # it. Falls back to the checkpoint only when a section has no
                # lessons at all, which is how a final assessment appears.
                "title": (
                    next((l.module_title for l in module_lessons if l.module_title), "")
                    or (checkpoint.title if checkpoint else "")
                    or f"Section {module_index + 1}"
                ),
                "topic_id": checkpoint.topic_id if checkpoint else "",
                "topic_name": (
                    topic_names.get(checkpoint.topic_id, checkpoint.topic_id)
                    if checkpoint
                    else f"Module {module_index + 1}"
                ),
                "checkpoint_id": checkpoint.id if checkpoint else None,
                "pass_pct": checkpoint.pass_pct if checkpoint else 0,
                "lessons": [
                    {
                        "id": lesson.id,
                        "position": lesson.position,
                        "title": lesson.title,
                        "duration_min": lesson.duration_min,
                        "completed": lesson.id in done_lesson_ids,
                        "video_url": lesson.video_url,
                    }
                    for lesson in module_lessons
                ],
                "lessons_completed": lessons_done,
                "lessons_total": len(module_lessons),
                # The quiz opens once its videos have been watched. A checkpoint
                # with no videos of its own is a course-level final assessment, so
                # it gates on the whole course instead.
                "checkpoint_unlocked": bool(checkpoint)
                and (
                    lessons_done == len(module_lessons)
                    if module_lessons
                    else all_lessons_done
                ),
                "checkpoint_passed": bool(checkpoint) and checkpoint.id in passed_checkpoint_ids,
                "best_score_pct": round(best.score_pct, 1) if best else None,
                "attempts": attempt_counts.get(checkpoint.id, 0) if checkpoint else 0,
            }
        )

    return {
        "course_identifier": course_identifier,
        "lessons_total": len(lessons),
        "lessons_completed": len(done_lesson_ids & {lesson.id for lesson in lessons}),
        "checkpoints_total": len(checkpoints),
        "checkpoints_passed": len(passed_checkpoint_ids),
        "progress_pct": progress_pct,
        "modules": modules,
        "has_curriculum": total_units > 0,
    }


def derive_status(enrolment: Enrolment, progress: dict, now: datetime | None = None) -> str:
    """A course is completed, expired, in progress, or not started - in that order."""
    now = now or datetime.now(timezone.utc)
    finished = (
        progress["has_curriculum"]
        and progress["lessons_completed"] == progress["lessons_total"]
        and progress["checkpoints_passed"] == progress["checkpoints_total"]
    )
    if finished or enrolment.status == COMPLETED:
        return COMPLETED

    expires_at = _aware(enrolment.expires_at)
    if expires_at is not None and expires_at < now:
        return EXPIRED
    return IN_PROGRESS if progress["progress_pct"] > 0 else NOT_STARTED


def next_action(progress: dict, status: str) -> dict | None:
    """The single thing to do next, so the dashboard can show one clear button."""
    if status in (COMPLETED, EXPIRED) or not progress["has_curriculum"]:
        return None
    for module in progress["modules"]:
        for lesson in module["lessons"]:
            if not lesson["completed"]:
                return {"kind": "lesson", "lesson_id": lesson["id"], "label": lesson["title"]}
        # A module of video with no assessment of its own has nothing to offer here.
        if module["checkpoint_id"] is not None and not module["checkpoint_passed"]:
            return {
                "kind": "checkpoint",
                "checkpoint_id": module["checkpoint_id"],
                "label": f"Checkpoint: {module['topic_name']}",
            }
    return None


# --- topic mastery --------------------------------------------------------
STRONG, DEVELOPING, WEAK = "strong", "developing", "weak"


def classify(accuracy_pct: float) -> str:
    if accuracy_pct >= 80:
        return STRONG
    if accuracy_pct >= 50:
        return DEVELOPING
    return WEAK


def topic_mastery(db: Session, user_id: str) -> list[dict]:
    """What the learner actually gets right and wrong, topic by topic.

    Reads the per-item records stored on each checkpoint attempt, so it counts
    every answer the learner has ever given, not just their latest score.
    """
    attempts = db.scalars(
        select(CheckpointAttempt)
        .where(CheckpointAttempt.user_id == user_id)
        .order_by(CheckpointAttempt.created_at)
    ).all()
    if not attempts:
        return []

    topics = {t.id: t for t in db.scalars(select(Topic)).all()}
    tally: dict[str, dict] = {}
    for attempt in attempts:
        for item in attempt.items:
            topic_id = item.get("topic_id", attempt.topic_id)
            row = tally.setdefault(
                topic_id,
                {"correct": 0, "total": 0, "attempts": 0, "last_seen": attempt.created_at},
            )
            row["total"] += 1
            row["correct"] += 1 if item.get("correct") else 0
            row["last_seen"] = attempt.created_at
        tally.setdefault(attempt.topic_id, {"correct": 0, "total": 0, "attempts": 0})
        tally[attempt.topic_id]["attempts"] += 1

    rows = []
    for topic_id, row in tally.items():
        topic = topics.get(topic_id)
        accuracy = round(100 * row["correct"] / row["total"], 1) if row["total"] else 0.0
        rows.append(
            {
                "topic_id": topic_id,
                "topic_name": topic.name if topic else topic_id,
                "competency_id": topic.competency_id if topic else "",
                "questions_answered": row["total"],
                "questions_correct": row["correct"],
                "accuracy_pct": accuracy,
                "attempts": row["attempts"],
                "verdict": classify(accuracy),
                "last_seen": row.get("last_seen"),
            }
        )
    rows.sort(key=lambda r: (r["accuracy_pct"], -r["questions_answered"]))
    return rows
