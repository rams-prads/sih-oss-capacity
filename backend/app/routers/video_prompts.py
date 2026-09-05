"""Serving in-video retrieval prompts, and recording ungraded answers."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import DbSession
from app.engines.video_prompts import select_varied
from app.models import Lesson, User, VideoPrompt, VideoPromptAnswer
from app.schemas import (
    AnswerPromptOut,
    AnswerPromptRequest,
    LessonPromptsOut,
    VideoPromptOut,
)

router = APIRouter(tags=["video-prompts"])


@router.get("/lessons/{lesson_id}/prompts", response_model=LessonPromptsOut)
def lesson_prompts(lesson_id: int, db: DbSession, user_id: str, per_segment: int = 1):
    """The questions to show during this lesson, for this officer, this time.

    One per pause point by default. Which ones is not fixed: the pool for a
    segment holds several, and the choice favours questions this officer has not
    met, spread as far apart in meaning as the pool allows. Watching a lesson
    again therefore asks about different parts of what was said.
    """
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found")
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    pool = db.scalars(
        select(VideoPrompt)
        .where(VideoPrompt.lesson_id == lesson_id)
        .order_by(VideoPrompt.segment_index, VideoPrompt.id)
    ).all()
    if not pool:
        return LessonPromptsOut(
            lesson_id=lesson_id,
            lesson_title=lesson.title,
            duration_min=lesson.duration_min,
            prompts=[],
            pool_size=0,
            already_seen=0,
            note="No in-video questions for this lesson yet.",
        )

    seen_ids = {
        row.prompt_id
        for row in db.scalars(
            select(VideoPromptAnswer).where(
                VideoPromptAnswer.user_id == user_id,
                VideoPromptAnswer.lesson_id == lesson_id,
            )
        ).all()
    }
    seen_vectors = [p.embedding for p in pool if p.id in seen_ids and p.embedding]

    by_segment: dict[int, list[VideoPrompt]] = {}
    for prompt in pool:
        by_segment.setdefault(prompt.segment_index, []).append(prompt)

    chosen: list[VideoPrompt] = []
    for _index, segment_pool in sorted(by_segment.items()):
        # Prefer what they have not answered; fall back to the whole pool once
        # they have worked through it, rather than showing nothing.
        unseen = [p for p in segment_pool if p.id not in seen_ids]
        candidates = unseen or segment_pool
        picked = select_varied(
            [(p.id, p.embedding or []) for p in candidates],
            per_segment,
            seen_vectors=seen_vectors,
        )
        lookup = {p.id: p for p in candidates}
        chosen.extend(lookup[pid] for pid in picked)

    chosen.sort(key=lambda p: p.timestamp_seconds)
    return LessonPromptsOut(
        lesson_id=lesson_id,
        lesson_title=lesson.title,
        duration_min=lesson.duration_min,
        prompts=[
            VideoPromptOut(
                id=p.id,
                lesson_id=p.lesson_id,
                timestamp_seconds=p.timestamp_seconds,
                position_pct=p.position_pct,
                stem=p.stem,
                options=p.options,
            )
            for p in chosen
        ],
        pool_size=len(pool),
        already_seen=len(seen_ids),
        note=(
            "Ungraded practice. These check what was just said and never affect "
            "your competency record."
        ),
    )


@router.post("/prompts/{prompt_id}/answer", response_model=AnswerPromptOut)
def answer_prompt(
    prompt_id: int, user_id: str, payload: AnswerPromptRequest, db: DbSession
):
    """Record an answer and show what the lesson actually said.

    Recorded so the officer can see what they have practised and so the tutor
    knows where they struggled. Never scored: the question is optional and the
    learner can rewind to look it up, which makes it good practice and poor
    evidence of ability.
    """
    prompt = db.get(VideoPrompt, prompt_id)
    if prompt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prompt not found")
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if not 0 <= payload.chosen_index < len(prompt.options):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That option does not exist")

    correct = payload.chosen_index == prompt.answer_index
    db.add(
        VideoPromptAnswer(
            user_id=user_id,
            prompt_id=prompt_id,
            lesson_id=prompt.lesson_id,
            chosen_index=payload.chosen_index,
            correct=correct,
        )
    )
    db.commit()

    return AnswerPromptOut(
        prompt_id=prompt_id,
        correct=correct,
        answer_index=prompt.answer_index,
        explanation=prompt.explanation,
        quote=prompt.quotes,
        rewatch_from_seconds=prompt.answer_timestamp_seconds,
        graded=False,
    )
