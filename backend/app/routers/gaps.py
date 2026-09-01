"""Gap engine and recommendation endpoints (spec 8.1, 8.2)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.config import get_settings
from app.deps import DbSession, KarmayogiDep
from app.engines.gap import compute_gaps, top_gaps
from app.engines.recommend import recommend_courses
from app.models import Enrolment, User
from app.schemas import (
    CourseOut,
    EnrolmentOut,
    EnrolRequest,
    GapItem,
    GapReport,
    RecommendationResponse,
)

router = APIRouter(tags=["gaps"])


@router.get("/gaps/{user_id}", response_model=GapReport)
def get_gaps(user_id: str, db: DbSession):
    try:
        return compute_gaps(db, user_id)
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found") from exc


@router.get("/gaps/{user_id}/top", response_model=list[GapItem])
def get_top_gaps(user_id: str, db: DbSession, n: int = 5):
    try:
        return top_gaps(compute_gaps(db, user_id), n)
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found") from exc


@router.get("/recommendations/{user_id}", response_model=RecommendationResponse)
def get_recommendations(user_id: str, db: DbSession, client: KarmayogiDep, limit: int = 8):
    try:
        report = compute_gaps(db, user_id)
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found") from exc
    return RecommendationResponse(
        user_id=user_id,
        source=get_settings().karmayogi_mode,
        recommendations=recommend_courses(client, report.items, limit=limit),
    )


@router.get("/courses", response_model=list[CourseOut])
def search_courses(client: KarmayogiDep, competency_ids: str = "", max_level: int = 0):
    ids = [c.strip() for c in competency_ids.split(",") if c.strip()]
    return [CourseOut(**c.model_dump()) for c in client.search_courses(ids, max_level)]


@router.get("/courses/{identifier}", response_model=CourseOut)
def read_course(identifier: str, client: KarmayogiDep):
    course = client.read_course(identifier)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    return CourseOut(**course.model_dump())


@router.post("/users/{user_id}/enrolments", response_model=EnrolmentOut, status_code=201)
def enrol(user_id: str, payload: EnrolRequest, db: DbSession, client: KarmayogiDep):
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    try:
        record = client.enrol(user_id, payload.course_identifier)
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found") from exc
    return EnrolmentOut(**record.model_dump(exclude={"user_id"}))


@router.get("/users/{user_id}/enrolments", response_model=list[EnrolmentOut])
def list_enrolments(user_id: str, db: DbSession):
    rows = db.scalars(
        select(Enrolment).where(Enrolment.user_id == user_id).order_by(Enrolment.enrolled_at)
    ).all()
    return rows
