"""SQLAlchemy models for the FRAC domain (spec 6.4).

FRAC = Framework of Roles, Activities and Competencies (Karmayogi/CBC).
Proficiency is an integer 0-4: 0 Unaware, 1 Aware, 2 Working, 3 Proficient, 4 Expert.
"""
from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CompetencyType(str, enum.Enum):
    BEHAVIOURAL = "BEHAVIOURAL"
    FUNCTIONAL = "FUNCTIONAL"
    DOMAIN = "DOMAIN"


PROFICIENCY_LABELS = {
    0: "Unaware",
    1: "Aware",
    2: "Working",
    3: "Proficient",
    4: "Expert",
}


class Competency(Base):
    __tablename__ = "competencies"

    id: Mapped[str] = mapped_column(String(8), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[CompetencyType] = mapped_column(Enum(CompetencyType), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")

    requirements: Mapped[list[RoleRequirement]] = relationship(back_populates="competency")


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(8), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")

    requirements: Mapped[list[RoleRequirement]] = relationship(
        back_populates="role", cascade="all, delete-orphan"
    )
    users: Mapped[list[User]] = relationship(back_populates="role")


class RoleRequirement(Base):
    """(competency, target_level, weight) triple that a role demands."""

    __tablename__ = "role_requirements"
    __table_args__ = (UniqueConstraint("role_id", "competency_id", name="uq_role_competency"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id"), nullable=False)
    competency_id: Mapped[str] = mapped_column(ForeignKey("competencies.id"), nullable=False)
    target_level: Mapped[int] = mapped_column(Integer, nullable=False)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    role: Mapped[Role] = relationship(back_populates="requirements")
    competency: Mapped[Competency] = relationship(back_populates="requirements")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(200), default="")
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id"), nullable=False)
    department: Mapped[str] = mapped_column(String(200), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    role: Mapped[Role] = relationship(back_populates="users")
    competencies: Mapped[list[UserCompetency]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserCompetency(Base):
    __tablename__ = "user_competencies"
    __table_args__ = (UniqueConstraint("user_id", "competency_id", name="uq_user_competency"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    competency_id: Mapped[str] = mapped_column(ForeignKey("competencies.id"), nullable=False)
    attained_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_assessed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped[User] = relationship(back_populates="competencies")
    competency: Mapped[Competency] = relationship()


class Enrolment(Base):
    __tablename__ = "enrolments"
    __table_args__ = (UniqueConstraint("user_id", "course_identifier", name="uq_user_course"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    course_identifier: Mapped[str] = mapped_column(String(64), nullable=False)
    course_name: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(32), default="enrolled")
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    enrolled_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class SourceMaterial(Base):
    """An uploaded PDF/TXT that quizzes are generated from."""

    __tablename__ = "source_materials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), default="")
    char_count: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text, default="")
    uploaded_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    source_material_id: Mapped[str | None] = mapped_column(
        ForeignKey("source_materials.id"), nullable=True
    )
    competency_id: Mapped[str] = mapped_column(ForeignKey("competencies.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), default="")
    generator: Mapped[str] = mapped_column(String(50), default="stub")
    rejected_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    questions: Mapped[list[Question]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan", order_by="Question.position"
    )


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    quiz_id: Mapped[str] = mapped_column(ForeignKey("quizzes.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    stem: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    answer_index: Mapped[int] = mapped_column(Integer, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, default="")
    difficulty: Mapped[float] = mapped_column(Float, default=0.5)
    competency_id: Mapped[str] = mapped_column(ForeignKey("competencies.id"), nullable=False)

    quiz: Mapped[Quiz] = relationship(back_populates="questions")


class AssessmentResult(Base):
    __tablename__ = "assessment_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    quiz_id: Mapped[str] = mapped_column(ForeignKey("quizzes.id"), nullable=False)
    competency_id: Mapped[str] = mapped_column(ForeignKey("competencies.id"), nullable=False)
    score_pct: Mapped[float] = mapped_column(Float, nullable=False)
    per_item: Mapped[list[bool]] = mapped_column(JSON, nullable=False)
    prior_level: Mapped[int] = mapped_column(Integer, default=0)
    new_level: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
