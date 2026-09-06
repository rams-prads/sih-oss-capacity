"""Officer feedback, and the administrator's inbox for it.

Two audiences, one table. An officer writes in from their profile and can see
what became of what they wrote; a training administrator reads the whole cadre's
submissions, filters them, and answers. The officer endpoints are scoped to the
caller and never accept a user id from the request - the only officer whose
feedback you can read or write is the one you are signed in as.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.deps import AdminUser, CurrentUser, DbSession
from app.models import FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, Feedback, User
from app.schemas import (
    FeedbackCategoryCount,
    FeedbackCreate,
    FeedbackInbox,
    FeedbackOut,
    FeedbackUpdate,
)

router = APIRouter(tags=["feedback"])


def _out(row: Feedback, user: User | None) -> FeedbackOut:
    return FeedbackOut(
        id=row.id,
        user_id=row.user_id,
        user_name=user.name if user else row.user_id,
        role_name=(user.role.name if user and user.role else ""),
        department=user.department if user else "",
        category=row.category,
        category_label=FEEDBACK_CATEGORIES.get(row.category, row.category),
        subject=row.subject,
        message=row.message,
        rating=row.rating,
        status=row.status,
        admin_note=row.admin_note,
        handled_at=row.handled_at,
        created_at=row.created_at,
    )


def _mean(values: list[int]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


@router.post("/feedback", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
def submit_feedback(payload: FeedbackCreate, user: CurrentUser, db: DbSession):
    """Send feedback to the training administration, as the signed-in officer."""
    # An unrecognised category is filed rather than rejected: the officer's words
    # are the point, and losing a submission over a select box would be absurd.
    category = payload.category if payload.category in FEEDBACK_CATEGORIES else "other"
    row = Feedback(
        user_id=user.id,
        category=category,
        subject=payload.subject.strip(),
        message=payload.message.strip(),
        rating=payload.rating,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row, user)


@router.get("/feedback/mine", response_model=list[FeedbackOut])
def my_feedback(user: CurrentUser, db: DbSession):
    """Everything this officer has sent, newest first, with any reply."""
    rows = db.scalars(
        select(Feedback).where(Feedback.user_id == user.id).order_by(Feedback.id.desc())
    ).all()
    return [_out(row, user) for row in rows]


@router.get("/admin/feedback", response_model=FeedbackInbox)
def feedback_inbox(
    admin: AdminUser,
    db: DbSession,
    status_filter: str | None = Query(default=None, alias="status"),
    category: str | None = None,
    department: str | None = None,
):
    """The whole cadre's feedback.

    The summary counts are computed over everything in scope and the filters are
    applied only to the listed items, so narrowing to "new" does not also rewrite
    the number next to "new".
    """
    rows = list(db.scalars(select(Feedback).order_by(Feedback.id.desc())).all())
    users = {u.id: u for u in db.scalars(select(User)).all()}

    if department:
        rows = [r for r in rows if (u := users.get(r.user_id)) and u.department == department]

    per_category: dict[str, list[Feedback]] = defaultdict(list)
    for row in rows:
        per_category[row.category].append(row)

    by_category = [
        FeedbackCategoryCount(
            category=key,
            label=label,
            count=len(per_category[key]),
            new_count=sum(1 for r in per_category[key] if r.status == "new"),
            avg_rating=_mean([r.rating for r in per_category[key] if r.rating is not None]),
        )
        # Iterating the canonical map rather than what happens to be in the table
        # keeps the order fixed, so the breakdown does not reshuffle itself as
        # submissions arrive.
        for key, label in FEEDBACK_CATEGORIES.items()
        if per_category[key]
    ]

    listed = rows
    if status_filter and status_filter != "all":
        listed = [r for r in listed if r.status == status_filter]
    if category and category != "all":
        listed = [r for r in listed if r.category == category]

    ratings = [r.rating for r in rows if r.rating is not None]
    return FeedbackInbox(
        total=len(rows),
        new_count=sum(1 for r in rows if r.status == "new"),
        reviewed_count=sum(1 for r in rows if r.status == "reviewed"),
        actioned_count=sum(1 for r in rows if r.status == "actioned"),
        rated_count=len(ratings),
        avg_rating=_mean(ratings),
        by_category=by_category,
        items=[_out(row, users.get(row.user_id)) for row in listed],
    )


@router.patch("/admin/feedback/{feedback_id}", response_model=FeedbackOut)
def handle_feedback(
    feedback_id: int, payload: FeedbackUpdate, admin: AdminUser, db: DbSession
):
    """Move a submission along, and answer it.

    The note goes back to the officer who wrote in, on their own profile - which
    is the only thing that makes the form worth filling in a second time.
    """
    row = db.get(Feedback, feedback_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such feedback")

    if payload.status is not None:
        if payload.status not in FEEDBACK_STATUSES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"status must be one of {', '.join(FEEDBACK_STATUSES)}",
            )
        row.status = payload.status
    if payload.admin_note is not None:
        row.admin_note = payload.admin_note.strip()

    # Stamped only once it has actually been handled: a submission put back to
    # "new" has, by that act, been declared not handled yet.
    if row.status == "new":
        row.handled_by = None
        row.handled_at = None
    else:
        row.handled_by = admin.id
        row.handled_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(row)
    return _out(row, db.get(User, row.user_id))
