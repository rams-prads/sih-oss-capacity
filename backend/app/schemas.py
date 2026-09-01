"""Pydantic v2 schemas for the REST surface."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import CompetencyType


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- taxonomy -------------------------------------------------------------
class CompetencyOut(ORMModel):
    id: str
    name: str
    type: CompetencyType
    description: str = ""


class RoleRequirementOut(ORMModel):
    competency_id: str
    competency_name: str = ""
    target_level: int
    weight: float


class RoleOut(ORMModel):
    id: str
    name: str
    description: str = ""
    requirements: list[RoleRequirementOut] = []


# --- users ----------------------------------------------------------------
class UserCompetencyOut(ORMModel):
    competency_id: str
    competency_name: str = ""
    attained_level: int
    last_assessed_at: datetime | None = None


class UserOut(ORMModel):
    id: str
    name: str
    email: str = ""
    role_id: str
    role_name: str = ""
    department: str
    is_admin: bool = False


class UserDetailOut(UserOut):
    competencies: list[UserCompetencyOut] = []


# --- gaps -----------------------------------------------------------------
class GapItem(BaseModel):
    competency_id: str
    competency_name: str
    competency_type: CompetencyType
    target_level: int
    attained_level: int
    gap: int
    weight: float
    weighted_gap: float
    meets_target: bool


class GapReport(BaseModel):
    user_id: str
    user_name: str
    role_id: str
    role_name: str
    department: str
    items: list[GapItem]
    total_weighted_gap: float
    max_weighted_gap: float
    readiness_pct: float = Field(
        description="100 x (1 - total_weighted_gap / max_weighted_gap); role readiness."
    )


# --- courses / recommendations -------------------------------------------
class CourseOut(BaseModel):
    identifier: str
    name: str
    description: str = ""
    competency_ids: list[str] = []
    target_level: int = 0
    provider: str = "iGOT Karmayogi"
    duration_min: int = 0


class Recommendation(BaseModel):
    course: CourseOut
    score: float
    covers_gap_competencies: list[str]
    covers_count: int
    reason: str
    primary_competency_id: str
    primary_competency_name: str


class RecommendationResponse(BaseModel):
    user_id: str
    source: str = Field(description="mock | sunbird — which Karmayogi client served the catalogue")
    recommendations: list[Recommendation]


class EnrolRequest(BaseModel):
    course_identifier: str


class EnrolmentOut(ORMModel):
    course_identifier: str
    course_name: str = ""
    status: str
    progress_pct: int
    enrolled_at: datetime | None = None
    completed_at: datetime | None = None


class ProgressUpdate(BaseModel):
    progress_pct: int = Field(ge=0, le=100)


# --- quiz -----------------------------------------------------------------
class QuestionOut(ORMModel):
    id: int
    position: int
    stem: str
    options: list[str]
    difficulty: float
    competency_id: str


class QuestionWithAnswer(QuestionOut):
    answer_index: int
    explanation: str = ""


class QuizOut(ORMModel):
    id: str
    competency_id: str
    competency_name: str = ""
    title: str
    generator: str
    source_material_id: str | None = None
    questions: list[QuestionOut] = []


class UploadOut(BaseModel):
    source_material_id: str
    filename: str
    char_count: int
    pages: int = 0


class GenerateQuizRequest(BaseModel):
    source_material_id: str
    competency_id: str
    num_questions: int = Field(default=8, ge=1, le=20)


class QuizGenerationOut(BaseModel):
    quiz: QuizOut
    requested: int
    generated: int
    rejected: int
    validity_rate: float


class SubmitQuizRequest(BaseModel):
    answers: list[int]


class SubmitQuizOut(BaseModel):
    quiz_id: str
    competency_id: str
    competency_name: str
    score_pct: float
    correct_count: int
    total: int
    per_item: list[bool]
    prior_level: int
    new_level: int
    level_changed: bool
    prior_gap: int
    new_gap: int
    review: list[QuestionWithAnswer] = []


# --- admin ----------------------------------------------------------------
class HeatmapCell(BaseModel):
    user_id: str
    user_name: str
    competency_id: str
    attained_level: int
    target_level: int
    gap: int


class CompetencyStat(BaseModel):
    competency_id: str
    competency_name: str
    competency_type: CompetencyType
    avg_attained: float
    avg_target: float
    avg_gap: float
    avg_weighted_gap: float
    officers_meeting_target: int
    officers_requiring: int
    pct_meeting_target: float


class CohortRecommendation(BaseModel):
    competency_id: str
    competency_name: str
    officers_below_target: int
    avg_gap: float
    course: CourseOut | None = None


class AdminOverview(BaseModel):
    department: str
    officer_count: int
    avg_readiness_pct: float
    avg_weighted_gap: float
    catalogue_coverage_pct: float
    competency_stats: list[CompetencyStat]
    top_gaps: list[CompetencyStat]
    heatmap: list[HeatmapCell]
    cohort_recommendations: list[CohortRecommendation]


class MetricsOut(BaseModel):
    officers: int
    departments: int
    competencies: int
    roles: int
    catalogue_size: int
    catalogue_coverage_pct: float
    assessments_taken: int
    mcq_validity_rate_pct: float
    avg_gap_closure_pct: float
    avg_readiness_pct: float


# --- auth -----------------------------------------------------------------
class LoginRequest(BaseModel):
    user_id: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
