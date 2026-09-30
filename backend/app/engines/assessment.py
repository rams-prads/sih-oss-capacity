"""Difficulty-weighted scoring (spec 8.4).

A raw score is a poor proficiency estimate: 60% on easy items is not the same
evidence as 60% on hard ones. Each item is weighted by its difficulty and the
result mapped onto the 0-4 FRAC scale.

    observed = 4 * sum(correct_i * difficulty_i) / sum(difficulty_i)

This is what routers/onboarding.py turns a baseline sitting into a starting
level with. Note what is not here: there is no function that blends a quiz into
an officer's existing level. Once a level exists, it is re-estimated by the IRT
model in engines/irt.py from calibrated bank items, which the generated-quiz
route deliberately does not feed.
"""
from __future__ import annotations


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


def score_pct(per_item: list[bool]) -> float:
    if not per_item:
        return 0.0
    return round(100 * sum(1 for c in per_item if c) / len(per_item), 1)
