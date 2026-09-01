"""Officer profiles, roles and the competency taxonomy."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, create_access_token
from app.models import Competency, Role, User, UserCompetency
from app.schemas import (
    CompetencyOut,
    LoginRequest,
    RoleOut,
    RoleRequirementOut,
    TokenOut,
    UserCompetencyOut,
    UserDetailOut,
    UserOut,
)

router = APIRouter(tags=["users"])


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        role_id=user.role_id,
        role_name=user.role.name if user.role else user.role_id,
        department=user.department,
        is_admin=user.is_admin,
    )


@router.get("/competencies", response_model=list[CompetencyOut])
def list_competencies(db: DbSession):
    return db.scalars(select(Competency).order_by(Competency.id)).all()


@router.get("/roles", response_model=list[RoleOut])
def list_roles(db: DbSession):
    roles = db.scalars(select(Role).order_by(Role.id)).all()
    names = {c.id: c.name for c in db.scalars(select(Competency)).all()}
    return [
        RoleOut(
            id=r.id,
            name=r.name,
            description=r.description,
            requirements=[
                RoleRequirementOut(
                    competency_id=req.competency_id,
                    competency_name=names.get(req.competency_id, req.competency_id),
                    target_level=req.target_level,
                    weight=req.weight,
                )
                for req in sorted(r.requirements, key=lambda x: x.competency_id)
            ],
        )
        for r in roles
    ]


@router.get("/users", response_model=list[UserOut])
def list_users(db: DbSession, department: str | None = None):
    stmt = select(User).order_by(User.name)
    if department:
        stmt = stmt.where(User.department == department)
    return [_user_out(u) for u in db.scalars(stmt).all()]


@router.get("/users/{user_id}", response_model=UserDetailOut)
def get_user(user_id: str, db: DbSession):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    names = {c.id: c.name for c in db.scalars(select(Competency)).all()}
    rows = db.scalars(select(UserCompetency).where(UserCompetency.user_id == user_id)).all()
    base = _user_out(user)
    return UserDetailOut(
        **base.model_dump(),
        competencies=[
            UserCompetencyOut(
                competency_id=uc.competency_id,
                competency_name=names.get(uc.competency_id, uc.competency_id),
                attained_level=uc.attained_level,
                last_assessed_at=uc.last_assessed_at,
            )
            for uc in sorted(rows, key=lambda x: x.competency_id)
        ],
    )


@router.get("/departments", response_model=list[str])
def list_departments(db: DbSession):
    return sorted({d for (d,) in db.execute(select(User.department)).all()})


@router.post("/auth/login", response_model=TokenOut)
def login(payload: LoginRequest, db: DbSession):
    """Demo login: pick a seeded officer. Real deployments federate to Keycloak."""
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown officer")
    return TokenOut(access_token=create_access_token(user.id), user=_user_out(user))


@router.get("/auth/me", response_model=UserOut)
def me(user: CurrentUser):
    return _user_out(user)
