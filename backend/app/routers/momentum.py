"""Learning momentum: an officer's goals, points, streak, quests and next step.

Everything served here is derived on request from what the officer actually did
(see engines/momentum.py). The one write is the officer's own choice of goal -
there is no route that awards, adjusts or sets a point.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.deps import DbSession, KarmayogiDep
from app.engines.momentum import momentum, next_best_action, set_learning_goal
from app.models import User
from app.schemas import LearningGoalUpdate, MomentumOut, NextActionOut

router = APIRouter(tags=["momentum"])


@router.get("/users/{user_id}/momentum", response_model=MomentumOut)
def get_momentum(user_id: str, db: DbSession, client: KarmayogiDep):
    """Today's goal, this week's goal, the streak, quests and achievements."""
    try:
        return momentum(db, user_id, client=client)
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found") from exc


@router.get("/users/{user_id}/next-action", response_model=NextActionOut)
def get_next_action(user_id: str, db: DbSession, client: KarmayogiDep):
    """Where to pick up, and the single most useful thing to do next - and why."""
    try:
        return next_best_action(db, client, user_id)
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found") from exc


@router.put("/users/{user_id}/learning-goal", response_model=MomentumOut)
def put_learning_goal(
    user_id: str, payload: LearningGoalUpdate, db: DbSession, client: KarmayogiDep
):
    """Set a weekly and daily goal.

    A raised goal applies this week; a lowered one from next Monday, so a goal
    cannot be lowered late in a week to collect a bonus that week did not earn.
    The response is the recomputed momentum, which names any pending change.
    """
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    set_learning_goal(db, user_id, payload.weekly_days_target, payload.daily_points_target)
    return momentum(db, user_id, client=client)
