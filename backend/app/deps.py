"""Shared FastAPI dependencies: Karmayogi client selection and app auth."""
from __future__ import annotations

import time
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.integration.base import EnrolmentRecord, KarmayogiClient
from app.integration.mock import EnrolmentStore, MockKarmayogiClient
from app.models import Enrolment, User

DbSession = Annotated[Session, Depends(get_db)]


class DbEnrolmentStore(EnrolmentStore):
    """Persists sandbox enrolments in the app database."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def upsert(self, record: EnrolmentRecord) -> EnrolmentRecord:
        row = self.db.scalar(
            select(Enrolment).where(
                Enrolment.user_id == record.user_id,
                Enrolment.course_identifier == record.course_identifier,
            )
        )
        if row is None:
            row = Enrolment(
                user_id=record.user_id,
                course_identifier=record.course_identifier,
                course_name=record.course_name,
                status=record.status,
                progress_pct=record.progress_pct,
            )
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
        return EnrolmentRecord(
            user_id=row.user_id,
            course_identifier=row.course_identifier,
            course_name=row.course_name,
            status=row.status,
            progress_pct=row.progress_pct,
        )

    def list_for(self, user_id: str) -> list[EnrolmentRecord]:
        rows = self.db.scalars(select(Enrolment).where(Enrolment.user_id == user_id)).all()
        return [
            EnrolmentRecord(
                user_id=r.user_id,
                course_identifier=r.course_identifier,
                course_name=r.course_name,
                status=r.status,
                progress_pct=r.progress_pct,
            )
            for r in rows
        ]


def get_karmayogi_client(db: DbSession) -> KarmayogiClient:
    """mock (default, offline) or sunbird (live contract), chosen by KARMAYOGI_MODE."""
    mode = get_settings().karmayogi_mode.lower()
    if mode == "sunbird":
        from app.integration.sunbird import SunbirdKarmayogiClient

        return SunbirdKarmayogiClient()
    return MockKarmayogiClient(enrolment_store=DbEnrolmentStore(db))


KarmayogiDep = Annotated[KarmayogiClient, Depends(get_karmayogi_client)]


# --- app auth (Sunbird/Keycloak auth is deliberately out of scope) --------
def create_access_token(user_id: str) -> str:
    settings = get_settings()
    payload = {
        "sub": user_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + settings.jwt_ttl_minutes * 60,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def _user_from_token(db: Session, authorization: str | None) -> tuple[User | None, bool]:
    """Returns (user, came_from_token). Raises on a malformed or expired token."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None, False
    token = authorization.split(" ", 1)[1]
    try:
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc
    return db.get(User, claims.get("sub", "")), True


def get_current_user(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header()] = None,
) -> User:
    """Resolve the caller from a bearer token, or from X-User-Id in demo mode.

    The header shortcut lets a judge switch between seeded officers without a
    login. It is never sufficient for administrator access - see require_admin.
    """
    user, _ = _user_from_token(db, authorization)

    if user is None and x_user_id and get_settings().demo_header_auth:
        user = db.get(User, x_user_id)

    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """Administrator access needs a real token from a password login.

    The X-User-Id demo shortcut is deliberately not accepted here: otherwise
    anyone could read the whole department's record by naming an admin.
    """
    user, from_token = _user_from_token(db, authorization)
    if user is None or not from_token:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Sign in as an administrator to view department analytics",
        )
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
