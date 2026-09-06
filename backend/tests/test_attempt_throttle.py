"""The cooldown arithmetic, with the clock supplied rather than waited on."""
from datetime import datetime, timedelta, timezone

from app.engines.attempt_throttle import (
    MIN_SECONDS_BETWEEN_ATTEMPTS,
    seconds_until_next_attempt,
)

NOW = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)


def test_a_first_attempt_is_never_throttled():
    assert seconds_until_next_attempt(None, NOW) == 0.0


def test_an_immediate_retry_has_to_wait_the_whole_cooldown():
    assert seconds_until_next_attempt(NOW, NOW, cooldown_seconds=20) == 20.0


def test_the_wait_shrinks_as_time_passes():
    last = NOW - timedelta(seconds=15)
    assert seconds_until_next_attempt(last, NOW, cooldown_seconds=20) == 5.0


def test_no_wait_once_the_cooldown_has_elapsed():
    last = NOW - timedelta(seconds=30)
    assert seconds_until_next_attempt(last, NOW, cooldown_seconds=20) == 0.0


def test_a_long_gap_never_reports_a_negative_wait():
    last = NOW - timedelta(days=400)
    assert seconds_until_next_attempt(last, NOW) == 0.0


def test_a_naive_timestamp_is_read_as_utc():
    """SQLite hands timestamps back without a timezone; treating one as local
    time would put the cooldown hours out in either direction."""
    naive = (NOW - timedelta(seconds=10)).replace(tzinfo=None)
    assert seconds_until_next_attempt(naive, NOW, cooldown_seconds=20) == 10.0


def test_a_zero_cooldown_disables_the_throttle():
    """What the test suite runs with, so a legitimate two-attempt flow does
    not have to sleep through a real cooldown to be exercised."""
    assert seconds_until_next_attempt(NOW, NOW, cooldown_seconds=0) == 0.0


def test_the_default_cooldown_is_long_enough_to_matter():
    """A guessing script gets one attempt per cooldown; at 5% a sitting, the
    default has to be long enough that brute force stops being worth it."""
    assert MIN_SECONDS_BETWEEN_ATTEMPTS >= 15
