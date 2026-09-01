"""Upload -> generate MCQs -> take quiz -> re-estimate proficiency (spec 8.3, 8.4)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select

from app.config import get_settings
from app.deps import DbSession
from app.engines.assessment import score_pct, update_attained_level
from app.llm.providers import get_llm_provider
from app.models import (
    AssessmentResult,
    Competency,
    Question,
    Quiz,
    RoleRequirement,
    SourceMaterial,
    User,
    UserCompetency,
)
from app.quiz.service import ExtractionError, extract_text, generate_questions
from app.schemas import (
    GenerateQuizRequest,
    QuestionOut,
    QuestionWithAnswer,
    QuizGenerationOut,
    QuizOut,
    SubmitQuizOut,
    SubmitQuizRequest,
    UploadOut,
)

router = APIRouter(tags=["quiz"])


def _quiz_out(quiz: Quiz, competency_name: str) -> QuizOut:
    return QuizOut(
        id=quiz.id,
        competency_id=quiz.competency_id,
        competency_name=competency_name,
        title=quiz.title,
        generator=quiz.generator,
        source_material_id=quiz.source_material_id,
        questions=[QuestionOut.model_validate(q) for q in quiz.questions],
    )


@router.post("/materials", response_model=UploadOut, status_code=201)
async def upload_material(db: DbSession, file: UploadFile = File(...)):
    raw = await file.read()
    if len(raw) > get_settings().max_upload_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is too large")
    try:
        text, pages = extract_text(file.filename or "", file.content_type or "", raw)
    except ExtractionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    material = SourceMaterial(
        id=str(uuid.uuid4()),
        filename=file.filename or "upload",
        content_type=file.content_type or "",
        char_count=len(text),
        text=text,
    )
    db.add(material)
    db.commit()
    return UploadOut(
        source_material_id=material.id,
        filename=material.filename,
        char_count=material.char_count,
        pages=pages,
    )


@router.post("/quizzes", response_model=QuizGenerationOut, status_code=201)
def generate_quiz(payload: GenerateQuizRequest, db: DbSession):
    material = db.get(SourceMaterial, payload.source_material_id)
    if material is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source material not found")
    competency = db.get(Competency, payload.competency_id)
    if competency is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Competency not found")

    provider = get_llm_provider()
    try:
        questions, rejected = generate_questions(
            provider, material.text, competency.name, payload.num_questions
        )
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Question generation failed: {exc}"
        ) from exc

    if not questions:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "No valid questions could be generated from this material.",
        )

    quiz = Quiz(
        id=str(uuid.uuid4()),
        source_material_id=material.id,
        competency_id=competency.id,
        title=f"{competency.name} - assessment",
        generator=provider.name,
        rejected_count=rejected,
    )
    for i, q in enumerate(questions):
        quiz.questions.append(
            Question(
                position=i,
                stem=q.stem,
                options=q.options,
                answer_index=q.answer_index,
                explanation=q.explanation,
                difficulty=q.difficulty,
                competency_id=competency.id,
            )
        )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    attempted = len(questions) + rejected
    return QuizGenerationOut(
        quiz=_quiz_out(quiz, competency.name),
        requested=payload.num_questions,
        generated=len(questions),
        rejected=rejected,
        validity_rate=round(100 * len(questions) / attempted, 1) if attempted else 0.0,
    )


@router.get("/quizzes/{quiz_id}", response_model=QuizOut)
def get_quiz(quiz_id: str, db: DbSession):
    quiz = db.get(Quiz, quiz_id)
    if quiz is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz not found")
    competency = db.get(Competency, quiz.competency_id)
    return _quiz_out(quiz, competency.name if competency else quiz.competency_id)


@router.post("/quizzes/{quiz_id}/submit", response_model=SubmitQuizOut)
def submit_quiz(quiz_id: str, user_id: str, payload: SubmitQuizRequest, db: DbSession):
    """Score a quiz and re-estimate the officer's attained proficiency.

    This is the loop that makes the gap engine self-updating: assessment evidence
    feeds back into UserCompetency, so the next gap computation reflects it.
    """
    quiz = db.get(Quiz, quiz_id)
    if quiz is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz not found")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    questions = list(quiz.questions)
    if len(payload.answers) != len(questions):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Expected {len(questions)} answers, received {len(payload.answers)}",
        )

    per_item = [ans == q.answer_index for ans, q in zip(payload.answers, questions)]
    difficulties = [q.difficulty for q in questions]

    link = db.scalar(
        select(UserCompetency).where(
            UserCompetency.user_id == user_id,
            UserCompetency.competency_id == quiz.competency_id,
        )
    )
    if link is None:
        link = UserCompetency(
            user_id=user_id, competency_id=quiz.competency_id, attained_level=0
        )
        db.add(link)

    prior_level = link.attained_level
    new_level = update_attained_level(prior_level, per_item, difficulties)
    link.attained_level = new_level
    link.last_assessed_at = datetime.now(timezone.utc)

    requirement = db.scalar(
        select(RoleRequirement).where(
            RoleRequirement.role_id == user.role_id,
            RoleRequirement.competency_id == quiz.competency_id,
        )
    )
    target = requirement.target_level if requirement else 0

    result = AssessmentResult(
        user_id=user_id,
        quiz_id=quiz_id,
        competency_id=quiz.competency_id,
        score_pct=score_pct(per_item),
        per_item=per_item,
        prior_level=prior_level,
        new_level=new_level,
    )
    db.add(result)
    db.commit()

    competency = db.get(Competency, quiz.competency_id)
    return SubmitQuizOut(
        quiz_id=quiz_id,
        competency_id=quiz.competency_id,
        competency_name=competency.name if competency else quiz.competency_id,
        score_pct=result.score_pct,
        correct_count=sum(1 for c in per_item if c),
        total=len(per_item),
        per_item=per_item,
        prior_level=prior_level,
        new_level=new_level,
        level_changed=new_level != prior_level,
        prior_gap=max(0, target - prior_level),
        new_gap=max(0, target - new_level),
        review=[QuestionWithAnswer.model_validate(q) for q in questions],
    )
