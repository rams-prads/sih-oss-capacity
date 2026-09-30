"""Upload -> generate MCQs -> practise (spec 8.3).

This is a practice tool and only a practice tool. The questions are written by a
model from a document the officer chose, so nothing about a sitting here is
comparable between two officers: the material is arbitrary, the difficulty
labels are the generator's own guess, and there is no bank, no calibration and
no throttle behind it. Scoring a competency on that would put an unverifiable
number into the record the gap engine, the forecast and the admin heatmap all
read, so a sitting here writes nothing at all - no UserCompetency level, no
AssessmentResult. Measured evidence comes from routers/assessment.py and from
course checkpoints, both of which draw on the calibrated bank.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select

from app.config import get_settings
from app.deps import DbSession
from app.engines.assessment import score_pct
from app.llm.providers import get_llm_provider
from app.models import (
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
        title=f"{competency.name} - practice quiz",
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
    """Score a practice sitting. Read-only with respect to the officer's record.

    The user is still resolved, and their standing still read back, so the page
    can name the competency and say what the practice left untouched - but
    nothing in this function writes to it.
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
    # An index outside the options scored as merely wrong, silently accepting a
    # payload no version of the interface can produce.
    for position, (answer, question) in enumerate(zip(payload.answers, questions), start=1):
        if not 0 <= answer < len(question.options):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Question {position} has no option {answer}.",
            )

    per_item = [ans == q.answer_index for ans, q in zip(payload.answers, questions)]

    # Read only. A missing link is reported as level 0 rather than created,
    # because creating one is itself a claim about the officer.
    link = db.scalar(
        select(UserCompetency).where(
            UserCompetency.user_id == user_id,
            UserCompetency.competency_id == quiz.competency_id,
        )
    )
    attained = link.attained_level if link else 0

    requirement = db.scalar(
        select(RoleRequirement).where(
            RoleRequirement.role_id == user.role_id,
            RoleRequirement.competency_id == quiz.competency_id,
        )
    )
    target = requirement.target_level if requirement else 0

    competency = db.get(Competency, quiz.competency_id)
    return SubmitQuizOut(
        quiz_id=quiz_id,
        competency_id=quiz.competency_id,
        competency_name=competency.name if competency else quiz.competency_id,
        score_pct=score_pct(per_item),
        correct_count=sum(1 for c in per_item if c),
        total=len(per_item),
        per_item=per_item,
        attained_level=attained,
        target_level=target,
        gap=max(0, target - attained),
        review=[QuestionWithAnswer.model_validate(q) for q in questions],
    )
