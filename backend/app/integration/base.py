"""The single integration seam with iGOT Karmayogi.

iGOT Karmayogi is engineered on the open-source Sunbird stack, so we code against
the Sunbird REST contract (content search/read, course enrol, enrolment list).
Two implementations satisfy this Protocol:

  * MockKarmayogiClient   - serves seed data in the exact Sunbird envelope (demo default)
  * SunbirdKarmayogiClient - talks to real Sunbird endpoints, auth-ready

Selecting between them is the KARMAYOGI_MODE env var. Production access needs
Karmayogi Bharat credentials; this repo ships with the sandbox path enabled.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel


class Course(BaseModel):
    identifier: str
    name: str
    description: str = ""
    competency_ids: list[str] = []
    target_level: int = 0
    provider: str = "iGOT Karmayogi"
    duration_min: int = 0


class EnrolmentRecord(BaseModel):
    user_id: str
    course_identifier: str
    course_name: str = ""
    status: str = "enrolled"
    progress_pct: int = 0


@runtime_checkable
class KarmayogiClient(Protocol):
    """Contract every catalogue backend must satisfy."""

    mode: str

    def search_courses(self, competency_ids: list[str], max_level: int) -> list[Course]: ...

    def read_course(self, identifier: str) -> Course | None: ...

    def enrol(self, user_id: str, course_identifier: str) -> EnrolmentRecord: ...

    def get_progress(self, user_id: str) -> list[EnrolmentRecord]: ...


# --- Sunbird envelope helpers --------------------------------------------
def sunbird_envelope(api_id: str, result: dict[str, Any]) -> dict[str, Any]:
    """Wrap a payload in the standard Sunbird API response envelope."""
    return {
        "id": api_id,
        "ver": "1.0",
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "params": {"status": "successful"},
        "responseCode": "OK",
        "result": result,
    }


def course_from_sunbird(node: dict[str, Any]) -> Course:
    """Map a Sunbird content node onto our Course model."""
    duration = node.get("duration") or 0
    try:
        duration = int(duration)
    except (TypeError, ValueError):
        duration = 0
    competencies = node.get("se_competencies") or node.get("competencies") or []
    if isinstance(competencies, str):
        competencies = [competencies]
    return Course(
        identifier=node.get("identifier", ""),
        name=node.get("name", ""),
        description=node.get("description", "") or "",
        competency_ids=list(competencies),
        target_level=int(node.get("targetLevel") or 0),
        provider=node.get("provider") or node.get("source") or "iGOT Karmayogi",
        duration_min=duration // 60,
    )
