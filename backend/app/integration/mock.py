"""Sandbox implementation of the Sunbird contract (demo default).

Reads the seeded catalogue and returns responses in the exact Sunbird envelope,
so SunbirdKarmayogiClient is a drop-in swap. Runs with zero external calls.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.integration.base import Course, EnrolmentRecord, course_from_sunbird, sunbird_envelope

SEED_PATH = Path(__file__).resolve().parents[2] / "seed" / "igot_courses_seed.json"


@lru_cache
def _load_catalogue() -> list[dict[str, Any]]:
    with SEED_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)["content"]


class EnrolmentStore:
    def upsert(self, record: EnrolmentRecord) -> EnrolmentRecord:  # pragma: no cover
        raise NotImplementedError

    def list_for(self, user_id: str) -> list[EnrolmentRecord]:  # pragma: no cover
        raise NotImplementedError


class InMemoryEnrolmentStore(EnrolmentStore):
    def __init__(self) -> None:
        self._rows: dict[tuple[str, str], EnrolmentRecord] = {}

    def upsert(self, record: EnrolmentRecord) -> EnrolmentRecord:
        key = (record.user_id, record.course_identifier)
        return self._rows.setdefault(key, record)

    def list_for(self, user_id: str) -> list[EnrolmentRecord]:
        return [r for (uid, _), r in self._rows.items() if uid == user_id]


class MockKarmayogiClient:
    """Speaks the Sunbird contract from seed data."""

    mode = "mock"

    def __init__(self, enrolment_store: EnrolmentStore | None = None) -> None:
        self.enrolments = enrolment_store or InMemoryEnrolmentStore()

    # -- raw Sunbird-shaped responses (what an HTTP sandbox returns) -------
    def search_response(self, competency_ids: list[str], max_level: int) -> dict[str, Any]:
        nodes = [
            n
            for n in _load_catalogue()
            if (not competency_ids or set(n["se_competencies"]) & set(competency_ids))
            and (max_level <= 0 or int(n.get("targetLevel", 0)) <= max_level)
        ]
        return sunbird_envelope("api.content.search", {"count": len(nodes), "content": nodes})

    def read_response(self, identifier: str) -> dict[str, Any]:
        node = next((n for n in _load_catalogue() if n["identifier"] == identifier), None)
        return sunbird_envelope("api.content.read", {"content": node})

    # -- KarmayogiClient interface ----------------------------------------
    def search_courses(self, competency_ids: list[str], max_level: int) -> list[Course]:
        payload = self.search_response(competency_ids, max_level)
        return [course_from_sunbird(n) for n in payload["result"]["content"]]

    def read_course(self, identifier: str) -> Course | None:
        node = self.read_response(identifier)["result"]["content"]
        return course_from_sunbird(node) if node else None

    def enrol(self, user_id: str, course_identifier: str) -> EnrolmentRecord:
        course = self.read_course(course_identifier)
        if course is None:
            raise KeyError(f"Unknown course identifier: {course_identifier}")
        return self.enrolments.upsert(
            EnrolmentRecord(
                user_id=user_id,
                course_identifier=course_identifier,
                course_name=course.name,
            )
        )

    def get_progress(self, user_id: str) -> list[EnrolmentRecord]:
        return self.enrolments.list_for(user_id)

    def all_courses(self) -> list[Course]:
        return [course_from_sunbird(n) for n in _load_catalogue()]
