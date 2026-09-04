"""Registering an officer and establishing their starting proficiency.

Until now every officer's attained level was seeded: a number with no evidence
behind it. The problem statement asks the platform to build the competency
profile itself, and a gap computed from an unevidenced level is not a gap, it is
a guess.

So a new officer registers with their designation and then sits a baseline
assessment drawn from the authored question bank. Their FRAC levels come out of
what they actually answered, through the same difficulty-weighted estimator a
course assessment uses.

Competencies the bank cannot cover are left unassessed rather than defaulted to
zero and quietly counted as a gap - the response says which, so the officer is
told what has not been measured instead of being marked down for it.
"""
from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import DbSession
from app.engines.assessment import observed_level
from app.models import (
    BankQuestion,
    Competency,
    Role,
    RoleRequirement,
    Topic,
    User,
    UserCompetency,
)
from app.schemas import (
    BaselineAnswer,
    BaselineOut,
    BaselineQuestionOut,
    BaselineResultOut,
    BaselineSubmitRequest,
    CompetencyEstimate,
    RegisterRequest,
    UserOut,
)
from app.security import hash_password

router = APIRouter(tags=["onboarding"])

QUESTIONS_PER_COMPETENCY = 3

# A baseline of three items cannot certify anyone an Expert. The estimator maps a
# clean sweep to 4, which is fine after a full course assessment and far too
# generous here, so the starting level is capped at Proficient - an officer can
# still reach 4 by actually completing training and being assessed on it.
BASELINE_CEILING = 3


def _user_id(name: str, role_id: str) -> str:
    """A readable id in the same shape as the seeded ones."""
    slug = re.sub(r"[^a-z]+", "", name.split()[0].lower()) or "officer"
    return f"u-{role_id.lower()}-{slug}-{uuid.uuid4().hex[:4]}"


@router.post("/users", response_model=UserOut, status_code=201)
def register(payload: RegisterRequest, db: DbSession):
    role = db.get(Role, payload.role_id)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown designation")
    if payload.email and db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already registered")

    user = User(
        id=_user_id(payload.name, payload.role_id),
        name=payload.name.strip(),
        email=payload.email.strip(),
        role_id=payload.role_id,
        department=payload.department.strip(),
        is_admin=False,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        role_id=user.role_id,
        role_name=role.name,
        department=user.department,
        is_admin=user.is_admin,
    )


def _requirements(db: DbSession, role_id: str) -> list[RoleRequirement]:
    return db.scalars(
        select(RoleRequirement).where(RoleRequirement.role_id == role_id)
    ).all()


@router.get("/assessment/{user_id}", response_model=BaselineOut)
def baseline(user_id: str, db: DbSession):
    """The questions that establish this officer's starting levels."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    role = db.get(Role, user.role_id)

    competency_names = {c.id: c.name for c in db.scalars(select(Competency)).all()}
    topics_by_competency: dict[str, list[str]] = {}
    for topic in db.scalars(select(Topic)).all():
        topics_by_competency.setdefault(topic.competency_id, []).append(topic.id)

    questions: list[BaselineQuestionOut] = []
    covered: list[str] = []
    unassessable: list[str] = []

    for requirement in sorted(_requirements(db, user.role_id), key=lambda r: -r.weight):
        competency_id = requirement.competency_id
        topic_ids = topics_by_competency.get(competency_id, [])
        rows = (
            db.scalars(
                select(BankQuestion)
                .where(BankQuestion.topic_id.in_(topic_ids))
                .order_by(BankQuestion.difficulty, BankQuestion.id)
            ).all()
            if topic_ids
            else []
        )
        if not rows:
            unassessable.append(competency_id)
            continue

        # Spread across the difficulty range: the estimator weights by difficulty,
        # so a run of easy items would flatter every officer equally.
        step = max(1, len(rows) // QUESTIONS_PER_COMPETENCY)
        picked = rows[::step][:QUESTIONS_PER_COMPETENCY]
        covered.append(competency_id)
        for question in picked:
            questions.append(
                BaselineQuestionOut(
                    question_id=question.id,
                    competency_id=competency_id,
                    competency_name=competency_names.get(competency_id, competency_id),
                    stem=question.stem,
                    options=question.options,
                    difficulty=question.difficulty,
                )
            )

    return BaselineOut(
        user_id=user.id,
        user_name=user.name,
        role_id=user.role_id,
        role_name=role.name if role else user.role_id,
        questions=questions,
        competencies_assessed=covered,
        competencies_without_questions=[
            competency_names.get(c, c) for c in unassessable
        ],
    )


@router.post("/assessment/{user_id}/submit", response_model=BaselineResultOut)
def submit_baseline(
    user_id: str, payload: BaselineSubmitRequest, db: DbSession
) -> BaselineResultOut:
    """Score the baseline and write the officer's starting FRAC levels."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if not payload.answers:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No answers submitted")

    question_ids = [a.question_id for a in payload.answers]
    questions = {
        q.id: q
        for q in db.scalars(
            select(BankQuestion).where(BankQuestion.id.in_(question_ids))
        ).all()
    }
    missing = [qid for qid in question_ids if qid not in questions]
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown questions: {missing}")

    topic_competency = {t.id: t.competency_id for t in db.scalars(select(Topic)).all()}
    competency_names = {c.id: c.name for c in db.scalars(select(Competency)).all()}
    targets = {r.competency_id: r.target_level for r in _requirements(db, user.role_id)}

    per_competency: dict[str, list[tuple[bool, float]]] = {}
    for answer in payload.answers:
        question = questions[answer.question_id]
        competency_id = topic_competency.get(question.topic_id)
        if competency_id is None:
            continue
        per_competency.setdefault(competency_id, []).append(
            (answer.answer_index == question.answer_index, question.difficulty)
        )

    existing = {
        uc.competency_id: uc
        for uc in db.scalars(
            select(UserCompetency).where(UserCompetency.user_id == user_id)
        ).all()
    }

    estimates: list[CompetencyEstimate] = []
    for competency_id, results in per_competency.items():
        correct = [c for c, _ in results]
        difficulties = [d for _, d in results]
        # No prior to blend with: this *is* the prior.
        level = max(0, min(BASELINE_CEILING, round(observed_level(correct, difficulties))))

        link = existing.get(competency_id)
        if link is None:
            link = UserCompetency(user_id=user_id, competency_id=competency_id)
            db.add(link)
        link.attained_level = level

        estimates.append(
            CompetencyEstimate(
                competency_id=competency_id,
                competency_name=competency_names.get(competency_id, competency_id),
                questions_answered=len(results),
                questions_correct=sum(1 for c in correct if c),
                attained_level=level,
                target_level=targets.get(competency_id, 0),
                gap=max(0, targets.get(competency_id, 0) - level),
            )
        )

    db.commit()
    estimates.sort(key=lambda e: (-e.gap, e.competency_id))
    for link in existing.values():
        db.add(link)
    answered = sum(len(v) for v in per_competency.values())
    correct_total = sum(e.questions_correct for e in estimates)
    return BaselineResultOut(
        user_id=user_id,
        questions_answered=answered,
        questions_correct=correct_total,
        score_pct=round(100 * correct_total / answered, 1) if answered else 0.0,
        estimates=estimates,
    )
