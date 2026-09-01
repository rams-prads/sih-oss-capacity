"""Adaptive-lite proficiency estimation (spec 8.4)."""
from app.engines.assessment import observed_level, score_pct, update_attained_level


def test_hard_items_move_the_estimate_more_than_easy_ones():
    """The point of difficulty weighting: same raw score, different evidence."""
    per_item = [True, True, False, False]
    hard_first = observed_level(per_item, [0.9, 0.9, 0.1, 0.1])
    easy_first = observed_level(per_item, [0.1, 0.1, 0.9, 0.9])
    assert hard_first > easy_first


def test_perfect_hard_quiz_reaches_the_top_of_the_scale():
    assert observed_level([True] * 5, [0.9] * 5) == 4.0


def test_all_wrong_scores_zero():
    assert observed_level([False] * 5, [0.5] * 5) == 0.0


def test_ema_blends_with_the_prior_rather_than_replacing_it():
    """One strong quiz should not jump an officer from 0 to 4."""
    assert update_attained_level(0, [True] * 6, [0.8] * 6) == 2


def test_passing_a_hard_quiz_raises_the_attained_level():
    """AC 8.4: the level rises, so the dashboard gap shrinks."""
    prior = 1
    new = update_attained_level(prior, [True, True, True, True, False], [0.8, 0.9, 0.7, 0.8, 0.6])
    assert new > prior


def test_failing_a_quiz_lowers_the_estimate():
    assert update_attained_level(3, [False] * 6, [0.6] * 6) < 3


def test_level_stays_inside_the_frac_scale():
    for prior in range(5):
        for outcome in (True, False):
            level = update_attained_level(prior, [outcome] * 4, [0.5] * 4)
            assert 0 <= level <= 4


def test_zero_difficulty_vector_does_not_divide_by_zero():
    assert update_attained_level(2, [True, False], [0.0, 0.0]) == 2


def test_empty_quiz_is_handled():
    assert observed_level([], []) == 0.0
    assert score_pct([]) == 0.0


def test_score_pct():
    assert score_pct([True, True, False, False]) == 50.0
