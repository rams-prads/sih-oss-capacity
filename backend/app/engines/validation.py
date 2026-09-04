"""Does the competency estimate actually predict anything?

A competency score is a claim about the future: this officer will handle this
kind of work. The only honest test of such a claim is prediction on data the
model has not seen. We hold out responses, fit on the rest, and ask the model to
predict the held-out answers before it is shown them.

This module exists so the accuracy claim is a measurement rather than an
assertion, and so a regression in the estimator shows up as a number going down.

Reported against a ladder of baselines, each adding one idea:

    base rate     everyone is average, every item is average
    item only     items differ, officers do not
    legacy        the difficulty-weighted percentage this project used before
    IRT authored  full model, but difficulty as the author guessed it
    IRT calibrated  full model, difficulty and discrimination learned from data

If a stage does not beat the one below it, that stage is not earning its place.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass

from app.engines.irt import (
    DEFAULT_GUESSING,
    Response,
    authored_difficulty_to_b,
    estimate_ability,
    level_to_theta,
    probability_correct,
)


@dataclass
class Scores:
    name: str
    n: int
    accuracy: float
    auc: float
    brier: float
    log_loss: float
    calibration_error: float

    def row(self) -> str:
        return (
            f"{self.name:<18} {self.accuracy:>8.1%} {self.auc:>7.3f} "
            f"{self.brier:>8.3f} {self.log_loss:>9.3f} {self.calibration_error:>7.3f}"
        )


def auc(probabilities: list[float], outcomes: list[bool]) -> float:
    """Area under the ROC curve, by rank (Mann-Whitney U).

    0.5 is a coin flip; 1.0 orders every correct answer above every wrong one.
    Robust to the class imbalance that accuracy hides.
    """
    positives = [p for p, y in zip(probabilities, outcomes) if y]
    negatives = [p for p, y in zip(probabilities, outcomes) if not y]
    if not positives or not negatives:
        return float("nan")

    order = sorted(range(len(probabilities)), key=lambda i: probabilities[i])
    ranks = [0.0] * len(probabilities)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and probabilities[order[j + 1]] == probabilities[order[i]]:
            j += 1
        shared = (i + j) / 2.0 + 1.0        # average rank for ties
        for k in range(i, j + 1):
            ranks[order[k]] = shared
        i = j + 1

    rank_sum = sum(r for r, y in zip(ranks, outcomes) if y)
    n_pos, n_neg = len(positives), len(negatives)
    return (rank_sum - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg)


def expected_calibration_error(
    probabilities: list[float], outcomes: list[bool], bins: int = 10
) -> float:
    """Do the stated probabilities mean what they say?

    Of the answers we called 70% likely, about 70% should be correct. A model
    can rank perfectly (high AUC) and still be badly calibrated, and a
    competency system that says "Proficient, 90% confident" had better be right
    about nine times in ten.
    """
    buckets: list[list[tuple[float, bool]]] = [[] for _ in range(bins)]
    for p, y in zip(probabilities, outcomes):
        buckets[min(bins - 1, int(p * bins))].append((p, y))

    total = len(probabilities)
    error = 0.0
    for bucket in buckets:
        if not bucket:
            continue
        mean_p = sum(p for p, _y in bucket) / len(bucket)
        observed = sum(1 for _p, y in bucket if y) / len(bucket)
        error += (len(bucket) / total) * abs(mean_p - observed)
    return error


def score(name: str, probabilities: list[float], outcomes: list[bool]) -> Scores:
    clipped = [min(max(p, 1e-6), 1 - 1e-6) for p in probabilities]
    n = len(outcomes)
    return Scores(
        name=name,
        n=n,
        accuracy=sum(1 for p, y in zip(clipped, outcomes) if (p >= 0.5) == y) / n,
        auc=auc(clipped, outcomes),
        brier=sum((p - y) ** 2 for p, y in zip(clipped, outcomes)) / n,
        log_loss=-sum(
            math.log(p) if y else math.log(1 - p) for p, y in zip(clipped, outcomes)
        ) / n,
        calibration_error=expected_calibration_error(clipped, outcomes),
    )


def legacy_level(correct: list[bool], difficulties: list[float]) -> int:
    """The estimator this project used before, kept so the comparison is fair.

    observed = 4 * sum(correct_i * d_i) / sum(d_i), blended with the prior.
    Reproduced here rather than imported so that deleting it from the live path
    does not silently delete the baseline it is being measured against.
    """
    if not correct:
        return 0
    total = sum(difficulties)
    if total <= 0:
        return 0
    earned = sum(d for ok, d in zip(correct, difficulties) if ok)
    observed = 4.0 * earned / total
    return max(0, min(4, round(0.5 * observed + 0.5 * 0.0)))


def cross_validate(
    responses: list[tuple[str, int, bool]],
    authored: dict[int, float],
    calibrated: dict[int, tuple[float, float, float]] | None = None,
    holdout: float = 0.25,
    seed: int = 20260101,
) -> list[Scores]:
    """Hold out responses, fit on the rest, predict what was held out.

    The split is per response rather than per officer, so every officer has some
    history to estimate from - which is the situation the live system is in.
    """
    rng = random.Random(seed)
    shuffled = responses[:]
    rng.shuffle(shuffled)
    cut = int(len(shuffled) * (1 - holdout))
    train, test = shuffled[:cut], shuffled[cut:]
    if not test or not train:
        return []

    outcomes = [ok for _u, _i, ok in test]

    # --- baseline 1: the overall pass rate, for everyone, on everything ------
    base_rate = sum(1 for _u, _i, ok in train if ok) / len(train)
    preds_base = [base_rate] * len(test)

    # --- baseline 2: items differ, officers do not ---------------------------
    item_rate: dict[int, list[int]] = {}
    for _u, item_id, ok in train:
        item_rate.setdefault(item_id, []).append(1 if ok else 0)
    preds_item = [
        (sum(item_rate[i]) / len(item_rate[i])) if i in item_rate else base_rate
        for _u, i, _ok in test
    ]

    # --- shared: each officer's training responses ---------------------------
    by_user: dict[str, list[tuple[int, bool]]] = {}
    for user_id, item_id, ok in train:
        by_user.setdefault(user_id, []).append((item_id, ok))

    def params(item_id: int) -> tuple[float, float, float]:
        if calibrated and item_id in calibrated:
            return calibrated[item_id]
        return authored_difficulty_to_b(authored.get(item_id, 0.5)), 1.0, DEFAULT_GUESSING

    def predict(theta_of: dict[str, float], use_calibrated: bool) -> list[float]:
        out = []
        for user_id, item_id, _ok in test:
            b, a, c = params(item_id) if use_calibrated else (
                authored_difficulty_to_b(authored.get(item_id, 0.5)), 1.0, DEFAULT_GUESSING
            )
            out.append(probability_correct(theta_of.get(user_id, 0.0), b, a, c))
        return out

    # --- baseline 3: the legacy difficulty-weighted level --------------------
    legacy_theta: dict[str, float] = {}
    for user_id, rows in by_user.items():
        legacy_theta[user_id] = level_to_theta(
            legacy_level(
                [ok for _i, ok in rows],
                [authored.get(i, 0.5) for i, _ok in rows],
            )
        )
    preds_legacy = predict(legacy_theta, use_calibrated=False)

    # --- IRT on authored difficulty ------------------------------------------
    authored_theta = {
        user_id: estimate_ability(
            [
                Response(authored_difficulty_to_b(authored.get(i, 0.5)), ok)
                for i, ok in rows
            ]
        ).theta
        for user_id, rows in by_user.items()
    }
    preds_irt_authored = predict(authored_theta, use_calibrated=False)

    results = [
        score("base rate", preds_base, outcomes),
        score("item only", preds_item, outcomes),
        score("legacy estimator", preds_legacy, outcomes),
        score("IRT authored", preds_irt_authored, outcomes),
    ]

    # --- IRT on calibrated parameters ----------------------------------------
    if calibrated:
        def to_responses(rows: list[tuple[int, bool]]) -> list[Response]:
            out = []
            for item_id, ok in rows:
                b, a, c = params(item_id)
                out.append(Response(b, ok, a, c))
            return out

        calibrated_theta = {
            user_id: estimate_ability(to_responses(rows)).theta
            for user_id, rows in by_user.items()
        }
        results.append(
            score("IRT calibrated", predict(calibrated_theta, use_calibrated=True), outcomes)
        )

    return results


HEADER = (
    f"{'model':<18} {'accuracy':>8} {'AUC':>7} {'Brier':>8} {'log loss':>9} {'cal.err':>7}"
)
