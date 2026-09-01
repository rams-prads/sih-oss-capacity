"""Seed the demo database: FRAC taxonomy, 3 OSS roles, officers, history.

Run:  python -m seed.seed        (from backend/)
Idempotent - it drops and recreates the schema each time.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.models import (  # noqa: E402
    AssessmentResult,
    BankQuestion,
    Checkpoint,
    CheckpointAttempt,
    Competency,
    CompetencyType,
    Enrolment,
    Lesson,
    LessonProgress,
    Role,
    RoleRequirement,
    Topic,
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

# Assessment history feeds the gap-closure metric.
HISTORY = [
    ("u-jso-anita", "C04", 75.0, 1, 2),
    ("u-jso-rakesh", "C01", 82.0, 2, 3),
    ("u-si-lalita", "C02", 88.0, 2, 3),
    ("u-da-suresh", "C04", 71.0, 2, 3),
    ("u-da-neha", "C04", 91.0, 3, 4),
    ("u-da-imran", "C10", 45.0, 1, 1),
]


# --- Learning histories ---------------------------------------------------
# (lessons_done, [(module_index, correct_of_4), ...], enrolled_days_ago, expires_in_days)
# Status is DERIVED from this, never stated: all lessons + all checkpoints passed
# is "completed"; an unfinished course past its expiry date is "expired".
SURVEY_DESIGN = "do_3137421900011"
DATA_QUALITY = "do_3137421900015"
QUESTIONNAIRE = "do_3137421900013"
DESCRIPTIVE = "do_3137421900017"
R_COMPUTING = "do_3137421900025"
CLASSIFICATION = "do_3137421900023"

LEARNING = [
    # Anita is the demo profile: one of every status, and a retried checkpoint.
    ("u-jso-anita", SURVEY_DESIGN, 4, [(0, 3)], 40, 55),
    ("u-jso-anita", DESCRIPTIVE, 9, [(0, 4), (1, 3), (2, 1), (2, 3)], 120, 200),
    ("u-jso-anita", CLASSIFICATION, 3, [], 150, -20),
    ("u-jso-anita", DATA_QUALITY, 0, [], 8, 90),

    ("u-jso-rakesh", SURVEY_DESIGN, 9, [(0, 4), (1, 4), (2, 3)], 100, 180),
    ("u-jso-rakesh", R_COMPUTING, 6, [(0, 3), (1, 2), (1, 3)], 30, 60),

    ("u-jso-farah", DATA_QUALITY, 2, [], 20, 70),
    ("u-jso-farah", QUESTIONNAIRE, 0, [], 5, 90),

    ("u-si-vikram", QUESTIONNAIRE, 5, [(0, 3)], 45, 45),
    ("u-si-vikram", CLASSIFICATION, 1, [], 140, -10),

    ("u-si-lalita", QUESTIONNAIRE, 9, [(0, 4), (1, 3), (2, 4)], 110, 190),
    ("u-si-lalita", CLASSIFICATION, 4, [(0, 3)], 25, 65),

    ("u-da-suresh", R_COMPUTING, 7, [(0, 4), (1, 3)], 35, 50),
    ("u-da-suresh", DESCRIPTIVE, 9, [(0, 3), (1, 4), (2, 3)], 130, 210),

    ("u-da-neha", DESCRIPTIVE, 9, [(0, 4), (1, 4), (2, 4)], 160, 240),
    ("u-da-neha", R_COMPUTING, 9, [(0, 4), (1, 3), (2, 4)], 90, 170),

    ("u-da-imran", DESCRIPTIVE, 2, [], 15, 75),
    ("u-da-imran", R_COMPUTING, 0, [], 6, 85),

    ("u-admin-meera", DESCRIPTIVE, 9, [(0, 4), (1, 4), (2, 3)], 200, 280),
]


def load_curriculum(db, now):
    """Topics, lessons, checkpoints and the authored question bank."""
    here = Path(__file__).resolve().parent
    curriculum = json.loads((here / "curriculum.json").read_text(encoding="utf-8"))
    bank = json.loads((here / "question_bank.json").read_text(encoding="utf-8"))

    for topic_id, meta in curriculum["topics"].items():
        db.add(Topic(id=topic_id, name=meta["name"], competency_id=meta["competency_id"]))

    lesson_count = 0
    for course_id, modules in curriculum["courses"].items():
        position = 0
        for module_index, module in enumerate(modules):
            for title, minutes in module["lessons"]:
                db.add(
                    Lesson(
                        course_identifier=course_id,
                        position=position,
                        module_index=module_index,
                        title=title,
                        topic_id=module["topic"],
                        duration_min=minutes,
                    )
                )
                position += 1
                lesson_count += 1
            db.add(
                Checkpoint(
                    course_identifier=course_id,
                    module_index=module_index,
                    title=module["title"],
                    topic_id=module["topic"],
                    pass_pct=60,
                )
            )

    question_count = 0
    for topic_id, questions in bank.items():
        if topic_id.startswith("_"):
            continue
        for q in questions:
            db.add(
                BankQuestion(
                    topic_id=topic_id,
                    stem=q["stem"],
                    options=q["options"],
                    answer_index=q["answer_index"],
                    explanation=q.get("explanation", ""),
                    difficulty=q.get("difficulty", 0.5),
                )
            )
            question_count += 1

    db.flush()
    return lesson_count, question_count


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

        lesson_count, question_count = load_curriculum(db, now)

        catalogue = json.loads(
            (Path(__file__).resolve().parent / "igot_courses_seed.json").read_text(
                encoding="utf-8"
            )
        )
        course_names = {c["identifier"]: c["name"] for c in catalogue["content"]}

        lessons_by_course: dict[str, list[Lesson]] = {}
        checkpoints_by_course: dict[str, dict[int, Checkpoint]] = {}
        for lesson in db.scalars(select(Lesson).order_by(Lesson.position)).all():
            lessons_by_course.setdefault(lesson.course_identifier, []).append(lesson)
        for cp in db.scalars(select(Checkpoint)).all():
            checkpoints_by_course.setdefault(cp.course_identifier, {})[cp.module_index] = cp

        for uid, course_id, lessons_done, attempts, enrolled_ago, expires_in in LEARNING:
            enrolled_at = now - timedelta(days=enrolled_ago)
            db.add(
                Enrolment(
                    user_id=uid,
                    course_identifier=course_id,
                    course_name=course_names.get(course_id, ""),
                    status="enrolled",
                    progress_pct=0,          # recomputed from lessons and checkpoints
                    enrolled_at=enrolled_at,
                    expires_at=enrolled_at + timedelta(days=enrolled_ago + expires_in),
                )
            )

            course_lessons = lessons_by_course.get(course_id, [])
            for offset, lesson in enumerate(course_lessons[:lessons_done]):
                db.add(
                    LessonProgress(
                        user_id=uid,
                        lesson_id=lesson.id,
                        course_identifier=course_id,
                        completed_at=enrolled_at + timedelta(days=offset + 1),
                    )
                )

            seen: dict[int, int] = {}
            for order, (module_index, correct) in enumerate(attempts):
                checkpoint = checkpoints_by_course.get(course_id, {}).get(module_index)
                if checkpoint is None:
                    continue
                seen[module_index] = seen.get(module_index, 0) + 1
                score = round(100 * correct / 4, 1)
                db.add(
                    CheckpointAttempt(
                        user_id=uid,
                        checkpoint_id=checkpoint.id,
                        course_identifier=course_id,
                        topic_id=checkpoint.topic_id,
                        score_pct=score,
                        passed=score >= checkpoint.pass_pct,
                        attempt_no=seen[module_index],
                        items=[
                            {
                                "question_id": 0,
                                "topic_id": checkpoint.topic_id,
                                "correct": i < correct,
                            }
                            for i in range(4)
                        ],
                        created_at=enrolled_at + timedelta(days=order + 2),
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

        db.flush()

        # Progress is derived, so write the derived value back onto the enrolment
        # rows; nothing in the app sets progress_pct by hand.
        from app.engines.progress import course_progress, derive_status

        for enrolment in db.scalars(select(Enrolment)).all():
            progress = course_progress(db, enrolment.user_id, enrolment.course_identifier)
            enrolment.progress_pct = progress["progress_pct"]
            enrolment.status = derive_status(enrolment, progress, now)
            if enrolment.status == "completed" and enrolment.completed_at is None:
                enrolment.completed_at = enrolment.enrolled_at + timedelta(days=30)

        db.commit()

    print(
        f"Seeded {len(COMPETENCIES)} competencies, {len(ROLES)} roles, "
        f"{len(USERS)} officers, {len(LEARNING)} enrolments with curriculum "
        f"({lesson_count} lessons, {question_count} bank questions)."
    )


if __name__ == "__main__":
    run()
