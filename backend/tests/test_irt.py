"""The measurement core: does it weight evidence by what it is actually worth?"""
import math

import pytest

from app.engines.irt import (
    Response,
    authored_difficulty_to_b,
    b_to_authored_difficulty,
    estimate_ability,
    item_information,
    level_to_theta,
    probability_correct,
    select_next_item,
    should_stop,
    theta_to_level,
    decay_prior,
)

EASY = authored_difficulty_to_b(0.1)
HARD = authored_difficulty_to_b(0.95)


class TestItemCurve:
    def test_probability_rises_with_ability(self):
        ps = [probability_correct(t, 0.0) for t in (-3, -1, 0, 1, 3)]
        assert ps == sorted(ps)

    def test_a_harder_item_is_harder_at_the_same_ability(self):
        assert probability_correct(0.0, HARD) < probability_correct(0.0, EASY)

    def test_guessing_sets_a_floor(self):
        """A four-option MCQ can be passed by luck; the model must admit that.

        The curve approaches the floor asymptotically rather than reaching it,
        so this checks it converges from above and never dips below chance.
        """
        assert probability_correct(-10.0, 0.0, c=0.25) == pytest.approx(0.25, abs=1e-3)
        assert probability_correct(-40.0, 0.0, c=0.25) == pytest.approx(0.25, abs=1e-9)
        assert all(
            probability_correct(t, 0.0, c=0.25) >= 0.25 for t in (-20, -5, 0, 5, 20)
        )

    def test_ability_equal_to_difficulty_sits_midway_above_the_floor(self):
        assert probability_correct(1.0, 1.0, c=0.25) == pytest.approx(0.625, abs=1e-6)

    def test_extreme_ability_does_not_overflow(self):
        assert 0.0 <= probability_correct(1e6, 0.0) <= 1.0
        assert 0.0 <= probability_correct(-1e6, 0.0) <= 1.0

    def test_information_peaks_near_the_item_difficulty(self):
        at_target = item_information(1.0, 1.0)
        assert at_target > item_information(-2.0, 1.0)
        assert at_target > item_information(4.0, 1.0)


class TestTheDefectThisReplaces:
    """The old estimator reported Expert for four trivial items answered right.

    With a uniform response pattern its difficulty terms cancelled, so item
    difficulty only appeared to matter. These are the cases that exposed it.
    """

    def test_trivial_items_do_not_certify_expertise(self):
        ability = estimate_ability([Response(EASY, True)] * 4)
        assert ability.level < 4
        assert ability.is_provisional

    def test_hard_items_are_worth_more_than_easy_ones(self):
        easy = estimate_ability([Response(EASY, True)] * 4)
        hard = estimate_ability([Response(HARD, True)] * 4)
        assert hard.theta > easy.theta

    def test_failing_hard_items_is_weaker_evidence_than_failing_easy_ones(self):
        failed_hard = estimate_ability([Response(HARD, False)] * 4)
        failed_easy = estimate_ability([Response(EASY, False)] * 4)
        assert failed_hard.theta > failed_easy.theta


class TestAbilityEstimation:
    def test_more_evidence_narrows_the_estimate(self):
        few = estimate_ability([Response(0.0, True), Response(0.0, False)])
        many = estimate_ability([Response(0.0, i % 2 == 0) for i in range(40)])
        assert many.se < few.se

    def test_no_evidence_returns_the_prior(self):
        ability = estimate_ability([])
        assert ability.theta == pytest.approx(0.0, abs=0.05)
        assert ability.se == pytest.approx(1.0, abs=0.05)
        assert ability.is_provisional

    def test_all_correct_stays_finite(self):
        """Maximum likelihood diverges here; the prior is why we use EAP."""
        ability = estimate_ability([Response(0.0, True)] * 10)
        assert math.isfinite(ability.theta)
        assert ability.theta < 4.0

    def test_all_wrong_stays_finite(self):
        ability = estimate_ability([Response(0.0, False)] * 10)
        assert math.isfinite(ability.theta)
        assert ability.theta > -4.0

    def test_confidence_is_a_probability(self):
        ability = estimate_ability([Response(0.0, True)] * 6)
        assert 0.0 <= ability.confidence <= 1.0

    def test_level_range_brackets_the_reported_level(self):
        ability = estimate_ability([Response(0.0, True), Response(0.0, False)])
        low, high = ability.level_range()
        assert low <= ability.level <= high


class TestLevels:
    def test_levels_are_ordered_and_bounded(self):
        assert theta_to_level(-9) == 0
        assert theta_to_level(9) == 4
        levels = [theta_to_level(t) for t in (-3, -1, 0, 1, 3)]
        assert levels == sorted(levels)

    def test_level_to_theta_round_trips(self):
        for level in range(5):
            assert theta_to_level(level_to_theta(level)) == level

    def test_authored_difficulty_round_trips(self):
        for d in (0.0, 0.25, 0.5, 0.75, 1.0):
            assert b_to_authored_difficulty(authored_difficulty_to_b(d)) == pytest.approx(d)


class TestAdaptiveSelection:
    BANK = [(i, -2.0 + i, 1.0, 0.25) for i in range(5)]

    def test_picks_the_item_nearest_the_current_estimate(self):
        strong = estimate_ability([Response(0.0, True)] * 8)
        chosen = select_next_item(self.BANK, strong)
        assert self.BANK[chosen][1] > 0

    def test_aims_at_the_role_target_before_any_evidence(self):
        chosen = select_next_item(self.BANK, None, target_level=4)
        low = select_next_item(self.BANK, None, target_level=0)
        assert self.BANK[chosen][1] > self.BANK[low][1]

    def test_never_repeats_an_item(self):
        chosen = select_next_item(self.BANK, None, exclude={0, 1, 2, 3})
        assert chosen == 4

    def test_returns_none_when_the_bank_is_exhausted(self):
        assert select_next_item(self.BANK, None, exclude={0, 1, 2, 3, 4}) is None


class TestStoppingRule:
    def test_never_stops_before_the_minimum(self):
        precise = estimate_ability([Response(0.0, i % 2 == 0) for i in range(60)])
        assert not should_stop(precise, asked=2, min_items=4)

    def test_always_stops_at_the_maximum(self):
        vague = estimate_ability([])
        assert should_stop(vague, asked=12, max_items=12)

    def test_stops_early_once_precise_enough(self):
        precise = estimate_ability([Response(0.0, i % 2 == 0) for i in range(80)])
        assert should_stop(precise, asked=8, se_target=0.9)


class TestForgetting:
    def test_a_fresh_estimate_is_untouched(self):
        theta, se = decay_prior(1.0, 0.3, 0.0)
        assert (theta, se) == (1.0, 0.3)

    def test_time_widens_uncertainty_but_does_not_move_the_estimate(self):
        theta, se = decay_prior(1.0, 0.3, 730)
        assert theta == 1.0
        assert se > 0.3

    def test_widening_is_monotonic_and_bounded(self):
        ses = [decay_prior(1.0, 0.3, d)[1] for d in (0, 90, 365, 1095, 3650)]
        assert ses == sorted(ses)
        assert ses[-1] < 2.0
