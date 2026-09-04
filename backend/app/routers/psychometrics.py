"""Ability estimates, item calibration and the predictive validation report."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import AdminUser, DbSession
from app.engines.calibration import MIN_RESPONSES_TO_CALIBRATE, ItemParameters
from app.engines.irt import b_to_authored_difficulty
from app.engines.psychometrics import calibrate_bank, item_bank, response_corpus, topic_abilities
from app.engines.validation import cross_validate
from app.models import BankQuestion, User
from app.schemas import (
    AbilityReport,
    CalibrationOut,
    ItemParameterOut,
    ModelScore,
    TopicAbilityOut,
    ValidationOut,
)

router = APIRouter(tags=["psychometrics"])


@router.get("/users/{user_id}/ability", response_model=AbilityReport)
def user_ability(user_id: str, db: DbSession, decay: bool = True):
    """Per-topic ability with its uncertainty.

    Every level comes with the range of levels the evidence actually supports.
    A four-item checkpoint measures a level correctly about 44% of the time on
    its own, so the range is not decoration - it is the honest answer.
    """
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    rows = topic_abilities(db, user_id, apply_decay=decay)
    out = []
    for row in rows:
        a = row.ability
        low, high = a.level_range()
        out.append(
            TopicAbilityOut(
                topic_id=row.topic_id,
                topic_name=row.topic_name,
                competency_id=row.competency_id,
                theta=round(a.theta, 3),
                standard_error=round(a.se, 3),
                level=a.level,
                level_name=a.level_name,
                confidence_pct=round(100 * a.confidence, 1),
                level_low=low,
                level_high=high,
                provisional=a.is_provisional,
                questions_answered=row.questions_answered,
                days_since_assessed=(
                    round(row.days_since_assessed, 1)
                    if row.days_since_assessed is not None
                    else None
                ),
            )
        )

    provisional = sum(1 for r in out if r.provisional)
    return AbilityReport(
        user_id=user.id,
        user_name=user.name,
        topics=out,
        measured_topics=len(out),
        provisional_topics=provisional,
        note=(
            "Levels are estimated with Item Response Theory and reported with the "
            "range the evidence supports. A provisional level means the officer has "
            "not answered enough questions on that topic to separate adjacent levels."
        ),
    )


def _to_out(p: ItemParameters, stems: dict[int, tuple[str, str]]) -> ItemParameterOut:
    stem, topic_id = stems.get(p.item_id, ("", ""))
    return ItemParameterOut(
        item_id=p.item_id,
        topic_id=topic_id,
        stem=stem[:120],
        authored_difficulty=round(b_to_authored_difficulty(p.authored_b), 3),
        calibrated_difficulty=round(b_to_authored_difficulty(p.b), 3),
        discrimination=round(p.a, 3),
        guessing=round(p.c, 3),
        n_responses=p.n_responses,
        p_correct=round(p.p_correct, 3),
        status=p.status,
        drift=round(p.drift, 3),
    )


@router.get("/admin/calibration", response_model=CalibrationOut)
def calibration(db: DbSession, admin: AdminUser):
    """What the response data says each question is really worth.

    Authored difficulty is a guess, and simulation puts the average error of
    that guess at roughly three times the calibrated value. Until an item has
    enough responses the authored value stands, and this report says which.
    """
    report = calibrate_bank(db)
    stems = {
        q.id: (q.stem, q.topic_id) for q in db.scalars(select(BankQuestion)).all()
    }

    if report.n_calibrated:
        note = (
            f"{report.n_calibrated} of {len(report.items)} items have enough responses "
            "to be calibrated. The rest use the authored difficulty."
        )
    else:
        note = (
            "No item has been answered "
            f"{MIN_RESPONSES_TO_CALIBRATE} times yet, so every item still uses its "
            "authored difficulty. Calibration runs automatically as usage accumulates; "
            "the estimator works without it, just less precisely."
        )

    return CalibrationOut(
        responses=report.n_responses,
        items_seen=len(report.items),
        items_calibrated=report.n_calibrated,
        min_responses_required=MIN_RESPONSES_TO_CALIBRATE,
        note=note,
        flagged_items=[_to_out(p, stems) for p in report.flagged()[:10]],
        low_discrimination_items=[_to_out(p, stems) for p in report.low_discrimination()[:10]],
    )


@router.get("/admin/validation", response_model=ValidationOut)
def validation(db: DbSession, admin: AdminUser, holdout: float = 0.25):
    """Predict held-out answers, and report how well each model does.

    The claim that a competency estimate is accurate is only meaningful against
    data the model has not seen, so this holds responses back, fits on the rest,
    and scores the predictions. Each row adds one idea to the row below it; a row
    that does not improve on its predecessor is not earning its place.
    """
    corpus = response_corpus(db)
    authored = {q.id: q.difficulty for q in db.scalars(select(BankQuestion)).all()}
    report = calibrate_bank(db)
    calibrated = {
        i: (p.b, p.a, p.c) for i, p in report.items.items() if p.calibrated
    } or None

    results = cross_validate(corpus, authored, calibrated, holdout=holdout)
    if not results:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Not enough recorded responses to hold any back for validation yet.",
        )

    return ValidationOut(
        source="real",
        responses=len(corpus),
        holdout_pct=round(100 * holdout, 1),
        models=[
            ModelScore(
                name=r.name,
                accuracy_pct=round(100 * r.accuracy, 1),
                auc=round(r.auc, 3) if r.auc == r.auc else 0.0,
                brier=round(r.brier, 4),
                log_loss=round(r.log_loss, 4),
                calibration_error=round(r.calibration_error, 4),
            )
            for r in results
        ],
        note=(
            "Scored on held-out responses. AUC 0.5 is a coin flip. Calibration error "
            "is how far stated confidence is from observed frequency, lower is better."
        ),
    )
