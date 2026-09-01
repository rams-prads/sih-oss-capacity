"""compute_gaps_bulk must agree with compute_gaps exactly, at fewer queries."""
from sqlalchemy import event, select

from app.db import engine
from app.engines.gap import compute_gaps, compute_gaps_bulk
from app.models import User


def _count_queries(fn):
    count = {"n": 0}

    def before(*_args, **_kwargs):
        count["n"] += 1

    event.listen(engine, "before_cursor_execute", before)
    try:
        result = fn()
    finally:
        event.remove(engine, "before_cursor_execute", before)
    return result, count["n"]


def test_bulk_matches_per_user_results(db):
    users = list(db.scalars(select(User).order_by(User.id)).all())
    one_by_one = [compute_gaps(db, u.id) for u in users]
    bulk = compute_gaps_bulk(db, users)
    assert [r.model_dump() for r in bulk] == [r.model_dump() for r in one_by_one]


def test_bulk_query_count_does_not_grow_with_officer_count(db):
    """The property that matters: adding officers must not add queries."""
    users = list(db.scalars(select(User).order_by(User.id)).all())
    assert len(users) >= 9

    _, few = _count_queries(lambda: compute_gaps_bulk(db, users[:2]))
    _, many = _count_queries(lambda: compute_gaps_bulk(db, users))
    assert few == many

    _, loop = _count_queries(lambda: [compute_gaps(db, u.id) for u in users])
    assert many < loop


def test_bulk_handles_an_empty_department(db):
    assert compute_gaps_bulk(db, []) == []
