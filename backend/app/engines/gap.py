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

from app.models import Competency, Role, RoleRequirement, User, UserCompetency
from app.schemas import GapItem, GapReport


def compute_gaps(db: Session, user_id: str) -> GapReport:
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

    items: list[GapItem] = []
    for req in requirements:
        competency = competencies.get(req.competency_id)
        if competency is None:
            continue
        attained_level = attained.get(req.competency_id, 0)
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
            )
        )

    items.sort(key=lambda i: (-i.weighted_gap, -i.gap, i.competency_id))

    total = round(sum(i.weighted_gap for i in items), 3)
    # Worst case: every required competency sits at level 0.
    max_possible = round(sum(i.target_level * i.weight for i in items), 3)
    readiness = 100.0 if max_possible == 0 else round(100 * (1 - total / max_possible), 1)

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
    )


def top_gaps(report: GapReport, n: int = 5) -> list[GapItem]:
    """The n highest-priority competencies the officer has not yet met."""
    return [i for i in report.items if i.gap > 0][:n]
