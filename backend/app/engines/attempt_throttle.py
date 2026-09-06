"""How long an officer must wait before another assessment sitting counts.

A four-question, four-option checkpoint can be passed by pure guessing about
one time in twenty (three of four right by chance, at 60% to pass). That is
not a flaw a harder question bank fixes - it is arithmetic any small quiz has.
What actually defeats it is not the odds of one attempt, but how many attempts
a minute someone can throw at them: a human rereading the material between
tries already takes longer than this; a script resubmitting until it gets
lucky does not, unless something enforces a floor on the gap between sittings.

This is deliberately a cooldown, not a hard attempt cap. A cap punishes a
learner who is genuinely struggling and retrying after actually studying
more; a cooldown only punishes trying again immediately, which a human
reviewing feedback was never going to do anyway.
"""
from __future__ import annotations

from datetime import datetime, timezone

MIN_SECONDS_BETWEEN_ATTEMPTS = 20


def seconds_until_next_attempt(
    last_attempt_at: datetime | None,
    now: datetime | None = None,
    cooldown_seconds: int = MIN_SECONDS_BETWEEN_ATTEMPTS,
) -> float:
    """0 if another sitting is allowed right now, else how long to wait.

    `last_attempt_at` may be naive (SQLite drops tzinfo on the way back out of
    the database) - treated as UTC, which is what every timestamp in this app
    is written in.
    """
    if last_attempt_at is None or cooldown_seconds <= 0:
        return 0.0
    now = now or datetime.now(timezone.utc)
    last = last_attempt_at if last_attempt_at.tzinfo else last_attempt_at.replace(tzinfo=timezone.utc)
    elapsed = (now - last).total_seconds()
    return max(0.0, cooldown_seconds - elapsed)
