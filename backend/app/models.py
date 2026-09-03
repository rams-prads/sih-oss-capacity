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
    """A designation in the Official Statistical System.

    Designation is the anchor of the competency profile: it is what an officer
    actually holds, and what determines the competencies expected of them. The
    stream separates the statistical ladder from the administrative one, since
    an ASO and a JSO sit at a comparable grade but are measured on different
    things; grade orders the whole hierarchy so career progression - the next
    designation up - is derivable rather than hard-coded.
    """

    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(8), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    stream: Mapped[str] = mapped_column(String(60), default="")
    grade: Mapped[int] = mapped_column(Integer, default=0)

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
    password_hash: Mapped[str] = mapped_column(String(255), default="")

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
    # Karmayogi course windows close; an unfinished enrolment past this date reads
    # as "expired" rather than silently sitting at partial progress for ever.
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


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


# --- Course curriculum: lessons, checkpoints and topic-level results -------
class Topic(Base):
    """A teachable slice of a competency. Questions and results hang off it, so
    "you are weak on imputation" is answerable, not just "weak on C03"."""

    __tablename__ = "topics"

    id: Mapped[str] = mapped_column(String(8), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    competency_id: Mapped[str] = mapped_column(ForeignKey("competencies.id"), nullable=False)


class Lesson(Base):
    """One video in a course."""

    __tablename__ = "lessons"
    __table_args__ = (
        UniqueConstraint("course_identifier", "position", name="uq_course_lesson_position"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_identifier: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    module_index: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    # Authored sandbox lessons belong to a topic; a video ingested from iGOT does
    # not, and forcing one on it would pollute the topic mastery record.
    topic_id: Mapped[str | None] = mapped_column(ForeignKey("topics.id"), nullable=True)
    duration_min: Mapped[int] = mapped_column(Integer, default=10)
    # Present for iGOT lessons: the mp4 the portal serves, played in place here so
    # the watch record is ours rather than one we cannot read back from iGOT.
    video_url: Mapped[str] = mapped_column(String(600), default="")


class Checkpoint(Base):
    """The quiz that gates a module, taken after its lessons are watched."""

    __tablename__ = "checkpoints"
    __table_args__ = (
        UniqueConstraint("course_identifier", "module_index", name="uq_course_checkpoint"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_identifier: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    module_index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    topic_id: Mapped[str] = mapped_column(ForeignKey("topics.id"), nullable=False)
    pass_pct: Mapped[int] = mapped_column(Integer, default=60)


class BankQuestion(Base):
    """Curriculum question, authored and topic-tagged (not LLM generated)."""

    __tablename__ = "bank_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    topic_id: Mapped[str] = mapped_column(ForeignKey("topics.id"), nullable=False, index=True)
    stem: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    answer_index: Mapped[int] = mapped_column(Integer, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, default="")
    difficulty: Mapped[float] = mapped_column(Float, default=0.5)


class LessonProgress(Base):
    __tablename__ = "lesson_progress"
    __table_args__ = (UniqueConstraint("user_id", "lesson_id", name="uq_user_lesson"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"), nullable=False)
    course_identifier: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class CheckpointAttempt(Base):
    """One sitting of a module checkpoint.

    `items` keeps the topic alongside each answer, so topic mastery can be
    rebuilt without re-joining to the question bank as it changes over time.
    """

    __tablename__ = "checkpoint_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    checkpoint_id: Mapped[int] = mapped_column(ForeignKey("checkpoints.id"), nullable=False)
    course_identifier: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    topic_id: Mapped[str] = mapped_column(ForeignKey("topics.id"), nullable=False)
    score_pct: Mapped[float] = mapped_column(Float, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    attempt_no: Mapped[int] = mapped_column(Integer, default=1)
    items: Mapped[list[dict]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
