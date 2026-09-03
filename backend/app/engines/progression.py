"""Career progression: the competencies the *next* designation will demand.

The gap engine answers "am I ready for the job I hold". The problem statement
also asks for recommendations against future job requirements and career
progression, which is a different question: an officer who fully meets their
current designation has no gaps at all and would be shown nothing, even though
the designation above them expects things they have never been assessed on.

The next designation is derived, not configured: the lowest grade above the
officer's within the same stream. Streams matter - an Assistant Section Officer
progresses up the administrative ladder, not into Senior Statistical Officer -
and where a stream ends (Secretary, or a stream with nothing above) there is
simply no next step, which is an honest answer rather than an error.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Competency, Role, RoleRequirement, User, UserCompetency
from app.schemas import GapItem


def next_designation(db: Session, role: Role) -> Role | None:
    """The designation an officer in this role would normally move up into."""
    candidates = db.scalars(
        select(Role)
        .where(Role.stream == role.stream, Role.grade > role.grade)
        .order_by(Role.grade)
    ).all()
    if candidates:
        return candidates[0]

    # Some streams hold a single designation ("Senior officer" is just Director),
    # so a same-stream step does not exist. Fall back to the next grade anywhere,
    # which is how these ladders actually join up.
    higher = db.scalars(
        select(Role).where(Role.grade > role.grade).order_by(Role.grade, Role.id)
    ).all()
    return higher[0] if higher else None


def progression_gaps(db: Session, user_id: str) -> tuple[Role | None, list[GapItem]]:
    """What the next designation would require that this officer does not yet have.

    Only competencies the next designation demands *beyond* the current one are
    returned. Something already required today is a present-day gap and belongs
    on the main dashboard; repeating it here would double-count it and make the
    step up look larger than it is.
    """
    user = db.get(User, user_id)
    if user is None:
        raise KeyError(f"Unknown user: {user_id}")

    role = db.get(Role, user.role_id)
    if role is None:
        return None, []

    target_role = next_designation(db, role)
    if target_role is None:
        return None, []

    current = {
        r.competency_id: r.target_level
        for r in db.scalars(
            select(RoleRequirement).where(RoleRequirement.role_id == role.id)
        ).all()
    }
    attained = {
        uc.competency_id: uc.attained_level
        for uc in db.scalars(
            select(UserCompetency).where(UserCompetency.user_id == user_id)
        ).all()
    }
    competencies = {c.id: c for c in db.scalars(select(Competency)).all()}

    items: list[GapItem] = []
    for req in db.scalars(
        select(RoleRequirement).where(RoleRequirement.role_id == target_role.id)
    ).all():
        competency = competencies.get(req.competency_id)
        if competency is None:
            continue
        # A competency already demanded at the same level or higher today is not
        # part of the step up.
        if current.get(req.competency_id, -1) >= req.target_level:
            continue

        attained_level = attained.get(req.competency_id, 0)
        gap = max(0, req.target_level - attained_level)
        if gap == 0:
            continue

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
                meets_target=False,
            )
        )

    items.sort(key=lambda i: (-i.weighted_gap, -i.gap, i.competency_id))
    return target_role, items
