"""A sandbox that speaks the Sunbird REST contract over real HTTP.

Mounted at /mock-sunbird, this serves the same paths and the same response
envelope a Sunbird gateway does, from seed data. Point SUNBIRD_BASE at it and
SunbirdKarmayogiClient talks to it unmodified - which is how we demonstrate that
the real client works without claiming access to production iGOT.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body

from app.integration.base import sunbird_envelope
from app.integration.mock import MockKarmayogiClient

router = APIRouter(prefix="/mock-sunbird", tags=["sunbird-sandbox"])
_client = MockKarmayogiClient()
_enrolments: dict[str, list[dict[str, Any]]] = {}


@router.post("/content/v1/search")
def content_search(payload: dict[str, Any] = Body(default={})):
    filters = (payload.get("request") or {}).get("filters") or {}
    competency_ids = filters.get("se_competencies") or []
    if isinstance(competency_ids, str):
        competency_ids = [competency_ids]
    return _client.search_response(list(competency_ids), max_level=0)


@router.get("/content/v1/read/{identifier}")
def content_read(identifier: str):
    return _client.read_response(identifier)


@router.get("/course/v1/hierarchy/{identifier}")
def course_hierarchy(identifier: str):
    course = _client.read_course(identifier)
    if course is None:
        return sunbird_envelope("api.course.hierarchy", {"content": None})
    return sunbird_envelope(
        "api.course.hierarchy",
        {
            "content": {
                "identifier": course.identifier,
                "name": course.name,
                "children": [
                    {
                        "identifier": f"{course.identifier}_m{i}",
                        "name": f"Module {i}",
                        "primaryCategory": "Course Unit",
                    }
                    for i in range(1, 4)
                ],
            }
        },
    )


@router.post("/course/v1/enrol")
def course_enrol(payload: dict[str, Any] = Body(...)):
    request = payload.get("request") or {}
    user_id = request.get("userId", "")
    course_id = request.get("courseId", "")
    course = _client.read_course(course_id)
    rows = _enrolments.setdefault(user_id, [])
    if not any(r["courseId"] == course_id for r in rows):
        rows.append(
            {
                "courseId": course_id,
                "status": 0,
                "completionPercentage": 0,
                "content": {"name": course.name if course else ""},
            }
        )
    return sunbird_envelope("api.course.enrol", {"response": "SUCCESS"})


@router.get("/course/v1/user/enrollment/list/{user_id}")
def enrolment_list(user_id: str):
    rows = _enrolments.get(user_id, [])
    return sunbird_envelope("api.course.enrolment.list", {"courses": rows})


@router.post("/course/v1/content/state/update")
def content_state_update(payload: dict[str, Any] = Body(...)):
    return sunbird_envelope("api.course.content.state.update", {"response": "SUCCESS"})
