"""Competency-gap engine (spec 8.1) - the core of the platform.

For a user in a FRAC role:
    gap          = max(0, target_level - attained_level)
    weighted_gap = gap * role_criticality_weight
Items are ranked by weighted_gap descending, so the officer sees the gaps that
matter most to their role first, not merely the largest raw shortfalls.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.engines.psychometrics import (
    CompetencyAbility,
    competency_abilities,
    competency_abilities_bulk,
)
from app.models import Competency, Role, RoleRequirement, User, UserCompetency
from app.schemas import GapItem, GapReport




# --- turning an ability estimate into a decision ---------------------------
TRAIN, ASSESS, MAINTAIN = "train", "assess", "maintain"
MEASURED, PROVISIONAL, SELF_REPORTED, UNMEASURED = (
    "measured",
    "provisional",
    "self_reported",
    "unmeasured",
)


def _resolve_level(
    stored_level: int | None,
    ability: "CompetencyAbility | None",
    target_level: int,
) -> tuple[int, str, float, int, int, int, str]:
    """Decide the attained level, where it came from, and what to do about it.

    The interesting case is uncertainty. If an officer's estimate is 2 but the
    evidence is consistent with anything from 1 to 3, and their role needs 3,
    then booking them onto a course is a guess: they may already meet the
    target. The honest recommendation is to measure them first. A point score
    cannot express this, which is why the estimate carries its range.
    """
    if ability is None:
        level = stored_level if stored_level is not None else 0
        evidence = SELF_REPORTED if stored_level is not None else UNMEASURED
        # Nothing has been measured, so any shortfall is unverified.
        action = MAINTAIN if level >= target_level else ASSESS
        return level, evidence, 0.0, level, level, 0, action

    a = ability.ability
    low, high = a.level_range()
    level = a.level
    answered = ability.questions_answered

    if a.is_provisional:
        evidence = PROVISIONAL
        # Only recommend training when even the optimistic end falls short.
        action = TRAIN if high < target_level else ASSESS
    else:
        evidence = MEASURED
        action = MAINTAIN if level >= target_level else TRAIN

    return level, evidence, round(100 * a.confidence, 1), low, high, answered, action


def _evidence_counts(items: list[GapItem]) -> dict:
    """How much of this readiness figure rests on measurement."""
    measured = sum(1 for i in items if i.evidence == MEASURED)
    provisional = sum(1 for i in items if i.evidence == PROVISIONAL)
    return {
        "measured_competencies": measured,
        "provisional_competencies": provisional,
        "unverified_competencies": len(items) - measured - provisional,
        "evidence_coverage_pct": round(100 * measured / len(items), 1) if items else 0.0,
    }


def compute_gaps(
    db: Session,
    user_id: str,
    abilities: "dict[str, CompetencyAbility] | None" = None,
    use_measurement: bool = True,
) -> GapReport:
    user = db.get(User, user_id)
    if user is None:
        raise KeyError(f"Unknown user: {user_id}")

    role = db.get(Role, user.role_id)
    requirements = db.scalars(
        select(RoleRequirement).where(RoleRequirement.role_id == user.role_id)
    ).all()
    attained = {
        uc.competency_id: uc.attained_level
        for uc in db.scalars(select(UserCompetency).where(UserCompetency.user_id == user_id)).all()
    }
    competencies = {c.id: c for c in db.scalars(select(Competency)).all()}
    if abilities is not None:
        measured = abilities
    elif use_measurement:
        measured = competency_abilities(db, user_id)
    else:
        measured = {}

    items: list[GapItem] = []
    for req in requirements:
        competency = competencies.get(req.competency_id)
        if competency is None:
            continue
        (
            attained_level,
            evidence,
            confidence,
            low,
            high,
            answered,
            action,
        ) = _resolve_level(
            attained.get(req.competency_id),
            measured.get(req.competency_id),
            req.target_level,
        )
        gap = max(0, req.target_level - attained_level)
        items.append(
            GapItem(
                competency_id=req.competency_id,
                competency_name=competency.name,
                competency_type=competency.type,
                target_level=req.target_level,
                attained_level=attained_level,
                gap=gap,
                weight=req.weight,
                weighted_gap=round(gap * req.weight, 3),
                meets_target=gap == 0,
                evidence=evidence,
                confidence_pct=confidence,
                level_low=low,
                level_high=high,
                questions_answered=answered,
                recommended_action=action,
            )
        )

    items.sort(key=lambda i: (-i.weighted_gap, -i.gap, i.competency_id))

    total = round(sum(i.weighted_gap for i in items), 3)
    # Worst case: every required competency sits at level 0.
    max_possible = round(sum(i.target_level * i.weight for i in items), 3)
    readiness = 100.0 if max_possible == 0 else round(100 * (1 - total / max_possible), 1)
    counts = _evidence_counts(items)

    return GapReport(
        user_id=user.id,
        user_name=user.name,
        role_id=user.role_id,
        role_name=role.name if role else user.role_id,
        department=user.department,
        items=items,
        total_weighted_gap=total,
        max_weighted_gap=max_possible,
        readiness_pct=readiness,
        **counts,
    )


def top_gaps(report: GapReport, n: int = 5) -> list[GapItem]:
    """The n highest-priority competencies the officer has not yet met."""
    return [i for i in report.items if i.gap > 0][:n]


def compute_gaps_bulk(
    db: Session, users: list[User], use_measurement: bool = True
) -> list[GapReport]:
    """Gap reports for many officers with a fixed number of queries.

    compute_gaps issues several queries per officer, which is fine for one
    dashboard but turns the department view into an N+1 scan. This loads the
    taxonomy, requirements and proficiencies once and does the rest in memory.
    """
    if not users:
        return []

    competencies = {c.id: c for c in db.scalars(select(Competency)).all()}
    roles = {r.id: r for r in db.scalars(select(Role)).all()}

    requirements_by_role: dict[str, list[RoleRequirement]] = {}
    for requirement in db.scalars(select(RoleRequirement)).all():
        requirements_by_role.setdefault(requirement.role_id, []).append(requirement)

    user_ids = [u.id for u in users]
    # One item-bank load for the whole department rather than one per officer.
    measured_by_user = (
        competency_abilities_bulk(db, user_ids) if use_measurement else {}
    )
    attained: dict[str, dict[str, int]] = {uid: {} for uid in user_ids}
    for link in db.scalars(
        select(UserCompetency).where(UserCompetency.user_id.in_(user_ids))
    ).all():
        attained.setdefault(link.user_id, {})[link.competency_id] = link.attained_level

    reports = []
    for user in users:
        levels = attained.get(user.id, {})
        items: list[GapItem] = []
        measured = measured_by_user.get(user.id, {})
        for requirement in requirements_by_role.get(user.role_id, []):
            competency = competencies.get(requirement.competency_id)
            if competency is None:
                continue
            (
                attained_level,
                evidence,
                confidence,
                low,
                high,
                answered,
                action,
            ) = _resolve_level(
                levels.get(requirement.competency_id),
                measured.get(requirement.competency_id),
                requirement.target_level,
            )
            gap = max(0, requirement.target_level - attained_level)
            items.append(
                GapItem(
                    competency_id=requirement.competency_id,
                    competency_name=competency.name,
                    competency_type=competency.type,
                    target_level=requirement.target_level,
                    attained_level=attained_level,
                    gap=gap,
                    weight=requirement.weight,
                    weighted_gap=round(gap * requirement.weight, 3),
                    meets_target=gap == 0,
                    evidence=evidence,
                    confidence_pct=confidence,
                    level_low=low,
                    level_high=high,
                    questions_answered=answered,
                    recommended_action=action,
                )
            )
        items.sort(key=lambda i: (-i.weighted_gap, -i.gap, i.competency_id))

        total = round(sum(i.weighted_gap for i in items), 3)
        max_possible = round(sum(i.target_level * i.weight for i in items), 3)
        role = roles.get(user.role_id)
        counts = _evidence_counts(items)
        reports.append(
            GapReport(
                user_id=user.id,
                user_name=user.name,
                role_id=user.role_id,
                role_name=role.name if role else user.role_id,
                department=user.department,
                items=items,
                total_weighted_gap=total,
                max_weighted_gap=max_possible,
                readiness_pct=(
                    100.0 if max_possible == 0 else round(100 * (1 - total / max_possible), 1)
                ),
                **counts,
            )
        )
    return reports
