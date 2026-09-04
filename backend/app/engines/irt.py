"""Item Response Theory: the measurement core.

The estimator this replaces was a difficulty-weighted percentage. It had a fatal
property: with a uniform response pattern the difficulty terms cancel, so four
trivial questions answered correctly reported the same Expert level as four
expert questions answered correctly. Difficulty only appeared to matter.

IRT models the probability of a correct answer as a function of the officer's
latent ability (theta) and the item's properties, so evidence is weighted by what
it is actually worth:

    P(correct | theta) = c + (1 - c) / (1 + exp(-a (theta - b)))

    theta  the officer's ability on this topic, on a standard normal scale
    b      item difficulty, on the same scale as theta
    a      item discrimination: how sharply the item separates ability levels
    c      pseudo-guessing: the floor from picking at random

DataCamp, which is the best-known public example of this approach, uses the 1PL
(Rasch) model: difficulty only. We differ deliberately on two points.

  * We fix c at chance level (1/options = 0.25 for a four-option MCQ) rather than
    assuming it is zero. Ignoring guessing on multiple-choice items biases every
    low-ability estimate upward, which for a competency framework means telling
    an officer they are Working when they were guessing. c is FIXED, never
    estimated: estimating it needs far more data than we will have.
  * We estimate ability with a posterior distribution rather than a point, so
    every reported level carries a standard error and a confidence. A gap engine
    that knows how sure it is can tell "this officer needs training" apart from
    "we have not measured this officer yet" - a distinction a point score cannot
    express, and the one that matters most to a training administrator.
"""
from __future__ import annotations

import math

# --- scale -----------------------------------------------------------------
# Ability is on a standard normal scale. Beyond +/-4 the likelihood is flat and
# the grid is wasted, which is the usual working range in the IRT literature.
THETA_MIN, THETA_MAX, THETA_STEP = -4.0, 4.0, 0.05
THETA_GRID: list[float] = [
    THETA_MIN + i * THETA_STEP
    for i in range(int((THETA_MAX - THETA_MIN) / THETA_STEP) + 1)
]

DEFAULT_DISCRIMINATION = 1.0   # a = 1 reduces the 3PL to Rasch-with-guessing
DEFAULT_GUESSING = 0.25        # four-option MCQ

# FRAC levels 0-4 as bands on the ability scale. These are criterion cut points:
# an officer is placed at a level when their ability makes it more likely than
# not that they can answer items written at that level. They are policy, not
# arithmetic, so they live here as named constants for a domain expert to revise.
LEVEL_CUTS = (-1.5, -0.5, 0.5, 1.5)   # 5 bands -> levels 0,1,2,3,4
LEVEL_NAMES = ("Unaware", "Aware", "Working", "Proficient", "Expert")


def authored_difficulty_to_b(difficulty: float) -> float:
    """Map an authored 0-1 difficulty onto the ability scale.

    Authors rate items 0 (trivial) to 1 (expert). The ability scale is roughly
    -3 to 3, so 0.5 becomes 0 and the ends stretch to +/-3. This is only ever a
    starting prior: once an item has real responses, calibration replaces it.
    """
    return (max(0.0, min(1.0, difficulty)) - 0.5) * 6.0


def b_to_authored_difficulty(b: float) -> float:
    """Inverse of the above, for displaying a calibrated item to an author."""
    return max(0.0, min(1.0, b / 6.0 + 0.5))


def probability_correct(
    theta: float,
    b: float,
    a: float = DEFAULT_DISCRIMINATION,
    c: float = DEFAULT_GUESSING,
) -> float:
    """The 3PL item characteristic curve."""
    # Clamp the exponent: exp(710) overflows, and the curve is flat out there.
    z = max(-35.0, min(35.0, a * (theta - b)))
    return c + (1.0 - c) / (1.0 + math.exp(-z))


def item_information(
    theta: float,
    b: float,
    a: float = DEFAULT_DISCRIMINATION,
    c: float = DEFAULT_GUESSING,
) -> float:
    """Fisher information: how much this item tells us at this ability.

    Information peaks just above an item's difficulty, which is why asking an
    officer questions near their own level measures them fastest. This is what
    makes adaptive testing shorter without being less precise.
    """
    p = probability_correct(theta, b, a, c)
    if p <= c or p >= 1.0:
        return 0.0
    return (a * a) * ((p - c) ** 2) * (1.0 - p) / (((1.0 - c) ** 2) * p)


# --- ability estimation ----------------------------------------------------
class Response:
    """One answered item: what it was worth, and whether they got it right."""

    __slots__ = ("b", "a", "c", "correct")

    def __init__(
        self,
        b: float,
        correct: bool,
        a: float = DEFAULT_DISCRIMINATION,
        c: float = DEFAULT_GUESSING,
    ) -> None:
        self.b, self.a, self.c, self.correct = b, a, c, correct


class Ability:
    """A posterior over ability, not a point estimate.

    `theta` is the mean, `se` the standard deviation. `level` is the FRAC band
    the mean falls in, and `confidence` is how much of the posterior actually
    sits in that band - which is the honest answer to "how sure are you?".
    """

    __slots__ = ("theta", "se", "level", "confidence", "n_responses", "posterior")

    def __init__(
        self,
        theta: float,
        se: float,
        level: int,
        confidence: float,
        n_responses: int,
        posterior: list[float],
    ) -> None:
        self.theta = theta
        self.se = se
        self.level = level
        self.confidence = confidence
        self.n_responses = n_responses
        self.posterior = posterior

    @property
    def level_name(self) -> str:
        return LEVEL_NAMES[self.level]

    @property
    def is_provisional(self) -> bool:
        """True while the estimate is too uncertain to act on.

        An SE above 0.5 spans more than a whole FRAC band, so the reported level
        is a guess. The dashboard says "provisional" rather than pretending.
        """
        return self.se > 0.5

    def credible_interval(self, z: float = 1.96) -> tuple[float, float]:
        return self.theta - z * self.se, self.theta + z * self.se

    def level_range(self) -> tuple[int, int]:
        """The levels consistent with the evidence, as a range."""
        low, high = self.credible_interval()
        return theta_to_level(low), theta_to_level(high)


def theta_to_level(theta: float) -> int:
    """Place an ability on the 0-4 FRAC scale."""
    level = 0
    for cut in LEVEL_CUTS:
        if theta >= cut:
            level += 1
    return level


def level_to_theta(level: int) -> float:
    """A representative ability for a target level, used for cold starts and
    for choosing items when we have no estimate yet."""
    level = max(0, min(4, level))
    if level == 0:
        return LEVEL_CUTS[0] - 0.5
    if level == 4:
        return LEVEL_CUTS[-1] + 0.5
    return (LEVEL_CUTS[level - 1] + LEVEL_CUTS[level]) / 2.0


def estimate_ability(
    responses: list[Response],
    prior_mean: float = 0.0,
    prior_sd: float = 1.0,
) -> Ability:
    """Expected a posteriori (EAP) estimation over a fixed grid.

    EAP rather than maximum likelihood for a specific reason: ML is undefined
    when an officer answers everything right or everything wrong, which with
    four-item checkpoints happens constantly. The prior keeps the estimate
    finite and, correctly, leaves the standard error large.
    """
    log_prior_const = -0.5 / (prior_sd * prior_sd)
    weights: list[float] = []

    for theta in THETA_GRID:
        # Work in logs: a product of many probabilities underflows to zero.
        log_w = log_prior_const * (theta - prior_mean) ** 2
        for r in responses:
            p = probability_correct(theta, r.b, r.a, r.c)
            p = min(max(p, 1e-12), 1.0 - 1e-12)
            log_w += math.log(p) if r.correct else math.log(1.0 - p)
        weights.append(log_w)

    peak = max(weights)
    posterior = [math.exp(w - peak) for w in weights]
    total = sum(posterior)
    posterior = [w / total for w in posterior]

    mean = sum(t * w for t, w in zip(THETA_GRID, posterior))
    variance = sum(((t - mean) ** 2) * w for t, w in zip(THETA_GRID, posterior))
    se = math.sqrt(max(variance, 0.0))

    level = theta_to_level(mean)
    confidence = sum(
        w for t, w in zip(THETA_GRID, posterior) if theta_to_level(t) == level
    )
    return Ability(mean, se, level, confidence, len(responses), posterior)


# --- adaptive testing ------------------------------------------------------
def select_next_item(
    candidates: list[tuple[int, float, float, float]],
    ability: Ability | None,
    target_level: int | None = None,
    exclude: set[int] | None = None,
) -> int | None:
    """Pick the item that will tell us the most, given what we know so far.

    `candidates` are (item_id, b, a, c). Selection is by maximum Fisher
    information at the current ability estimate, which is the standard adaptive
    rule: ask questions near the officer's own level, because an item they are
    certain to pass or certain to fail teaches us almost nothing.

    Before any responses exist we aim at the level their role requires, so the
    very first question is already informative rather than arbitrary.
    """
    exclude = exclude or set()
    if ability is not None and ability.n_responses > 0:
        at = ability.theta
    elif target_level is not None:
        at = level_to_theta(target_level)
    else:
        at = 0.0

    best_id, best_info = None, -1.0
    for item_id, b, a, c in candidates:
        if item_id in exclude:
            continue
        info = item_information(at, b, a, c)
        if info > best_info:
            best_id, best_info = item_id, info
    return best_id


def should_stop(ability: Ability, asked: int, min_items: int = 4, max_items: int = 12,
                se_target: float = 0.45) -> bool:
    """Stop when the estimate is precise enough, or we have asked enough.

    A fixed-length test wastes questions on officers who are clearly strong or
    clearly weak, and asks too few of those near a decision boundary.
    """
    if asked < min_items:
        return False
    if asked >= max_items:
        return True
    return ability.se <= se_target


# --- forgetting ------------------------------------------------------------
# Competency decays. An assessment from two years ago is weaker evidence than
# one from last week, and a system that reports both with equal confidence is
# lying about what it knows. We do not move the estimate - there is no evidence
# the officer got worse - we widen the uncertainty around it, which is what
# actually happened to our knowledge.
HALF_LIFE_DAYS = 365.0
MAX_DECAY_SD = 1.0


def decay_prior(theta: float, se: float, days_elapsed: float) -> tuple[float, float]:
    """Widen a stored estimate to account for the time since it was measured."""
    if days_elapsed <= 0:
        return theta, se
    # Variance grows toward the population prior as evidence ages.
    growth = MAX_DECAY_SD * (1.0 - math.exp(-days_elapsed / HALF_LIFE_DAYS))
    return theta, math.sqrt(se * se + growth * growth)
