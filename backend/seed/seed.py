"""Seed the demo database: FRAC taxonomy, 3 OSS roles, officers, history.

Run:  python -m seed.seed        (from backend/)
Idempotent - it drops and recreates the schema each time.
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.models import (  # noqa: E402
    AssessmentResult,
    Competency,
    CompetencyType,
    Enrolment,
    Role,
    RoleRequirement,
    User,
    UserCompetency,
)

H, M, L = 1.0, 0.6, 0.3

# --- 6.2 OSS competency taxonomy -----------------------------------------
COMPETENCIES = [
    ("C01", "Survey Design & Sampling Methodology", CompetencyType.DOMAIN,
     "Sampling frames, probability designs, stratification and error estimation."),
    ("C02", "Questionnaire Design & CAPI/CATI Operations", CompetencyType.DOMAIN,
     "Instrument design, translation and computer-assisted field data collection."),
    ("C03", "Data Quality Assurance, Editing & Imputation", CompetencyType.DOMAIN,
     "Validation rules, consistency edits, outlier treatment and imputation."),
    ("C04", "Descriptive & Inferential Statistical Analysis", CompetencyType.FUNCTIONAL,
     "Summary measures, estimation, hypothesis testing and modelling."),
    ("C05", "National Accounts Statistics (GDP/GVA)", CompetencyType.DOMAIN,
     "SNA concepts and the compilation of national and state accounts."),
    ("C06", "Price Statistics & Index Numbers (CPI/WPI)", CompetencyType.DOMAIN,
     "Index number theory, base revision and price collection quality."),
    ("C07", "SDG Indicators & National Indicator Framework", CompetencyType.DOMAIN,
     "Global and national SDG indicator frameworks and progress reporting."),
    ("C08", "Classification Standards (NIC / NCO)", CompetencyType.DOMAIN,
     "Industrial and occupational classification and survey coding practice."),
    ("C09", "Statistical Software (R / Python)", CompetencyType.FUNCTIONAL,
     "Reproducible analysis pipelines in R and Python for official data."),
    ("C10", "Data Visualization & Reporting", CompetencyType.FUNCTIONAL,
     "Chart selection, tabulation standards and statistical release design."),
    ("C11", "Data Ethics, Confidentiality & Collection of Statistics Act",
     CompetencyType.DOMAIN,
     "Statutory obligations, confidentiality and disclosure control."),
    ("C12", "Big Data & Alternative Data Sources", CompetencyType.DOMAIN,
     "Administrative registers, scanner, mobile and satellite data quality."),
    ("C13", "GIS & Geospatial Statistics", CompetencyType.DOMAIN,
     "Geo-referencing of sampling units and spatial presentation of indicators."),
    ("C14", "Metadata & Dissemination Standards (SDMX)", CompetencyType.DOMAIN,
     "SDMX structures, code lists and machine-readable dissemination."),
    ("C15", "Analytical Thinking & Communication of Results",
     CompetencyType.BEHAVIOURAL,
     "Structuring analysis and communicating findings to decision-makers."),
]

# --- 6.3 Roles and their FRAC requirements -------------------------------
ROLES = {
    "JSO": (
        "Junior Statistical Officer",
        "Conducts and supervises survey operations, validates returns and "
        "prepares tabulations for statistical releases.",
        [("C01", 3, H), ("C02", 3, H), ("C03", 3, H), ("C04", 2, M),
         ("C09", 2, M), ("C11", 2, M), ("C15", 2, M)],
    ),
    "SI": (
        "Statistical Investigator (Field)",
        "Carries out field enumeration, applies classification codes and "
        "ensures the integrity of primary data collection.",
        [("C02", 3, H), ("C03", 2, M), ("C08", 3, H), ("C13", 2, M),
         ("C11", 2, M), ("C15", 2, M)],
    ),
    "DA": (
        "Statistical Data Analyst",
        "Performs analytical work on survey and administrative data and "
        "produces indicator reporting for policy users.",
        [("C04", 4, H), ("C09", 4, H), ("C10", 3, H), ("C07", 3, M),
         ("C12", 2, M), ("C14", 2, M), ("C15", 3, M)],
    ),
}

# --- Demo officers --------------------------------------------------------
# attained levels are deliberately uneven so the department heatmap has shape.
# u-jso-anita is the demo hero: a JSO weak on C01 (Sampling) and C03 (Quality).
DEPT_NSO = "MoSPI - National Statistical Office"
DEPT_FOD = "MoSPI - Field Operations Division"

USERS = [
    ("u-jso-anita", "Anita Deshmukh", "JSO", DEPT_NSO, False,
     {"C01": 1, "C02": 2, "C03": 1, "C04": 2, "C09": 1, "C11": 2, "C15": 2}),
    ("u-jso-rakesh", "Rakesh Menon", "JSO", DEPT_NSO, False,
     {"C01": 3, "C02": 3, "C03": 2, "C04": 2, "C09": 2, "C11": 2, "C15": 1}),
    ("u-jso-farah", "Farah Qureshi", "JSO", DEPT_NSO, False,
     {"C01": 2, "C02": 1, "C03": 3, "C04": 1, "C09": 0, "C11": 2, "C15": 2}),
    ("u-si-vikram", "Vikram Rathore", "SI", DEPT_FOD, False,
     {"C02": 2, "C03": 2, "C08": 1, "C13": 0, "C11": 1, "C15": 2}),
    ("u-si-lalita", "Lalita Barman", "SI", DEPT_FOD, False,
     {"C02": 3, "C03": 2, "C08": 2, "C13": 1, "C11": 2, "C15": 1}),
    ("u-da-suresh", "Suresh Iyer", "DA", DEPT_NSO, False,
     {"C04": 3, "C09": 2, "C10": 2, "C07": 1, "C12": 1, "C14": 0, "C15": 3}),
    ("u-da-neha", "Neha Kulkarni", "DA", DEPT_NSO, False,
     {"C04": 4, "C09": 3, "C10": 3, "C07": 2, "C12": 2, "C14": 1, "C15": 3}),
    ("u-da-imran", "Imran Sheikh", "DA", DEPT_NSO, False,
     {"C04": 2, "C09": 2, "C10": 1, "C07": 1, "C12": 0, "C14": 0, "C15": 2}),
    ("u-admin-meera", "Meera Nair", "DA", DEPT_NSO, True,
     {"C04": 4, "C09": 4, "C10": 4, "C07": 3, "C12": 3, "C14": 3, "C15": 4}),
]

# Prior enrolments so the learner dashboard is not empty on first load.
ENROLMENTS = [
    ("u-jso-anita", "do_3137421900017", "Descriptive and Inferential Statistics for Officers",
     "completed", 100),
    ("u-jso-anita", "do_3137421900028",
     "Data Ethics, Confidentiality and the Collection of Statistics Act", "enrolled", 40),
    ("u-si-vikram", "do_3137421900013", "Questionnaire Design and CAPI Field Operations",
     "enrolled", 25),
    ("u-da-suresh", "do_3137421900025", "Statistical Computing with R for Official Statistics",
     "enrolled", 60),
    ("u-da-neha", "do_3137421900027", "Data Visualization and Statistical Reporting",
     "completed", 100),
]

# Assessment history feeds the gap-closure metric.
HISTORY = [
    ("u-jso-anita", "C04", 75.0, 1, 2),
    ("u-jso-rakesh", "C01", 82.0, 2, 3),
    ("u-si-lalita", "C02", 88.0, 2, 3),
    ("u-da-suresh", "C04", 71.0, 2, 3),
    ("u-da-neha", "C04", 91.0, 3, 4),
    ("u-da-imran", "C10", 45.0, 1, 1),
]


def run() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    now = datetime.now(timezone.utc)

    with SessionLocal() as db:
        db.add_all(
            Competency(id=cid, name=name, type=ctype, description=desc)
            for cid, name, ctype, desc in COMPETENCIES
        )

        for role_id, (name, description, requirements) in ROLES.items():
            db.add(Role(id=role_id, name=name, description=description))
            for competency_id, target, weight in requirements:
                db.add(
                    RoleRequirement(
                        role_id=role_id,
                        competency_id=competency_id,
                        target_level=target,
                        weight=weight,
                    )
                )

        for uid, name, role_id, department, is_admin, levels in USERS:
            slug = name.lower().replace(" ", ".")
            db.add(
                User(
                    id=uid,
                    name=name,
                    email=f"{slug}@mospi.gov.in",
                    role_id=role_id,
                    department=department,
                    is_admin=is_admin,
                )
            )
            for competency_id, level in levels.items():
                db.add(
                    UserCompetency(
                        user_id=uid,
                        competency_id=competency_id,
                        attained_level=level,
                        last_assessed_at=None,
                    )
                )

        for uid, identifier, course_name, status, progress in ENROLMENTS:
            db.add(
                Enrolment(
                    user_id=uid,
                    course_identifier=identifier,
                    course_name=course_name,
                    status=status,
                    progress_pct=progress,
                    enrolled_at=now - timedelta(days=30),
                    completed_at=(now - timedelta(days=7)) if status == "completed" else None,
                )
            )

        for i, (uid, competency_id, score, prior, new) in enumerate(HISTORY):
            correct = round(score / 100 * 8)
            db.add(
                AssessmentResult(
                    user_id=uid,
                    quiz_id=f"seed-quiz-{i:02d}",
                    competency_id=competency_id,
                    score_pct=score,
                    per_item=[True] * correct + [False] * (8 - correct),
                    prior_level=prior,
                    new_level=new,
                    created_at=now - timedelta(days=20 - i),
                )
            )

        db.commit()

    print(
        f"Seeded {len(COMPETENCIES)} competencies, {len(ROLES)} roles, "
        f"{len(USERS)} officers, {len(ENROLMENTS)} enrolments, "
        f"{len(HISTORY)} assessment records."
    )


if __name__ == "__main__":
    run()
