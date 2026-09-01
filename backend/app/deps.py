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


def get_current_user(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header()] = None,
) -> User:
    """Resolve the caller.

    Accepts a bearer token, or an X-User-Id header for the seeded demo profiles
    so a judge can switch officers without a login flow.
    """
    user_id: str | None = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
        try:
            claims = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
            user_id = claims.get("sub")
        except jwt.PyJWTError as exc:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc
    elif x_user_id:
        user_id = x_user_id

    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
