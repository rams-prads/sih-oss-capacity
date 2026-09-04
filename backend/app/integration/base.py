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

    # An NSSTA programme is not an iGOT course: it runs on fixed dates, seats a
    # named cadre, and an officer is nominated onto it by their department
    # rather than enrolling themselves. These carry that difference so the UI
    # can ask for the right action instead of offering a misleading "Enrol".
    source: str = "igot"          # "igot" | "nssta"
    mode: str = ""                # Classroom / Residential / Online workshop
    eligibility: str = ""         # which cadre may attend
    duration_days: int = 0        # NSSTA publishes days, not minutes
    batch_size: int = 0
    url: str = ""                 # the course on the iGOT portal
    outline: list[str] = []       # module titles, from the Sunbird hierarchy


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


IGOT_PORTAL = "https://portal.igotkarmayogi.gov.in"


def course_url(identifier: str, source: str) -> str:
    """Where an officer actually opens this course.

    Derived from the identifier rather than stored, so it needs no extra field
    in the seed and stays correct when the catalogue is refreshed. Only iGOT
    content has a portal page: an NSSTA programme is a scheduled classroom
    batch, so there is nothing to link to and the card asks for nomination
    instead. Sandbox courses are served by this app and have no external page.
    """
    if source != "igot" or not identifier:
        return ""
    return f"{IGOT_PORTAL}/public/toc/{identifier}/overview"


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
        provider=node.get("provider") or "iGOT Karmayogi",
        duration_min=duration // 60,
        source=node.get("source") or "igot",
        mode=node.get("mode") or "",
        eligibility=node.get("eligibility") or "",
        duration_days=int(node.get("duration_days") or 0),
        batch_size=int(node.get("batch_size") or 0),
        url=course_url(node.get("identifier", ""), node.get("source") or "igot"),
        outline=list(node.get("outline") or []),
    )
