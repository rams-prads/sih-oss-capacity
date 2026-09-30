"""Difficulty-weighted scoring (spec 8.4)."""
from app.engines.assessment import observed_level, score_pct


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


def test_level_stays_inside_the_frac_scale():
    for correct in range(5):
        per_item = [True] * correct + [False] * (4 - correct)
        assert 0.0 <= observed_level(per_item, [0.5] * 4) <= 4.0


def test_zero_difficulty_vector_does_not_divide_by_zero():
    """With no usable weights every item counts once, so this is half marks."""
    assert observed_level([True, False], [0.0, 0.0]) == 2.0


def test_empty_quiz_is_handled():
    assert observed_level([], []) == 0.0
    assert score_pct([]) == 0.0


def test_score_pct():
    assert score_pct([True, True, False, False]) == 50.0
