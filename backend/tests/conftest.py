import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Point the app at a scratch SQLite file before app.db imports settings.
_TMP_DB = Path(tempfile.gettempdir()) / "sih_oss_test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB.as_posix()}"
os.environ["KARMAYOGI_MODE"] = "mock"
os.environ["LLM_PROVIDER"] = "stub"
os.environ["PBKDF2_ITERATIONS"] = "1000"   # keeps re-seeding fast; not a production value

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from seed import seed as seed_module  # noqa: E402


@pytest.fixture(autouse=True)
def seeded_db():
    seed_module.run()
    yield


@pytest.fixture(scope="session", autouse=True)
def cleanup_db_file():
    yield
    # Windows keeps the SQLite file locked until every connection is released.
    from app.db import engine

    engine.dispose()
    try:
        _TMP_DB.unlink(missing_ok=True)
    except PermissionError:
        pass


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db():
    from app.db import SessionLocal

    with SessionLocal() as session:
        yield session


# --- resolving demo courses ----------------------------------------------
# The catalogue is fetched from iGOT and changes between refreshes, so tests name
# the *state* they need rather than a course id. Hard-coded ids rotted the moment
# the invented courses were removed.
DEMO_USER = "u-jso-anita"


def course_in_state(db, state, user_id=DEMO_USER):
    """The demo officer's enrolled course currently in `state`.

    state: "in_progress" | "completed" | "expired" | "not_started"
    """
    from sqlalchemy import select

    from app.engines.progress import course_progress, derive_status
    from app.models import Enrolment

    enrolments = db.scalars(
        select(Enrolment)
        .where(Enrolment.user_id == user_id)
        .order_by(Enrolment.course_identifier)
    ).all()
    for enrolment in enrolments:
        progress = course_progress(db, user_id, enrolment.course_identifier)
        if derive_status(enrolment, progress) == state:
            return enrolment.course_identifier
    raise AssertionError(f"no seeded course for {user_id} is {state!r}")


def course_with_assessment(db, user_id=DEMO_USER):
    """An enrolled course with videos still to watch and an assessment untouched.

    Tests that arrange their own progress need somewhere to arrange it: a course
    already finished in the seed has no unwatched videos and carries attempts of
    its own, which quietly poisons any count the test then asserts.
    """
    from sqlalchemy import select

    from app.models import Checkpoint, CheckpointAttempt, Enrolment, Lesson, LessonProgress

    enrolments = db.scalars(
        select(Enrolment)
        .where(Enrolment.user_id == user_id)
        .order_by(Enrolment.course_identifier)
    ).all()
    for enrolment in enrolments:
        course_id = enrolment.course_identifier
        lessons = db.scalars(
            select(Lesson).where(Lesson.course_identifier == course_id)
        ).all()
        checkpoint = db.scalar(
            select(Checkpoint).where(Checkpoint.course_identifier == course_id)
        )
        if not lessons or checkpoint is None:
            continue
        watched = {
            row.lesson_id
            for row in db.scalars(
                select(LessonProgress).where(
                    LessonProgress.user_id == user_id,
                    LessonProgress.course_identifier == course_id,
                )
            ).all()
        }
        attempted = db.scalar(
            select(CheckpointAttempt).where(
                CheckpointAttempt.user_id == user_id,
                CheckpointAttempt.course_identifier == course_id,
            )
        )
        if attempted is None and len(watched) < len(lessons):
            return course_id
    raise AssertionError(f"no untouched assessable course enrolled for {user_id}")


def unwatched_lessons(db, course_id, user_id=DEMO_USER):
    """Lessons of a course this officer has not completed yet."""
    from sqlalchemy import select

    from app.models import Lesson, LessonProgress

    done = {
        row.lesson_id
        for row in db.scalars(
            select(LessonProgress).where(
                LessonProgress.user_id == user_id,
                LessonProgress.course_identifier == course_id,
            )
        ).all()
    }
    return [
        lesson
        for lesson in db.scalars(
            select(Lesson).where(Lesson.course_identifier == course_id)
        ).all()
        if lesson.id not in done
    ]
