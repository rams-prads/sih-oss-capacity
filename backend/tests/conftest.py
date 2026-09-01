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

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from seed import seed as seed_module  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def seeded_db():
    seed_module.run()
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
