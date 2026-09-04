"""A course-scoped tutor, grounded in what the officer actually did.

The valuable questions here - what should I rewatch, why did I get that wrong,
where am I weak, how am I doing - are answerable from the learner's own record
with no model at all, and answering them from the record means the numbers are
real rather than a model's recollection of them.

So the record answers those directly, and a configured LLM handles open subject
questions with that same record as context. With no key set the tutor says which
questions it can answer instead of inventing a reply, because a confident wrong
answer in a training tool is worse than no answer.

Nothing here reaches outside one course: every fact is drawn from that course's
lessons, its assessment attempts and the topics those attempts touched.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.engines.progress import course_progress, derive_status, topic_mastery
from app.models import (
    BankQuestion,
    Checkpoint,
    CheckpointAttempt,
    Competency,
    Enrolment,
    Topic,
    User,
)

# Intent keywords. Deliberately small and readable: this routes to an answer the
# record can support, and anything unmatched goes to the model.
# Prefixes, not whole words: "weakest" and "struggling" are the forms people
# actually type, and a trailing \b would miss both.
INTENTS: list[tuple[str, re.Pattern[str]]] = [
    ("mistakes", re.compile(r"\b(wrong|mistake|incorrect|got.*right|explain.*(question|quiz|answer)|why.*fail)", re.I)),
    ("weakness", re.compile(r"\b(weak|struggl|improv|bad at|worst|my gap|focus)", re.I)),
    ("rewatch", re.compile(r"\b(rewatch|re-watch|watch again|revis|which video|watch next|what.*next|where.*start)", re.I)),
    ("assessment", re.compile(r"\b(assessment|final|checkpoint|quiz|test|pass mark|unlock)", re.I)),
    ("progress", re.compile(r"\b(progress|how am i|how.*doing|status|score|complet|remaining|left)", re.I)),
]


@dataclass
class TutorReply:
    answer: str
    source: str                       # "record" | "model" | "unanswered"
    intent: str = "general"
    lessons_to_rewatch: list[dict] = field(default_factory=list)
    weak_topics: list[dict] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)


def detect_intent(message: str) -> str:
    for name, pattern in INTENTS:
        if pattern.search(message):
            return name
    return "general"


def _attempts(db: Session, user_id: str, course_identifier: str) -> list[CheckpointAttempt]:
    return db.scalars(
        select(CheckpointAttempt)
        .where(
            CheckpointAttempt.user_id == user_id,
            CheckpointAttempt.course_identifier == course_identifier,
        )
        .order_by(CheckpointAttempt.created_at)
    ).all()


def _missed_questions(db: Session, attempts: list[CheckpointAttempt]) -> list[BankQuestion]:
    """Questions this officer got wrong, most recent attempt first."""
    wrong_ids: list[int] = []
    for attempt in reversed(attempts):
        for item in attempt.items or []:
            if not item.get("correct") and item.get("question_id"):
                if item["question_id"] not in wrong_ids:
                    wrong_ids.append(item["question_id"])
    if not wrong_ids:
        return []
    rows = {
        q.id: q
        for q in db.scalars(select(BankQuestion).where(BankQuestion.id.in_(wrong_ids))).all()
    }
    return [rows[qid] for qid in wrong_ids if qid in rows]


def build_context(db: Session, user_id: str, course_identifier: str) -> dict:
    """Everything the tutor is allowed to know: this course, this officer."""
    user = db.get(User, user_id)
    enrolment = db.scalar(
        select(Enrolment).where(
            Enrolment.user_id == user_id,
            Enrolment.course_identifier == course_identifier,
        )
    )
    if user is None or enrolment is None:
        raise KeyError("Not enrolled in that course")

    progress = course_progress(db, user_id, course_identifier)
    status = derive_status(enrolment, progress)
    attempts = _attempts(db, user_id, course_identifier)

    topic_ids = {a.topic_id for a in attempts if a.topic_id}
    checkpoint_topics = {
        c.topic_id
        for c in db.scalars(
            select(Checkpoint).where(Checkpoint.course_identifier == course_identifier)
        ).all()
        if c.topic_id
    }
    topic_ids |= checkpoint_topics

    mastery = [row for row in topic_mastery(db, user_id) if row["topic_id"] in topic_ids]
    topic_names = {
        t.id: t.name
        for t in db.scalars(select(Topic).where(Topic.id.in_(topic_ids or {""}))).all()
    }
    competency_names = {c.id: c.name for c in db.scalars(select(Competency)).all()}

    unwatched = [
        {
            "id": lesson["id"],
            "title": lesson["title"],
            "duration_min": lesson["duration_min"],
            "module": module["title"],
        }
        for module in progress["modules"]
        for lesson in module["lessons"]
        if not lesson["completed"]
    ]
    watched = [
        {
            "id": lesson["id"],
            "title": lesson["title"],
            "duration_min": lesson["duration_min"],
            "module": module["title"],
        }
        for module in progress["modules"]
        for lesson in module["lessons"]
        if lesson["completed"]
    ]

    return {
        "user": user,
        "enrolment": enrolment,
        "course_name": enrolment.course_name or course_identifier,
        "status": status,
        "progress": progress,
        "attempts": attempts,
        "missed": _missed_questions(db, attempts),
        "mastery": mastery,
        "topic_names": topic_names,
        "competency_names": competency_names,
        "unwatched": unwatched,
        "watched": watched,
    }


def context_for_model(context: dict) -> str:
    """The same facts, flattened for a prompt. No invented detail."""
    progress = context["progress"]
    lines = [
        f"Course: {context['course_name']}",
        f"Officer: {context['user'].name} ({context['user'].role_id})",
        f"Status: {context['status']}, {progress['progress_pct']}% complete",
        f"Videos watched: {progress['lessons_completed']} of {progress['lessons_total']}",
        f"Assessments passed: {progress['checkpoints_passed']} of {progress['checkpoints_total']}",
    ]
    if context["unwatched"]:
        lines.append("Not yet watched: " + "; ".join(l["title"] for l in context["unwatched"][:12]))
    if context["watched"]:
        lines.append("Already watched: " + "; ".join(l["title"] for l in context["watched"][:12]))
    for attempt in context["attempts"]:
        lines.append(
            f"Assessment attempt {attempt.attempt_no}: {attempt.score_pct}% "
            f"({'passed' if attempt.passed else 'not passed'})"
        )
    for question in context["missed"][:6]:
        correct = question.options[question.answer_index]
        lines.append(
            f"Answered incorrectly: {question.stem} | correct answer: {correct} | "
            f"explanation: {question.explanation}"
        )
    for row in context["mastery"]:
        lines.append(
            f"Topic {row['topic_name']}: {row['accuracy_pct']}% accuracy over "
            f"{row['questions_answered']} questions ({row['verdict']})"
        )
    return "\n".join(lines)


# --- answers the record can give on its own ------------------------------
def _answer_progress(context: dict) -> TutorReply:
    progress = context["progress"]
    enrolment = context["enrolment"]
    parts = [
        f"You are {progress['progress_pct']}% through {context['course_name']} "
        f"({context['status'].replace('_', ' ')}): "
        f"{progress['lessons_completed']} of {progress['lessons_total']} videos watched"
    ]
    if progress["checkpoints_total"]:
        parts.append(
            f", {progress['checkpoints_passed']} of {progress['checkpoints_total']} "
            f"assessments passed"
        )
    parts.append(".")
    answer = "".join(parts)

    if context["attempts"]:
        best = max(a.score_pct for a in context["attempts"])
        answer += f" Your best assessment score is {best}%."
    remaining = sum(l["duration_min"] for l in context["unwatched"])
    if remaining:
        answer += f" About {remaining} minutes of video remain."
    if enrolment.expires_at is not None and context["status"] == "expired":
        answer += " The enrolment window has closed, so progress is frozen."
    return TutorReply(answer=answer, source="record", intent="progress")


def _answer_rewatch(context: dict) -> TutorReply:
    unwatched = context["unwatched"]
    if unwatched:
        picks = unwatched[:3]
        answer = (
            "Carry on where you stopped. Next up: "
            + "; ".join(f"{l['title']} ({l['duration_min']} min)" for l in picks)
            + "."
        )
        return TutorReply(
            answer=answer,
            source="record",
            intent="rewatch",
            lessons_to_rewatch=picks,
            suggestions=["Why did I get the assessment wrong?", "Where am I weakest?"],
        )

    missed = context["missed"]
    if not missed:
        return TutorReply(
            answer=(
                "You have watched every video in this course and nothing is "
                "outstanding in the assessment, so there is nothing I would send you "
                "back to."
            ),
            source="record",
            intent="rewatch",
        )

    # Everything watched but questions missed: point at the material by topic.
    topics = {q.topic_id for q in missed}
    names = [context["topic_names"].get(t, t) for t in topics]
    modules = [m["title"] for m in context["progress"]["modules"] if m["lessons_total"]]
    answer = (
        "You have watched everything, so the gap is in what stuck rather than what "
        f"you skipped. The assessment caught you out on {', '.join(names)}. "
    )
    if modules:
        answer += "The modules covering that material are: " + "; ".join(modules[:4]) + "."
    return TutorReply(
        answer=answer,
        source="record",
        intent="rewatch",
        lessons_to_rewatch=context["watched"][:3],
        weak_topics=[r for r in context["mastery"] if r["verdict"] != "strong"],
    )


def _answer_mistakes(context: dict) -> TutorReply:
    missed = context["missed"]
    if not context["attempts"]:
        return TutorReply(
            answer=(
                "You have not attempted this course's assessment yet, so there is "
                "nothing for me to mark up. Watch the videos and the assessment "
                "unlocks."
            ),
            source="record",
            intent="mistakes",
        )
    if not missed:
        return TutorReply(
            answer="You answered every question in this assessment correctly.",
            source="record",
            intent="mistakes",
        )

    lines = ["Here is what you got wrong, and why the right answer is right:"]
    for question in missed[:4]:
        correct = question.options[question.answer_index]
        lines.append(f"\n• {question.stem}")
        lines.append(f"  Correct answer: {correct}")
        if question.explanation:
            lines.append(f"  {question.explanation}")
    return TutorReply(
        answer="\n".join(lines),
        source="record",
        intent="mistakes",
        weak_topics=[r for r in context["mastery"] if r["verdict"] != "strong"],
        suggestions=["What should I rewatch?", "Where am I weakest?"],
    )


def _answer_weakness(context: dict) -> TutorReply:
    mastery = context["mastery"]
    if not mastery:
        return TutorReply(
            answer=(
                "Nothing has been measured on this course yet, so I cannot tell you "
                "where you are weak. Take the assessment and I will have something to "
                "go on."
            ),
            source="record",
            intent="weakness",
        )
    ranked = sorted(mastery, key=lambda r: r["accuracy_pct"])
    worst = ranked[0]
    answer = (
        f"Your weakest area on this course is {worst['topic_name']}: "
        f"{worst['accuracy_pct']}% across {worst['questions_answered']} questions "
        f"({worst['verdict']})."
    )
    strong = [r for r in ranked if r["verdict"] == "strong"]
    if strong:
        answer += f" You are solid on {', '.join(r['topic_name'] for r in strong[:2])}."
    return TutorReply(
        answer=answer,
        source="record",
        intent="weakness",
        weak_topics=[r for r in ranked if r["verdict"] != "strong"],
        suggestions=["Why did I get those wrong?", "What should I rewatch?"],
    )


def _answer_assessment(context: dict) -> TutorReply:
    progress = context["progress"]
    gated = [m for m in progress["modules"] if m["checkpoint_id"] is not None]
    if not gated:
        return TutorReply(
            answer=(
                "This course carries no assessment here - its questions are not in "
                "our bank for the competencies it covers, so it is tracked on videos "
                "watched alone."
            ),
            source="record",
            intent="assessment",
        )
    module = gated[0]
    if module["checkpoint_passed"]:
        answer = f"You have passed the assessment, with a best score of {module['best_score_pct']}%."
    elif module["checkpoint_unlocked"]:
        answer = (
            f"The assessment is open. Pass mark is {module['pass_pct']}%"
            + (f", and your best so far is {module['best_score_pct']}%." if module["attempts"] else ".")
        )
    else:
        remaining = len(context["unwatched"])
        answer = (
            f"The assessment is still locked. Watch the remaining {remaining} "
            f"video{'s' if remaining != 1 else ''} and it opens."
        )
    return TutorReply(answer=answer, source="record", intent="assessment")


RECORD_ANSWERS = {
    "progress": _answer_progress,
    "rewatch": _answer_rewatch,
    "mistakes": _answer_mistakes,
    "weakness": _answer_weakness,
    "assessment": _answer_assessment,
}

CAN_ANSWER = [
    "How am I doing on this course?",
    "What should I watch next?",
    "Why did I get the assessment questions wrong?",
    "Where am I weakest?",
    "Is the final assessment unlocked?",
]


def answer(db: Session, user_id: str, course_identifier: str, message: str, provider) -> TutorReply:
    """Answer one question about one course."""
    context = build_context(db, user_id, course_identifier)
    intent = detect_intent(message)

    if intent in RECORD_ANSWERS:
        return RECORD_ANSWERS[intent](context)

    # Open question: hand the model the same facts, never the whole database.
    try:
        reply = provider.chat(context_for_model(context), message)
    except Exception:
        reply = ""

    if reply:
        return TutorReply(answer=reply, source="model", intent="general")

    return TutorReply(
        answer=(
            "I can only answer from your record on this course, and no language model "
            "is configured for open questions. Ask me one of these instead:\n"
            + "\n".join(f"• {q}" for q in CAN_ANSWER)
        ),
        source="unanswered",
        intent="general",
        suggestions=CAN_ANSWER,
    )
