"""Real Sunbird client. Selected with KARMAYOGI_MODE=sunbird.

Paths follow the established Sunbird/DIKSHA API pattern; verify exact versions
against knowlg.sunbird.org and lern.sunbird.org for the target deployment before
pointing this at a live gateway. Live iGOT access requires Karmayogi Bharat
credentials, which this repository does not ship, so the sandbox (mock) path is
the default and the demo makes zero external calls.
"""
from __future__ import annotations

from typing import Any

import httpx

from app.config import get_settings
from app.integration.base import Course, EnrolmentRecord, course_from_sunbird


class SunbirdKarmayogiClient:
    mode = "sunbird"

    SEARCH_PATH = "/content/v1/search"
    READ_PATH = "/content/v1/read/{identifier}"
    HIERARCHY_PATH = "/course/v1/hierarchy/{identifier}"
    ENROL_PATH = "/course/v1/enrol"
    ENROLMENT_LIST_PATH = "/course/v1/user/enrollment/list/{user_id}"
    CONTENT_STATE_PATH = "/course/v1/content/state/update"

    def __init__(self, base: str | None = None, user_token: str | None = None) -> None:
        settings = get_settings()
        self.base = (base or settings.sunbird_base).rstrip("/")
        self.api_key = settings.sunbird_api_key
        self.user_token = user_token or settings.sunbird_user_token
        if not self.base:
            raise RuntimeError("SUNBIRD_BASE must be set when KARMAYOGI_MODE=sunbird")
        self._client = httpx.Client(timeout=15.0)

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",       # API gateway key
            "x-authenticated-user-token": self.user_token,   # Keycloak user token
            "Content-Type": "application/json",
        }

    def _unwrap(self, response: httpx.Response) -> dict[str, Any]:
        response.raise_for_status()
        payload = response.json()
        if payload.get("responseCode") != "OK":
            params = payload.get("params", {})
            raise RuntimeError(f"Sunbird error: {params.get('errmsg') or params.get('status')}")
        return payload.get("result", {})

    def search_courses(self, competency_ids: list[str], max_level: int) -> list[Course]:
        body = {
            "request": {
                "filters": {
                    "primaryCategory": ["Course"],
                    "status": ["Live"],
                    "se_competencies": competency_ids,
                },
                "limit": 50,
            }
        }
        result = self._unwrap(
            self._client.post(f"{self.base}{self.SEARCH_PATH}", json=body, headers=self._headers())
        )
        courses = [course_from_sunbird(n) for n in result.get("content", [])]
        if max_level > 0:
            courses = [c for c in courses if c.target_level <= max_level]
        return courses

    def read_course(self, identifier: str) -> Course | None:
        path = self.READ_PATH.format(identifier=identifier)
        result = self._unwrap(self._client.get(f"{self.base}{path}", headers=self._headers()))
        node = result.get("content")
        return course_from_sunbird(node) if node else None

    def read_hierarchy(self, identifier: str) -> dict[str, Any]:
        path = self.HIERARCHY_PATH.format(identifier=identifier)
        return self._unwrap(self._client.get(f"{self.base}{path}", headers=self._headers()))

    def enrol(self, user_id: str, course_identifier: str) -> EnrolmentRecord:
        body = {"request": {"userId": user_id, "courseId": course_identifier}}
        self._unwrap(
            self._client.post(f"{self.base}{self.ENROL_PATH}", json=body, headers=self._headers())
        )
        course = self.read_course(course_identifier)
        return EnrolmentRecord(
            user_id=user_id,
            course_identifier=course_identifier,
            course_name=course.name if course else "",
        )

    def get_progress(self, user_id: str) -> list[EnrolmentRecord]:
        path = self.ENROLMENT_LIST_PATH.format(user_id=user_id)
        result = self._unwrap(self._client.get(f"{self.base}{path}", headers=self._headers()))
        records = []
        for row in result.get("courses", []):
            content = row.get("content") or {}
            records.append(
                EnrolmentRecord(
                    user_id=user_id,
                    course_identifier=row.get("courseId", ""),
                    course_name=content.get("name", ""),
                    status="completed" if row.get("status") == 2 else "enrolled",
                    progress_pct=int(row.get("completionPercentage") or 0),
                )
            )
        return records
