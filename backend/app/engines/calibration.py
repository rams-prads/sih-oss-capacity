"""Learn what each question is actually worth, from how officers answer it.

Authored difficulty is a guess. The person writing an item is a poor judge of
how hard it will prove: items intended as gentle warm-ups turn out to catch
experienced officers, and items meant to be searching turn out to be guessable
from the wording. Trusting that guess is the single largest source of error in a
competency estimate, because every ability estimate is computed against it.

So we treat the authored value as a prior and replace it with evidence:

    b (difficulty)     where on the ability scale the item bites
    a (discrimination) how sharply it separates officers who know the topic
                       from those who do not

Discrimination matters more than difficulty for precision. A simulation over the
seeded bank shows exact-level accuracy moving from 61% to 83% as discrimination
rises from 1.0 to 2.0 at the same test length, which is why we estimate it rather
than assuming the Rasch value of 1.0 as DataCamp's published model does.

Method: alternating maximum a posteriori, the practical form of joint estimation.
Hold abilities fixed and fit each item; hold items fixed and re-fit abilities;
repeat. It is not marginal maximum likelihood, which would need far more data
than a department generates, but it is stable at our scale and degrades to the
authored prior when an item has too few responses to say anything.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.engines.irt import (
    DEFAULT_DISCRIMINATION,
    DEFAULT_GUESSING,
    Response,
    authored_difficulty_to_b,
    estimate_ability,
    probability_correct,
)

# An item needs a reasonable number of responses before its own data outweighs
# the author's judgement. Below this we keep the authored value and say so.
MIN_RESPONSES_TO_CALIBRATE = 20

# Priors. b is centred on the authored difficulty; a is centred on the Rasch
# value, and bounded, because unbounded discrimination estimates run away on
# small samples and produce items that look impossibly informative.
PRIOR_B_SD = 1.0
PRIOR_LOG_A_SD = 0.4
A_MIN, A_MAX = 0.3, 2.5
B_MIN, B_MAX = -4.0, 4.0


@dataclass
class ItemParameters:
    item_id: int
    b: float
    a: float = DEFAULT_DISCRIMINATION
    c: float = DEFAULT_GUESSING
    n_responses: int = 0
    p_correct: float = 0.0
    calibrated: bool = False
    authored_b: float = 0.0

    @property
    def status(self) -> str:
        if self.calibrated:
            return "calibrated"
        if self.n_responses:
            return f"provisional ({self.n_responses}/{MIN_RESPONSES_TO_CALIBRATE})"
        return "authored"

    @property
    def drift(self) -> float:
        """How far evidence moved the item from where its author placed it."""
        return self.b - self.authored_b


@dataclass
class CalibrationReport:
    items: dict[int, ItemParameters] = field(default_factory=dict)
    iterations: int = 0
    n_responses: int = 0
    n_calibrated: int = 0

    def flagged(self, threshold: float = 1.0) -> list[ItemParameters]:
        """Calibrated items whose real difficulty is far from the authored one.

        These are worth an author's attention: usually a mis-keyed answer, an
        ambiguous stem, or a distractor that is accidentally defensible.
        """
        return sorted(
            (i for i in self.items.values() if i.calibrated and abs(i.drift) >= threshold),
            key=lambda i: -abs(i.drift),
        )

    def low_discrimination(self, threshold: float = 0.5) -> list[ItemParameters]:
        """Items that barely separate strong officers from weak ones.

        A near-zero discrimination means the item is measuring something other
        than the topic - noise, reading speed, or a trick.
        """
        return sorted(
            (i for i in self.items.values() if i.calibrated and i.a <= threshold),
            key=lambda i: i.a,
        )


def _fit_one_item(
    abilities: list[float],
    correct: list[bool],
    prior_b: float,
    c: float,
) -> tuple[float, float]:
    """Maximum a posteriori (b, a) for one item, by direct grid search.

    A grid rather than Newton-Raphson because the 3PL likelihood with a fixed
    guessing floor is not reliably concave, and a coarse-then-fine grid over a
    bounded region is both robust and fast enough: two parameters, a few hundred
    evaluations, once per item per calibration run.
    """
    best = (prior_b, DEFAULT_DISCRIMINATION, -math.inf)

    def log_posterior(b: float, a: float) -> float:
        total = (
            -0.5 * ((b - prior_b) / PRIOR_B_SD) ** 2
            - 0.5 * (math.log(a) / PRIOR_LOG_A_SD) ** 2
        )
        for theta, is_correct in zip(abilities, correct):
            p = probability_correct(theta, b, a, c)
            p = min(max(p, 1e-9), 1.0 - 1e-9)
            total += math.log(p) if is_correct else math.log(1.0 - p)
        return total

    # Coarse pass, then refine around the winner.
    b_lo, b_hi, a_lo, a_hi, steps = B_MIN, B_MAX, A_MIN, A_MAX, 12
    for _ in range(3):
        b_step = (b_hi - b_lo) / steps
        a_step = (a_hi - a_lo) / steps
        for i in range(steps + 1):
            b = b_lo + i * b_step
            for j in range(steps + 1):
                a = a_lo + j * a_step
                if a <= 0:
                    continue
                score = log_posterior(b, a)
                if score > best[2]:
                    best = (b, a, score)
        b, a = best[0], best[1]
        b_lo, b_hi = max(B_MIN, b - b_step), min(B_MAX, b + b_step)
        a_lo, a_hi = max(A_MIN, a - a_step), min(A_MAX, a + a_step)

    return best[0], best[1]


def calibrate_items(
    responses: list[tuple[str, int, bool]],
    authored: dict[int, float],
    guessing: dict[int, float] | None = None,
    iterations: int = 3,
) -> CalibrationReport:
    """Estimate item parameters from a corpus of (user_id, item_id, correct).

    Alternates between estimating officers' abilities given current item
    parameters, and re-fitting item parameters given those abilities.
    """
    guessing = guessing or {}
    by_item: dict[int, list[tuple[str, bool]]] = {}
    by_user: dict[str, list[tuple[int, bool]]] = {}
    for user_id, item_id, correct in responses:
        by_item.setdefault(item_id, []).append((user_id, correct))
        by_user.setdefault(user_id, []).append((item_id, correct))

    params: dict[int, ItemParameters] = {}
    for item_id, rows in by_item.items():
        b0 = authored_difficulty_to_b(authored.get(item_id, 0.5))
        params[item_id] = ItemParameters(
            item_id=item_id,
            b=b0,
            authored_b=b0,
            c=guessing.get(item_id, DEFAULT_GUESSING),
            n_responses=len(rows),
            p_correct=sum(1 for _u, ok in rows if ok) / len(rows),
        )

    for _ in range(iterations):
        # E-ish step: where does each officer sit, given the current items?
        theta: dict[str, float] = {}
        for user_id, rows in by_user.items():
            rs = [
                Response(params[i].b, ok, params[i].a, params[i].c)
                for i, ok in rows
                if i in params
            ]
            theta[user_id] = estimate_ability(rs).theta

        # M-ish step: what is each item worth, given where the officers sit?
        for item_id, rows in by_item.items():
            p = params[item_id]
            if p.n_responses < MIN_RESPONSES_TO_CALIBRATE:
                continue
            abilities = [theta[u] for u, _ok in rows]
            correct = [ok for _u, ok in rows]
            p.b, p.a = _fit_one_item(abilities, correct, p.authored_b, p.c)
            p.calibrated = True

    return CalibrationReport(
        items=params,
        iterations=iterations,
        n_responses=len(responses),
        n_calibrated=sum(1 for p in params.values() if p.calibrated),
    )
