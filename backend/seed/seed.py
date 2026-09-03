"""Seed the demo database: FRAC taxonomy, the OSS designation hierarchy,
officers and their history.

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
from app.security import hash_password  # noqa: E402
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

    # C16-C26 complete the four competency domains the problem statement names.
    # C01-C15 covered statistical work well but left the technical stack, digital
    # governance and the behavioural/managerial domain almost empty - and those
    # are precisely what NSSTA's own calendar trains (ML with Python, leadership,
    # agricultural and labour statistics).
    ("C16", "Labour Force & Employment Statistics", CompetencyType.DOMAIN,
     "PLFS concepts, employment-unemployment estimation and labour indicators."),
    ("C17", "Agricultural & Allied Statistics", CompetencyType.DOMAIN,
     "Crop area and yield estimation, agricultural censuses and allied surveys."),
    ("C18", "Industrial Statistics (ASI)", CompetencyType.DOMAIN,
     "Annual Survey of Industries frame, returns and unit-level data handling."),
    ("C19", "SQL & Database Management", CompetencyType.FUNCTIONAL,
     "Relational querying, joins and management of unit-level data stores."),
    ("C20", "Artificial Intelligence & Machine Learning", CompetencyType.FUNCTIONAL,
     "Supervised and unsupervised methods applied to official statistics."),
    ("C21", "Cloud Computing & Government Cloud", CompetencyType.FUNCTIONAL,
     "Cloud service models and deployment on MeghRaj/government infrastructure."),
    ("C22", "Cybersecurity & Data Privacy", CompetencyType.FUNCTIONAL,
     "Information security practice, DPDP Act duties and secure data exchange."),
    ("C23", "Digital Public Infrastructure & e-Governance", CompetencyType.FUNCTIONAL,
     "DPI building blocks, digital service design and interoperable APIs."),
    ("C24", "Leadership & Team Management", CompetencyType.BEHAVIOURAL,
     "Leading statistical teams, mentoring and building field cadre capability."),
    ("C25", "Project Management", CompetencyType.BEHAVIOURAL,
     "Planning, monitoring and evaluating survey and statistical programmes."),
    ("C26", "Decision Making & Change Management", CompetencyType.BEHAVIOURAL,
     "Evidence-based judgement and leading adoption of new methods and systems."),

    # C27-C36 carry the administrative, policy and leadership ladder. The OSS is
    # not only statisticians: an ASO, a Section Officer and a Deputy Secretary
    # sit in the same system and are measured on office procedure, government
    # rules and policy work, none of which C01-C26 expressed.
    ("C27", "Policy Analysis & Formulation", CompetencyType.DOMAIN,
     "Reading evidence into policy options and drafting policy instruments."),
    ("C28", "Strategic Planning & Governance", CompetencyType.BEHAVIOURAL,
     "Setting direction for a statistical programme or institution."),
    ("C29", "Office Procedures, Noting & Drafting", CompetencyType.FUNCTIONAL,
     "Noting, drafting, file and record management under the Manual of Office Procedure."),
    ("C30", "Government Rules & Public Administration", CompetencyType.DOMAIN,
     "Service rules, government processes and public administration practice."),
    ("C31", "Financial Management & GFR", CompetencyType.FUNCTIONAL,
     "Budgeting, financial procedures and General Financial Rules compliance."),
    ("C32", "HR & Establishment Matters", CompetencyType.FUNCTIONAL,
     "Establishment, cadre and personnel administration."),
    ("C33", "Parliamentary Procedures", CompetencyType.DOMAIN,
     "Parliament questions, assurances and legislative business."),
    ("C34", "Stakeholder Management & Coordination", CompetencyType.BEHAVIOURAL,
     "Inter-ministerial coordination, negotiation and managing data users."),
    ("C35", "Risk Management", CompetencyType.BEHAVIOURAL,
     "Identifying and mitigating programme, data and institutional risk."),
    ("C36", "Institutional Leadership", CompetencyType.BEHAVIOURAL,
     "Leading an institution through transformation and building its capability."),
]

# --- 6.3 Designations and their FRAC requirements ------------------------
# The designation hierarchy of the Official Statistical System, from MTS to
# Secretary, across the statistical and administrative streams. Designation is
# what an officer actually holds, so it - not an invented job label - is what
# the competency profile is built from.
#
# On the target levels: MoSPI does not publish a per-designation proficiency
# matrix, so inventing exact numbers per competency would be dressing a guess up
# as data. Instead each designation states the competencies expected of it (from
# the MoSPI designation-competency mapping) and levels follow one documented
# rule:
#
#   target = the designation's band, and one level lower for its secondary
#            competencies; weight H for the first three listed, M then L after.
#
# Band by grade: support 2, junior professional 3, middle 3, senior 4, top 4.
# Ordering within a designation is significant - most central competency first.
#
# (stream, grade, name, description, [competency ids in priority order])
DESIGNATIONS = [
    ("Support", 1, "MTS", "Multi-Tasking Staff",
     "Supports office operations, records and routine administrative tasks.",
     ["C23", "C29", "C15", "C11"]),
    ("Support/Admin", 2, "SUB", "Other officials below JSO",
     "Assists with data entry, office processes and record handling.",
     ["C23", "C29", "C15", "C19", "C30"]),
    ("Statistical", 3, "JSO", "Junior Statistical Officer",
     "Conducts and supervises survey operations, validates returns and "
     "prepares tabulations for statistical releases.",
     ["C01", "C02", "C03", "C04", "C10", "C19", "C15", "C11"]),
    ("Administration", 3, "ASO", "Assistant Section Officer",
     "Handles noting, drafting and file work under the Manual of Office Procedure.",
     ["C29", "C30", "C15", "C23", "C32"]),
    ("Statistical", 4, "SSO", "Senior Statistical Officer",
     "Leads field and processing teams and assures the quality of statistical output.",
     ["C04", "C01", "C03", "C02", "C10", "C24", "C15"]),
    ("Administration", 4, "SO", "Section Officer",
     "Runs a section: establishment, financial procedure and office administration.",
     ["C30", "C29", "C31", "C32", "C24", "C15"]),
    ("Statistical/Officer", 5, "AD", "Assistant Director",
     "Designs surveys, interprets results and manages statistical projects.",
     ["C04", "C01", "C26", "C25", "C24", "C10", "C09"]),
    ("Statistical/Officer", 6, "DD", "Deputy Director",
     "Monitors statistical programmes and turns analysis into decisions.",
     ["C04", "C25", "C26", "C27", "C24", "C34"]),
    ("Statistical/Officer", 7, "JD", "Joint Director",
     "Leads programme areas, shapes policy and manages stakeholders.",
     ["C28", "C27", "C25", "C26", "C34", "C24"]),
    ("Senior officer", 8, "DIR", "Director",
     "Sets direction for a statistical programme and its policy use.",
     ["C28", "C27", "C26", "C25", "C24", "C34"]),
    ("Senior management", 9, "DDG", "Deputy Director General",
     "Directs a division: strategy, evaluation and data governance.",
     ["C28", "C27", "C11", "C26", "C25", "C36"]),
    ("Top management", 10, "ADG", "Additional Director General",
     "Sets organisational strategy and leads change across divisions.",
     ["C28", "C36", "C27", "C11", "C26", "C34"]),
    ("Senior administration", 9, "DS", "Deputy Secretary",
     "Policy, administration and financial oversight at the ministry.",
     ["C27", "C30", "C31", "C33", "C34", "C24"]),
    ("Senior administration", 10, "JS", "Joint Secretary",
     "Leads policy formulation, coordination and programme oversight.",
     ["C27", "C28", "C34", "C25", "C31", "C24"]),
    ("Senior administration", 11, "AS", "Additional Secretary",
     "Strategic governance, transformation and inter-ministerial coordination.",
     ["C28", "C36", "C34", "C35", "C27"]),
    ("Leadership", 12, "DG", "Director General",
     "Leads the national statistical system and its governance.",
     ["C28", "C11", "C36", "C27", "C34", "C35"]),
    ("Ministry leadership", 13, "SECY", "Secretary",
     "Leads the ministry: national policy, institutions and public administration.",
     ["C28", "C36", "C34", "C30", "C27", "C26"]),
]


def _band(grade: int) -> int:
    """Proficiency band expected at a grade. See the note above DESIGNATIONS."""
    if grade <= 2:
        return 2
    if grade <= 6:
        return 3
    return 4


def build_roles() -> dict[str, tuple[str, str, int, str, list[tuple[str, int, float]]]]:
    """Expand the designation table into (competency, target, weight) triples."""
    roles = {}
    for stream, grade, role_id, name, description, competency_ids in DESIGNATIONS:
        band = _band(grade)
        requirements = []
        for position, competency_id in enumerate(competency_ids):
            target = band if position < 3 else max(2, band - 1)
            weight = H if position < 3 else (M if position < 5 else L)
            requirements.append((competency_id, target, weight))
        roles[role_id] = (name, description, grade, stream, requirements)
    return roles


ROLES = build_roles()

# --- Demo officers --------------------------------------------------------
# attained levels are deliberately uneven so the department heatmap has shape.
# u-jso-anita is the demo hero: a JSO weak on C01 (Sampling) and C03 (Quality).
DEPT_NSO = "MoSPI - National Statistical Office"
DEPT_FOD = "MoSPI - Field Operations Division"

USERS = [
    # Spread across both streams and up the grade ladder, so the department
    # heatmap shows a real hierarchy rather than nine people doing one job.
    ("u-jso-anita", "Anita Deshmukh", "JSO", DEPT_NSO, False,
     {"C01": 1, "C02": 2, "C03": 1, "C04": 2, "C10": 1, "C19": 0, "C15": 2, "C11": 2}),
    ("u-jso-rakesh", "Rakesh Menon", "JSO", DEPT_NSO, False,
     {"C01": 3, "C02": 3, "C03": 2, "C04": 2, "C10": 2, "C19": 1, "C15": 1, "C11": 2}),
    ("u-jso-farah", "Farah Qureshi", "ASO", DEPT_NSO, False,
     {"C29": 2, "C30": 1, "C15": 2, "C23": 1, "C32": 0}),
    ("u-si-vikram", "Vikram Rathore", "SUB", DEPT_FOD, False,
     {"C23": 1, "C29": 2, "C15": 2, "C19": 1, "C30": 1}),
    ("u-si-lalita", "Lalita Barman", "SSO", DEPT_FOD, False,
     {"C04": 2, "C01": 3, "C03": 2, "C02": 3, "C10": 1, "C24": 2, "C15": 1}),
    ("u-da-suresh", "Suresh Iyer", "AD", DEPT_NSO, False,
     {"C04": 3, "C01": 2, "C26": 2, "C25": 1, "C24": 2, "C10": 2, "C09": 2}),
    ("u-da-neha", "Neha Kulkarni", "DD", DEPT_NSO, False,
     {"C04": 4, "C25": 2, "C26": 2, "C27": 1, "C24": 3, "C34": 1}),
    ("u-da-imran", "Imran Sheikh", "SO", DEPT_NSO, False,
     {"C30": 2, "C29": 1, "C31": 0, "C32": 1, "C24": 1, "C15": 2}),
    ("u-admin-meera", "Meera Nair", "DDG", DEPT_NSO, True,
     {"C28": 4, "C27": 4, "C11": 4, "C26": 3, "C25": 3, "C36": 3}),
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
    ("u-jso-rakesh", R_COMPUTING, 6, [(0, 3), (1, 2), (1, 3)], 30, 18),

    ("u-jso-farah", DATA_QUALITY, 3, [], 20, 70),
    ("u-jso-farah", QUESTIONNAIRE, 0, [], 5, 90),

    ("u-si-vikram", QUESTIONNAIRE, 5, [(0, 3)], 45, 12),
    ("u-si-vikram", CLASSIFICATION, 3, [(0, 0)], 140, -10),

    ("u-si-lalita", QUESTIONNAIRE, 9, [(0, 4), (1, 3), (2, 4)], 110, 190),
    ("u-si-lalita", CLASSIFICATION, 4, [(0, 3)], 25, 65),

    ("u-da-suresh", R_COMPUTING, 7, [(0, 4), (1, 3)], 35, 25),
    ("u-da-suresh", DESCRIPTIVE, 9, [(0, 3), (1, 4), (2, 3)], 130, 210),

    ("u-da-neha", DESCRIPTIVE, 9, [(0, 4), (1, 4), (2, 4)], 160, 240),
    ("u-da-neha", R_COMPUTING, 9, [(0, 4), (1, 3), (2, 4)], 90, 170),

    ("u-da-imran", DESCRIPTIVE, 3, [(0, 1)], 15, 75),
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
    for course_id, topic_ids in curriculum["courses"].items():
        position = 0
        for module_index, topic_id in enumerate(topic_ids):
            topic = curriculum["topics"][topic_id]
            for title, minutes in topic["lessons"]:
                db.add(
                    Lesson(
                        course_identifier=course_id,
                        position=position,
                        module_index=module_index,
                        title=title,
                        topic_id=topic_id,
                        duration_min=minutes,
                    )
                )
                position += 1
                lesson_count += 1
            db.add(
                Checkpoint(
                    course_identifier=course_id,
                    module_index=module_index,
                    title=topic["module_title"],
                    topic_id=topic_id,
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


def load_igot_curriculum(db) -> tuple[int, int]:
    """Lessons for real iGOT courses, from the videos the portal serves publicly.

    iGOT's progress endpoints are auth-gated - reading what an officer watched on
    the portal needs a Keycloak user token this repository does not ship - but the
    media itself is public and range-served. So the videos play here and the watch
    record is ours, through exactly the same lessons/progress machinery the
    authored courses use.

    Each course ends in one assessment rather than a quiz per module. The videos
    come from iGOT; the questions come from our own authored bank, so a course can
    only be assessed on a competency we actually hold questions for. Where we hold
    none, the course carries video progress and no quiz - which is honest, and
    better than generating filler.
    """
    here = Path(__file__).resolve().parent
    catalogue = json.loads(
        (here / "igot_courses_seed.json").read_text(encoding="utf-8")
    )["content"]
    curriculum = json.loads((here / "curriculum.json").read_text(encoding="utf-8"))
    bank = json.loads((here / "question_bank.json").read_text(encoding="utf-8"))

    # Which authored topic can assess a given competency.
    topic_for_competency: dict[str, str] = {}
    for topic_id, meta in curriculum["topics"].items():
        topic_for_competency.setdefault(meta["competency_id"], topic_id)
    has_questions = {t for t in bank if not t.startswith("_")}

    lesson_count = quiz_count = 0
    for course in catalogue:
        modules = course.get("modules") or []
        if course.get("source") != "igot" or not modules:
            continue

        course_id = course["identifier"]
        position = 0
        for module_index, module in enumerate(modules):
            for lesson in module["lessons"]:
                db.add(
                    Lesson(
                        course_identifier=course_id,
                        position=position,
                        module_index=module_index,
                        title=lesson["title"],
                        topic_id=None,
                        duration_min=lesson.get("duration_min", 5),
                        video_url=lesson.get("url", ""),
                    )
                )
                position += 1
                lesson_count += 1

        assessable = next(
            (
                topic_for_competency[cid]
                for cid in course.get("se_competencies", [])
                if topic_for_competency.get(cid) in has_questions
            ),
            None,
        )
        if assessable:
            db.add(
                Checkpoint(
                    course_identifier=course_id,
                    module_index=len(modules),  # after every module, not gating one
                    title="Final assessment",
                    topic_id=assessable,
                    pass_pct=60,
                )
            )
            quiz_count += 1

    db.flush()
    return lesson_count, quiz_count


def run() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    now = datetime.now(timezone.utc)

    with SessionLocal() as db:
        db.add_all(
            Competency(id=cid, name=name, type=ctype, description=desc)
            for cid, name, ctype, desc in COMPETENCIES
        )

        for role_id, (name, description, grade, stream, requirements) in ROLES.items():
            db.add(
                Role(
                    id=role_id,
                    name=name,
                    description=description,
                    grade=grade,
                    stream=stream,
                )
            )
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
            # Demo credentials, documented in the README. Real deployments
            # federate to Keycloak and never store a password here.
            db.add(
                User(
                    id=uid,
                    name=name,
                    email=f"{slug}@mospi.gov.in",
                    role_id=role_id,
                    department=department,
                    is_admin=is_admin,
                    password_hash=hash_password("admin123" if is_admin else "officer123"),
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
        igot_lessons, igot_quizzes = load_igot_curriculum(db)

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
        f"({lesson_count} lessons, {question_count} bank questions). "
        f"iGOT video curricula: {igot_lessons} lessons across real courses, "
        f"{igot_quizzes} final assessments."
    )


if __name__ == "__main__":
    run()
