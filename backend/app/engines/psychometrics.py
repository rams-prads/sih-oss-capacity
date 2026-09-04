"""Bridge between stored responses and the measurement engine.

Reads the response history the app already records, runs it through IRT, and
returns ability estimates that carry their own uncertainty. Nothing here does
psychometrics itself - that lives in irt.py and calibration.py - so this module
stays a thin, testable translation layer.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.engines.calibration import CalibrationReport, calibrate_items
from app.engines.irt import (
    DEFAULT_DISCRIMINATION,
    DEFAULT_GUESSING,
    Ability,
    Response,
    authored_difficulty_to_b,
    decay_prior,
    estimate_ability,
)
from app.models import BankQuestion, CheckpointAttempt, Topic


@dataclass
class TopicAbility:
    topic_id: str
    topic_name: str
    competency_id: str
    ability: Ability
    days_since_assessed: float | None
    questions_answered: int


def response_corpus(db: Session, user_ids: list[str] | None = None) -> list[tuple[str, int, bool]]:
    """Every (officer, question, correct) the system has recorded.

    Only responses tied to a real question can teach us anything about that
    question, so untagged history is skipped rather than silently averaged in.
    """
    stmt = select(CheckpointAttempt)
    if user_ids is not None:
        stmt = stmt.where(CheckpointAttempt.user_id.in_(user_ids))

    corpus: list[tuple[str, int, bool]] = []
    for attempt in db.scalars(stmt).all():
        for item in attempt.items:
            question_id = item.get("question_id")
            if not question_id:
                continue
            corpus.append((attempt.user_id, int(question_id), bool(item.get("correct"))))
    return corpus


def item_bank(db: Session) -> dict[int, tuple[float, float, float]]:
    """Current parameters for every question, as (b, a, c).

    Authored difficulty is the starting point. calibrate_bank replaces these
    with evidence for the items that have enough of it.
    """
    bank: dict[int, tuple[float, float, float]] = {}
    for question in db.scalars(select(BankQuestion)).all():
        guessing = 1.0 / len(question.options) if question.options else DEFAULT_GUESSING
        bank[question.id] = (
            authored_difficulty_to_b(question.difficulty),
            DEFAULT_DISCRIMINATION,
            guessing,
        )
    return bank


def calibrate_bank(db: Session) -> CalibrationReport:
    """Re-estimate item parameters from everything answered so far."""
    corpus = response_corpus(db)
    authored = {
        q.id: q.difficulty for q in db.scalars(select(BankQuestion)).all()
    }
    guessing = {
        q.id: (1.0 / len(q.options) if q.options else DEFAULT_GUESSING)
        for q in db.scalars(select(BankQuestion)).all()
    }
    return calibrate_items(corpus, authored, guessing)


def topic_abilities(
    db: Session,
    user_id: str,
    bank: dict[int, tuple[float, float, float]] | None = None,
    apply_decay: bool = True,
) -> list[TopicAbility]:
    """Ability per topic for one officer, pooled across every attempt.

    Pooling matters: a four-item checkpoint cannot pin down a level on its own -
    simulation puts a single sitting at about 44% exact-level accuracy - but an
    officer's whole history on a topic can.
    """
    bank = bank if bank is not None else item_bank(db)
    topics = {t.id: t for t in db.scalars(select(Topic)).all()}

    by_topic: dict[str, list[Response]] = defaultdict(list)
    last_seen: dict[str, datetime] = {}

    attempts = db.scalars(
        select(CheckpointAttempt)
        .where(CheckpointAttempt.user_id == user_id)
        .order_by(CheckpointAttempt.created_at)
    ).all()

    for attempt in attempts:
        for item in attempt.items:
            topic_id = item.get("topic_id", attempt.topic_id)
            question_id = item.get("question_id")
            if question_id and question_id in bank:
                b, a, c = bank[question_id]
            else:
                # No calibrated item: fall back to an average item so the
                # response still counts, rather than being discarded.
                b, a, c = 0.0, DEFAULT_DISCRIMINATION, DEFAULT_GUESSING
            by_topic[topic_id].append(Response(b, bool(item.get("correct")), a, c))
        stamp = attempt.created_at
        if stamp is not None:
            last_seen[attempt.topic_id] = max(
                last_seen.get(attempt.topic_id, stamp), stamp
            )

    now = datetime.now(timezone.utc)
    results: list[TopicAbility] = []
    for topic_id, responses in by_topic.items():
        ability = estimate_ability(responses)

        days = None
        stamp = last_seen.get(topic_id)
        if stamp is not None:
            aware = stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)
            days = max(0.0, (now - aware).total_seconds() / 86400.0)
            if apply_decay:
                theta, se = decay_prior(ability.theta, ability.se, days)
                # Re-derive the level and confidence from the widened posterior.
                ability = _rebuild(ability, theta, se)

        topic = topics.get(topic_id)
        results.append(
            TopicAbility(
                topic_id=topic_id,
                topic_name=topic.name if topic else topic_id,
                competency_id=topic.competency_id if topic else "",
                ability=ability,
                days_since_assessed=days,
                questions_answered=len(responses),
            )
        )

    results.sort(key=lambda r: r.ability.theta)
    return results


def _rebuild(original: Ability, theta: float, se: float) -> Ability:
    """Re-derive level and confidence after the posterior has been widened."""
    import math

    from app.engines.irt import THETA_GRID, theta_to_level

    weights = [math.exp(-0.5 * ((t - theta) / se) ** 2) for t in THETA_GRID]
    total = sum(weights) or 1.0
    weights = [w / total for w in weights]
    level = theta_to_level(theta)
    confidence = sum(w for t, w in zip(THETA_GRID, weights) if theta_to_level(t) == level)
    return Ability(theta, se, level, confidence, original.n_responses, weights)


@dataclass
class CompetencyAbility:
    competency_id: str
    ability: Ability
    questions_answered: int
    topics_assessed: int
    days_since_assessed: float | None


def _competency_abilities_from(
    attempts: list[CheckpointAttempt],
    topics: dict[str, Topic],
    bank: dict[int, tuple[float, float, float]],
    apply_decay: bool,
) -> dict[str, CompetencyAbility]:
    """Pool one officer's already-loaded attempts into per-competency abilities."""
    by_competency: dict[str, list[Response]] = defaultdict(list)
    topics_seen: dict[str, set[str]] = defaultdict(set)
    last_seen: dict[str, datetime] = {}

    for attempt in attempts:
        for item in attempt.items:
            topic_id = item.get("topic_id", attempt.topic_id)
            topic = topics.get(topic_id)
            if topic is None:
                continue
            question_id = item.get("question_id")
            if question_id and question_id in bank:
                b, a, c = bank[question_id]
            else:
                b, a, c = 0.0, DEFAULT_DISCRIMINATION, DEFAULT_GUESSING
            by_competency[topic.competency_id].append(
                Response(b, bool(item.get("correct")), a, c)
            )
            topics_seen[topic.competency_id].add(topic_id)
            stamp = attempt.created_at
            if stamp is not None:
                current = last_seen.get(topic.competency_id)
                last_seen[topic.competency_id] = max(current, stamp) if current else stamp

    now = datetime.now(timezone.utc)
    out: dict[str, CompetencyAbility] = {}
    for competency_id, responses in by_competency.items():
        ability = estimate_ability(responses)
        days = None
        stamp = last_seen.get(competency_id)
        if stamp is not None:
            aware = stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)
            days = max(0.0, (now - aware).total_seconds() / 86400.0)
            if apply_decay:
                theta, se = decay_prior(ability.theta, ability.se, days)
                ability = _rebuild(ability, theta, se)
        out[competency_id] = CompetencyAbility(
            competency_id=competency_id,
            ability=ability,
            questions_answered=len(responses),
            topics_assessed=len(topics_seen[competency_id]),
            days_since_assessed=days,
        )
    return out


def competency_abilities(
    db: Session,
    user_id: str,
    bank: dict[int, tuple[float, float, float]] | None = None,
    apply_decay: bool = True,
) -> dict[str, CompetencyAbility]:
    """Ability per competency for one officer, pooling across its topics.

    Topics are facets of one competency, so pooling their responses estimates a
    single trait from more evidence than any topic has alone. That matters here:
    a four-item checkpoint cannot separate adjacent levels, but three topics'
    worth of checkpoints often can.
    """
    bank = bank if bank is not None else item_bank(db)
    topics = {t.id: t for t in db.scalars(select(Topic)).all()}
    attempts = list(
        db.scalars(
            select(CheckpointAttempt)
            .where(CheckpointAttempt.user_id == user_id)
            .order_by(CheckpointAttempt.created_at)
        ).all()
    )
    return _competency_abilities_from(attempts, topics, bank, apply_decay)


def competency_abilities_bulk(
    db: Session, user_ids: list[str], apply_decay: bool = True
) -> dict[str, dict[str, CompetencyAbility]]:
    """The same for many officers, with a fixed number of queries.

    The department view estimates every officer at once, so attempts, topics and
    the item bank are loaded once for the whole set rather than once per officer.
    """
    if not user_ids:
        return {}

    bank = item_bank(db)
    topics = {t.id: t for t in db.scalars(select(Topic)).all()}

    by_user: dict[str, list[CheckpointAttempt]] = {uid: [] for uid in user_ids}
    attempts = db.scalars(
        select(CheckpointAttempt)
        .where(CheckpointAttempt.user_id.in_(user_ids))
        .order_by(CheckpointAttempt.created_at)
    ).all()
    for attempt in attempts:
        by_user.setdefault(attempt.user_id, []).append(attempt)

    return {
        uid: _competency_abilities_from(rows, topics, bank, apply_decay)
        for uid, rows in by_user.items()
    }
