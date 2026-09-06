"""Choosing which bank questions a checkpoint attempt should ask.

Before this, a checkpoint served every question its topic's bank held, in the
same order, on every attempt - so an officer who failed and retried answered
the exact same four questions again, having just been shown the correct answer
for each one in the previous attempt's review. That is not a second chance to
demonstrate the competency; it is a memory test.

The fix has two parts:

  * Never ask more than CHECKPOINT_QUIZ_SIZE questions. A handful of topics
    (the ones generated per video module) had accumulated 8-16 bank questions
    and so served all of them - already inconsistent with the "four-item
    checkpoint" this platform's own psychometrics assume everywhere else
    (see irt.py, psychometrics.py). Capping every checkpoint to the same size
    both restores that assumption and, not incidentally, is what creates room
    to rotate: a topic with more bank questions than a quiz needs has
    somewhere to draw a different set from.

  * When there is room to rotate, prefer whatever this officer has been asked
    least. Not "never repeat" - most topics today hold exactly four questions,
    which is exactly one checkpoint's worth, and no selection rule can serve
    four different questions from a bank of four. What every topic can offer,
    regardless of depth, is asking the least-recently-used items first, so a
    specific question only resurfaces after everything else available has
    already been asked at least as many times - a full rotation before any
    deliberate repeat, rather than the same four forever.

Difficulty is held fixed across that rotation. The bank is split into bands by
difficulty and apportioned a number of seats each, in proportion to how many
questions sit in that band - and that apportionment depends only on the bank
itself, never on the attempt number, so attempt 1 and attempt 40 draw from the
same three-band mix. What varies attempt to attempt is only which item within
each band gets asked.
"""
from __future__ import annotations

import random
from typing import NamedTuple

CHECKPOINT_QUIZ_SIZE = 4
DIFFICULTY_BANDS = 3


class BankItem(NamedTuple):
    id: int
    difficulty: float


def _difficulty_bands(items: list[BankItem], n_bands: int) -> list[list[BankItem]]:
    """Split a bank into n_bands roughly-equal groups by difficulty.

    Computed fresh from whatever the bank holds today rather than from fixed
    cut points, so the split stays sensible however an author's questions
    happen to be spread, and adapts automatically as the bank grows.
    """
    ordered = sorted(items, key=lambda item: (item.difficulty, item.id))
    bands: list[list[BankItem]] = [[] for _ in range(n_bands)]
    for index, item in enumerate(ordered):
        band = min(index * n_bands // len(ordered), n_bands - 1)
        bands[band].append(item)
    return bands


def _band_quota(band_sizes: list[int], quiz_size: int) -> list[int]:
    """How many of the quiz's seats each band gets, in proportion to its size.

    D'Hondt (highest-averages) apportionment: award one seat at a time to
    whichever band's size-per-seat-held is currently largest, skipping any
    band that has already given up every question it has. This is the same
    method used to apportion seats to parties by vote share, chosen here for
    the same reason - it is simple, it never overshoots what a band can
    supply, and for a fixed set of band sizes it always returns the same
    split, which is exactly the invariant "keep the ratio" needs.
    """
    total = sum(band_sizes)
    if total <= quiz_size:
        return list(band_sizes)

    quota = [0] * len(band_sizes)
    for _ in range(quiz_size):
        candidates = [i for i, size in enumerate(band_sizes) if quota[i] < size]
        best = max(candidates, key=lambda i: band_sizes[i] / (quota[i] + 1))
        quota[best] += 1
    return quota


def select_checkpoint_questions(
    bank: list[BankItem],
    times_seen: dict[int, int],
    last_seen_attempt: dict[int, int],
    attempt_no: int,
    quiz_size: int = CHECKPOINT_QUIZ_SIZE,
    n_bands: int = DIFFICULTY_BANDS,
) -> list[BankItem]:
    """The questions this attempt should ask.

    `times_seen` and `last_seen_attempt` describe this one officer's own
    history on this checkpoint - how many prior attempts included each
    question, and the most recent attempt number that did. Both default to
    "never" for a question absent from the dict, which is correct for a
    question that has never been asked or one an admin has just added.

    If the bank is no bigger than one quiz, there is nothing to select -
    every question is the quiz, in a fixed order, on every attempt. This is
    also what today's behaviour already was for every topic this size, so it
    is a deliberate no-op rather than a special case to work around.
    """
    if len(bank) <= quiz_size:
        return sorted(bank, key=lambda item: item.id)

    bands = _difficulty_bands(bank, n_bands)
    quotas = _band_quota([len(band) for band in bands], quiz_size)

    # Seeded on the attempt number and the bank's own question ids, so the
    # same attempt always resolves to the same picks (a GET immediately
    # followed by its matching POST must agree) while a later attempt, or a
    # bank an admin has edited, resolves differently. A string seed rather
    # than a tuple: Random() only accepts a handful of scalar types, and a
    # string is also the readable thing to log if a selection ever needs
    # explaining.
    seed = f"{attempt_no}:{','.join(str(item.id) for item in sorted(bank))}"
    rng = random.Random(seed)

    chosen: list[BankItem] = []
    for band, quota in zip(bands, quotas):
        if quota <= 0 or not band:
            continue
        # Least-asked first, then longest-since-asked, then a seeded shuffle
        # to vary which unseen items fill a band when there are more of them
        # than seats - so even a first retry does not always draw the same
        # "next" questions by id order.
        ranked = sorted(
            band,
            key=lambda item: (
                times_seen.get(item.id, 0),
                last_seen_attempt.get(item.id, 0),
                rng.random(),
            ),
        )
        chosen.extend(ranked[:quota])

    return sorted(chosen, key=lambda item: (item.difficulty, item.id))
