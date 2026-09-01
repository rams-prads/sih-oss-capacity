"""Adaptive-lite proficiency estimation (spec 8.4).

A quiz score alone is a poor proficiency estimate: 60% on easy items is not the
same evidence as 60% on hard ones. We weight each item by its difficulty, map
the result onto the 0-4 FRAC scale, then blend with the prior attained level via
an EMA so a single assessment cannot swing an officer's record wildly.

    observed = 4 * sum(correct_i * difficulty_i) / sum(difficulty_i)
    new      = clamp(round(alpha * observed + (1 - alpha) * prior), 0, 4)
"""
from __future__ import annotations

EMA_ALPHA = 0.5


def observed_level(per_item: list[bool], difficulties: list[float]) -> float:
    """Difficulty-weighted score mapped onto the 0-4 proficiency scale."""
    if not per_item:
        return 0.0
    weights = difficulties or [0.5] * len(per_item)
    # Guard against a zero/absent difficulty vector.
    total_weight = sum(weights)
    if total_weight <= 0:
        weights = [1.0] * len(per_item)
        total_weight = float(len(per_item))
    earned = sum(w for correct, w in zip(per_item, weights) if correct)
    return 4.0 * earned / total_weight


def update_attained_level(
    prior_level: int,
    per_item: list[bool],
    difficulties: list[float],
    alpha: float = EMA_ALPHA,
) -> int:
    """Blend the new evidence with the officer's prior attained level."""
    observed = observed_level(per_item, difficulties)
    blended = alpha * observed + (1 - alpha) * prior_level
    return max(0, min(4, round(blended)))


def score_pct(per_item: list[bool]) -> float:
    if not per_item:
        return 0.0
    return round(100 * sum(1 for c in per_item if c) / len(per_item), 1)
