"""Chunking and retrieval. Nothing here calls the embedding API."""
import pytest

from app.engines.embeddings import (
    CHUNK_CHARS,
    MIN_RELEVANCE,
    chunk_transcript,
    cosine,
    normalise,
    search,
)


class TestChunking:
    def test_short_text_stays_whole(self):
        assert chunk_transcript("One short sentence.") == ["One short sentence."]

    def test_empty_text_yields_nothing(self):
        assert chunk_transcript("") == []
        assert chunk_transcript("   \n  ") == []

    def test_long_text_is_split(self):
        text = " ".join(f"Sentence number {i} about survey sampling." for i in range(400))
        chunks = chunk_transcript(text)
        assert len(chunks) > 1

    def test_no_chunk_exceeds_the_budget_by_much(self):
        text = " ".join(f"Sentence number {i} about survey sampling." for i in range(400))
        for chunk in chunk_transcript(text):
            assert len(chunk) <= CHUNK_CHARS + 200

    def test_splits_on_sentence_boundaries(self):
        """A chunk starting mid-claim embeds badly and reads badly when quoted."""
        text = " ".join(f"This is sentence {i} and it ends here." for i in range(200))
        for chunk in chunk_transcript(text):
            assert chunk[0].isupper() or chunk[0].isdigit()

    def test_a_single_oversized_sentence_is_still_split(self):
        text = "word " * 2000    # no sentence boundary at all
        chunks = chunk_transcript(text)
        assert len(chunks) > 1
        assert all(len(c) <= CHUNK_CHARS + 200 for c in chunks)

    def test_whitespace_is_collapsed(self):
        assert chunk_transcript("a\n\n  b\tc") == ["a b c"]


class TestVectorMath:
    def test_normalise_gives_unit_length(self):
        v = normalise([3.0, 4.0])
        assert sum(x * x for x in v) == pytest.approx(1.0)

    def test_normalise_survives_a_zero_vector(self):
        assert normalise([0.0, 0.0]) == [0.0, 0.0]

    def test_cosine_of_identical_unit_vectors_is_one(self):
        v = normalise([1.0, 2.0, 3.0])
        assert cosine(v, v) == pytest.approx(1.0)

    def test_cosine_of_orthogonal_vectors_is_zero(self):
        assert cosine([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)

    def test_mismatched_or_empty_vectors_score_zero(self):
        assert cosine([1.0, 0.0], [1.0]) == 0.0
        assert cosine([], [1.0]) == 0.0


class TestSearch:
    CHUNKS = [
        (1, 10, "c1", "about sampling frames", normalise([1.0, 0.0, 0.0])),
        (2, 11, "c1", "about imputation", normalise([0.0, 1.0, 0.0])),
        (3, 12, "c2", "about SQL functions", normalise([0.0, 0.0, 1.0])),
    ]

    def test_ranks_the_closest_passage_first(self):
        hits = search(normalise([0.9, 0.1, 0.0]), self.CHUNKS, limit=3)
        assert hits[0].chunk_id == 1
        assert hits[0].score > hits[1].score

    def test_respects_the_limit(self):
        assert len(search(normalise([1.0, 1.0, 1.0]), self.CHUNKS, limit=2)) == 2

    def test_a_weak_match_is_dropped_rather_than_returned(self):
        """A tutor handed a weak match answers from its own knowledge instead."""
        # Nearly orthogonal to every stored chunk: cosine well under the floor.
        far = normalise([0.10, 0.10, 0.10])
        assert max(cosine(far, c[4]) for c in self.CHUNKS) < MIN_RELEVANCE
        assert search(far, self.CHUNKS, min_score=MIN_RELEVANCE) == []

    def test_chunks_without_an_embedding_are_skipped(self):
        chunks = [(9, 90, "c9", "not embedded yet", [])]
        assert search(normalise([1.0, 0.0, 0.0]), chunks) == []

    def test_the_threshold_is_above_the_similarity_floor(self):
        """Gemini scores unrelated English around 0.45-0.50, measured."""
        assert MIN_RELEVANCE > 0.55


class TestStoredTranscripts:
    def test_transcripts_load_with_their_chunks(self, db):
        from sqlalchemy import select

        from app.models import LessonTranscript, TranscriptChunk

        transcripts = db.scalars(select(LessonTranscript)).all()
        if not transcripts:
            pytest.skip("no transcripts seeded in this checkout")

        for transcript in transcripts:
            assert transcript.text.strip()
            assert transcript.char_count == len(transcript.text)

        chunks = db.scalars(select(TranscriptChunk)).all()
        assert chunks, "transcripts were loaded but produced no chunks"
        for chunk in chunks:
            assert chunk.text.strip()
            if chunk.embedding:
                assert len(chunk.embedding) == chunk.dimensions
                # Stored normalised, so cosine is a plain dot product.
                assert sum(v * v for v in chunk.embedding) == pytest.approx(1.0, abs=1e-3)

    def test_every_chunk_points_at_a_real_lesson(self, db):
        from sqlalchemy import select

        from app.models import Lesson, TranscriptChunk

        lesson_ids = {lesson.id for lesson in db.scalars(select(Lesson)).all()}
        for chunk in db.scalars(select(TranscriptChunk)).all():
            assert chunk.lesson_id in lesson_ids
