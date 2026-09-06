"""The rotation rule itself, isolated from the database and the API.

These operate on plain BankItem tuples so a failure here points straight at
the selection rule - band split, apportionment, or the least-recently-used
ordering - rather than at anything the router or the ORM did around it.
"""
from app.engines.checkpoint_rotation import (
    BankItem,
    select_checkpoint_questions,
)


def _bank(n: int) -> list[BankItem]:
    """n questions spread evenly across the difficulty range, ids 1..n."""
    span = max(n - 1, 1)
    return [BankItem(id=i + 1, difficulty=round(0.2 + 0.6 * (i / span), 3)) for i in range(n)]


class TestSmallBank:
    """A bank no bigger than one quiz has nothing to select - it is the quiz."""

    def test_returns_the_whole_bank_in_id_order(self):
        bank = _bank(4)
        for attempt_no in (1, 2, 3):
            assert select_checkpoint_questions(bank, {}, {}, attempt_no) == sorted(
                bank, key=lambda i: i.id
            )

    def test_a_bank_smaller_than_a_quiz_is_unaffected_too(self):
        bank = _bank(2)
        assert select_checkpoint_questions(bank, {}, {}, 1) == bank


class TestRotation:
    """A bank deeper than one quiz should draw a different set on a retry.

    These use n_bands=1 to isolate the least-recently-used rule from difficulty
    banding: with three bands, a band shallower than twice its own quota can be
    forced to give up a repeat sooner than the bank's total depth would suggest
    (see TestDifficultyRatio - that trade is deliberate, not a bug), which would
    make disjointness assertions here flaky depending on how the bank happens
    to split. One band removes that variable so what is being tested is only
    "prefer what has not been asked".
    """

    def test_a_fresh_attempt_needs_no_history(self):
        bank = _bank(8)
        chosen = select_checkpoint_questions(bank, {}, {}, attempt_no=1)
        assert len(chosen) == 4
        assert len(set(chosen)) == 4  # no question asked twice in one sitting

    def test_a_retry_draws_entirely_from_what_was_not_yet_asked(self):
        bank = _bank(8)
        first = select_checkpoint_questions(bank, {}, {}, attempt_no=1, n_bands=1)
        times_seen = {item.id: 1 for item in first}
        last_seen = {item.id: 1 for item in first}

        second = select_checkpoint_questions(
            bank, times_seen, last_seen, attempt_no=2, n_bands=1
        )

        # 8 questions, 4-question quizzes: attempt 1 exhausts exactly half the
        # bank, so attempt 2 has a full unseen half available and should take
        # it entirely rather than repeating anything from attempt 1.
        assert set(second).isdisjoint(first)

    def test_a_third_attempt_returns_to_the_least_recently_used_half(self):
        """Once both halves of an 8-question bank have been asked once, the
        next attempt should reuse attempt 1's questions before attempt 2's -
        they have been waiting longer - rather than picking arbitrarily."""
        bank = _bank(8)
        first = select_checkpoint_questions(bank, {}, {}, attempt_no=1, n_bands=1)
        times_seen = {item.id: 1 for item in first}
        last_seen = {item.id: 1 for item in first}

        second = select_checkpoint_questions(
            bank, times_seen, last_seen, attempt_no=2, n_bands=1
        )
        for item in second:
            times_seen[item.id] = times_seen.get(item.id, 0) + 1
            last_seen[item.id] = 2

        third = select_checkpoint_questions(bank, times_seen, last_seen, attempt_no=3, n_bands=1)
        assert set(third) == set(first)

    def test_selection_is_deterministic_for_the_same_attempt(self):
        """A GET immediately followed by its matching POST must resolve to the
        same quiz without either one persisting what the other chose."""
        bank = _bank(12)
        times_seen = {1: 2, 2: 1}
        last_seen = {1: 3, 2: 1}
        a = select_checkpoint_questions(bank, times_seen, last_seen, attempt_no=4)
        b = select_checkpoint_questions(bank, times_seen, last_seen, attempt_no=4)
        assert a == b

    def test_a_later_attempt_can_differ_even_with_identical_history(self):
        """Ties among equally-unseen questions are broken by attempt number,
        not always resolved the same way, so a retry is not just "the next
        four ids" in a fixed cycle."""
        bank = _bank(12)
        choices = {
            tuple(select_checkpoint_questions(bank, {}, {}, attempt_no=n))
            for n in range(1, 6)
        }
        assert len(choices) > 1


class TestDifficultyRatio:
    """The mix of easy/medium/hard seats must not depend on the attempt."""

    def test_band_composition_is_identical_across_attempts(self):
        bank = _bank(16)
        ordered = sorted(bank, key=lambda item: (item.difficulty, item.id))

        # The same thirds-of-the-sorted-bank split the engine itself uses, so
        # this checks whether the *quota per band* held steady - not a second
        # implementation of the split to compare against.
        def band_of(item: BankItem) -> int:
            index = ordered.index(item)
            return min(index * 3 // len(ordered), 2)

        times_seen: dict[int, int] = {}
        last_seen: dict[int, int] = {}
        compositions = []
        for attempt_no in range(1, 9):
            chosen = select_checkpoint_questions(bank, times_seen, last_seen, attempt_no)
            compositions.append(tuple(sorted(band_of(item) for item in chosen)))
            for item in chosen:
                times_seen[item.id] = times_seen.get(item.id, 0) + 1
                last_seen[item.id] = attempt_no

        # Each attempt can ask different *items*, but how many seats came from
        # the low/mid/high third of the bank must be the same every time -
        # including once history forces some attempts to reuse questions.
        assert len(set(compositions)) == 1, f"band mix drifted across attempts: {compositions}"

    def test_quiz_size_is_always_met_when_the_bank_allows_it(self):
        """The apportionment must never come up short by rounding, whatever
        the bank size - including ones that split unevenly across 3 bands."""
        for n in (5, 6, 7, 9, 10, 13, 17):
            bank = _bank(n)
            chosen = select_checkpoint_questions(bank, {}, {}, attempt_no=1)
            assert len(chosen) == min(n, 4)
            assert len(set(chosen)) == len(chosen)  # never doubles up an item
