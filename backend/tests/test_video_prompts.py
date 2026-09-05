"""In-video retrieval prompts: placement, de-duplication, variety, and the
guarantee that answering one never moves a competency estimate."""
import pytest

from app.engines.embeddings import normalise
from app.engines.video_prompts import (
    DUPLICATE_THRESHOLD,
    LATEST_POSITION,
    MAX_PROMPTS_PER_LESSON,
    deduplicate,
    plan_segments,
    select_varied,
)

CHUNKS = [(i, "sentence " * 120) for i in range(12)]


class TestPlacement:
    def test_longer_lessons_get_more_pauses(self):
        short = plan_segments(CHUNKS, 3)
        long = plan_segments(CHUNKS, 17)
        assert len(short) < len(long)

    def test_a_lesson_never_gets_more_than_the_cap(self):
        assert len(plan_segments(CHUNKS, 90)) <= MAX_PROMPTS_PER_LESSON

    def test_every_lesson_gets_at_least_one(self):
        assert len(plan_segments(CHUNKS, 1)) >= 1

    def test_no_prompt_lands_after_the_video_ends(self):
        """A prompt at the final second never fires: playback has stopped."""
        for minutes in (3, 9, 17, 25):
            for segment in plan_segments(CHUNKS, minutes):
                assert segment.timestamp_seconds <= minutes * 60 * LATEST_POSITION + 1

    def test_prompts_run_in_order_through_the_video(self):
        stamps = [s.timestamp_seconds for s in plan_segments(CHUNKS, 17)]
        assert stamps == sorted(stamps)

    def test_a_segment_carries_the_chunks_it_asks_about(self):
        segments = plan_segments(CHUNKS, 17)
        covered = [cid for s in segments for cid in s.chunk_ids]
        assert covered == sorted(covered)
        assert len(set(covered)) == len(covered), "a chunk was used twice"

    def test_no_transcript_means_no_prompts(self):
        assert plan_segments([], 10) == []

    def test_a_missing_duration_does_not_crash(self):
        assert plan_segments(CHUNKS, 0)


class TestDeduplication:
    def test_a_reworded_question_is_dropped(self):
        original = normalise([1.0, 0.0, 0.0])
        reworded = normalise([0.99, 0.05, 0.0])
        distinct = normalise([0.0, 1.0, 0.0])
        kept = deduplicate([("a", original), ("b", reworded), ("c", distinct)])
        assert kept == [0, 2]

    def test_distinct_questions_all_survive(self):
        vectors = [normalise([1.0, 0, 0]), normalise([0, 1.0, 0]), normalise([0, 0, 1.0])]
        assert deduplicate([(str(i), v) for i, v in enumerate(vectors)]) == [0, 1, 2]

    def test_the_first_phrasing_wins(self):
        a = normalise([1.0, 0.0, 0.0])
        b = normalise([0.995, 0.02, 0.0])
        assert deduplicate([("first", a), ("second", b)]) == [0]

    def test_a_question_without_a_vector_is_kept_rather_than_lost(self):
        assert deduplicate([("no vector", [])]) == [0]

    def test_the_threshold_is_strict_enough_to_be_meaningful(self):
        assert 0.8 <= DUPLICATE_THRESHOLD <= 0.97


class TestVariety:
    POOL = [
        (1, normalise([1.0, 0.0, 0.0])),
        (2, normalise([0.0, 1.0, 0.0])),
        (3, normalise([0.0, 0.0, 1.0])),
    ]

    def test_picks_the_requested_number(self):
        assert len(select_varied(self.POOL, 2)) == 2

    def test_never_picks_the_same_prompt_twice(self):
        picked = select_varied(self.POOL, 3)
        assert len(set(picked)) == 3

    def test_avoids_what_the_learner_has_already_answered(self):
        """The whole point: a second viewing asks about something else."""
        seen = [normalise([1.0, 0.0, 0.0])]
        assert select_varied(self.POOL, 1, seen_vectors=seen)[0] != 1

    def test_asking_for_more_than_exists_returns_what_exists(self):
        assert len(select_varied(self.POOL, 99)) == 3

    def test_an_empty_pool_is_handled(self):
        assert select_varied([], 2) == []
        assert select_varied(self.POOL, 0) == []


class TestServing:
    @staticmethod
    def a_lesson_with_prompts(db):
        from sqlalchemy import select

        from app.models import VideoPrompt

        lesson_id = db.scalars(select(VideoPrompt.lesson_id)).first()
        if lesson_id is None:
            pytest.skip("no in-video prompts seeded in this checkout")
        return lesson_id

    def test_the_answer_key_is_never_sent_to_the_learner(self, client, db):
        lesson_id = self.a_lesson_with_prompts(db)
        body = client.get(
            f"/api/lessons/{lesson_id}/prompts", params={"user_id": "u-jso-anita"}
        ).json()
        assert body["prompts"]
        for prompt in body["prompts"]:
            assert "answer_index" not in prompt
            assert len(prompt["options"]) == 4

    def test_prompts_arrive_in_playback_order(self, client, db):
        lesson_id = self.a_lesson_with_prompts(db)
        body = client.get(
            f"/api/lessons/{lesson_id}/prompts", params={"user_id": "u-jso-anita"}
        ).json()
        stamps = [p["timestamp_seconds"] for p in body["prompts"]]
        assert stamps == sorted(stamps)

    def test_a_second_viewing_asks_something_else(self, client, db):
        lesson_id = self.a_lesson_with_prompts(db)
        first = client.get(
            f"/api/lessons/{lesson_id}/prompts", params={"user_id": "u-si-vikram"}
        ).json()["prompts"]
        if len(first) < 1:
            pytest.skip("lesson has no prompts")

        for prompt in first:
            client.post(
                f"/api/prompts/{prompt['id']}/answer",
                params={"user_id": "u-si-vikram"},
                json={"chosen_index": 0},
            )

        second = client.get(
            f"/api/lessons/{lesson_id}/prompts", params={"user_id": "u-si-vikram"}
        ).json()
        assert second["already_seen"] >= len(first)
        # With questions left in the pool, none of them should repeat.
        if second["pool_size"] > len(first):
            assert not ({p["id"] for p in first} & {p["id"] for p in second["prompts"]})

    def test_answering_reveals_the_key_and_what_was_said(self, client, db):
        lesson_id = self.a_lesson_with_prompts(db)
        prompt = client.get(
            f"/api/lessons/{lesson_id}/prompts", params={"user_id": "u-jso-farah"}
        ).json()["prompts"][0]

        body = client.post(
            f"/api/prompts/{prompt['id']}/answer",
            params={"user_id": "u-jso-farah"},
            json={"chosen_index": 0},
        ).json()
        assert body["correct"] == (body["answer_index"] == 0)
        assert body["graded"] is False

    def test_an_option_that_does_not_exist_is_rejected(self, client, db):
        lesson_id = self.a_lesson_with_prompts(db)
        prompt = client.get(
            f"/api/lessons/{lesson_id}/prompts", params={"user_id": "u-jso-anita"}
        ).json()["prompts"][0]
        response = client.post(
            f"/api/prompts/{prompt['id']}/answer",
            params={"user_id": "u-jso-anita"},
            json={"chosen_index": 99},
        )
        assert response.status_code == 400

    def test_unknown_lesson_and_user_are_404(self, client):
        assert (
            client.get("/api/lessons/999999/prompts", params={"user_id": "u-jso-anita"}).status_code
            == 404
        )

    def test_a_lesson_without_prompts_says_so_rather_than_erroring(self, client, db):
        from sqlalchemy import select

        from app.models import Lesson, VideoPrompt

        with_prompts = {row for row in db.scalars(select(VideoPrompt.lesson_id)).all()}
        bare = next(
            (
                lesson.id
                for lesson in db.scalars(select(Lesson)).all()
                if lesson.id not in with_prompts
            ),
            None,
        )
        if bare is None:
            pytest.skip("every lesson has prompts")
        body = client.get(
            f"/api/lessons/{bare}/prompts", params={"user_id": "u-jso-anita"}
        ).json()
        assert body["prompts"] == []
        assert "yet" in body["note"]


class TestTheyNeverAffectMeasurement:
    """The integrity guarantee. These questions are optional and the learner can
    rewind to look the answer up, so they are good practice and poor evidence."""

    def test_answering_prompts_does_not_move_the_competency_estimate(self, client, db):
        from sqlalchemy import select

        from app.engines.gap import compute_gaps
        from app.models import VideoPrompt

        lesson_id = db.scalars(select(VideoPrompt.lesson_id)).first()
        if lesson_id is None:
            pytest.skip("no in-video prompts seeded")

        before = compute_gaps(db, "u-da-imran")
        prompts = client.get(
            f"/api/lessons/{lesson_id}/prompts", params={"user_id": "u-da-imran"}
        ).json()["prompts"]
        for prompt in prompts:
            client.post(
                f"/api/prompts/{prompt['id']}/answer",
                params={"user_id": "u-da-imran"},
                json={"chosen_index": 0},
            )

        db.expire_all()
        after = compute_gaps(db, "u-da-imran")
        assert after.readiness_pct == before.readiness_pct
        assert after.evidence_coverage_pct == before.evidence_coverage_pct
        assert [i.attained_level for i in after.items] == [
            i.attained_level for i in before.items
        ]

    def test_answering_prompts_adds_nothing_to_the_response_corpus(self, client, db):
        """The corpus IRT learns from is built from checkpoint attempts only.

        Comparing id sets would prove nothing: VideoPrompt and BankQuestion have
        independent autoincrement keys, so both contain an id 1. What matters is
        that answering a prompt does not grow the corpus.
        """
        from sqlalchemy import select

        from app.engines.psychometrics import response_corpus
        from app.models import VideoPrompt

        lesson_id = db.scalars(select(VideoPrompt.lesson_id)).first()
        if lesson_id is None:
            pytest.skip("no in-video prompts seeded")

        before = len(response_corpus(db))
        prompts = client.get(
            f"/api/lessons/{lesson_id}/prompts", params={"user_id": "u-da-neha"}
        ).json()["prompts"]
        assert prompts, "no prompts to answer"
        for prompt in prompts:
            client.post(
                f"/api/prompts/{prompt['id']}/answer",
                params={"user_id": "u-da-neha"},
                json={"chosen_index": 0},
            )

        db.expire_all()
        assert len(response_corpus(db)) == before
