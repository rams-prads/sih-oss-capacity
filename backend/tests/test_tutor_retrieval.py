"""The tutor answering subject questions from what the lessons said.

Before retrieval the tutor's context held the officer's progress and nothing
the lessons contained, so any subject question was declined however good the
model was. These check that it now reaches the material, stays inside the
course, and still refuses when nothing relevant is found.

Nothing here calls the embedding API: the query vector is stubbed.
"""
import pytest
from sqlalchemy import select

import app.engines.embeddings as embeddings
from app.engines.tutor import answer, passages_for_model, retrieve_passages
from app.models import Enrolment, TranscriptChunk


def a_transcribed_course(db):
    chunk = db.scalars(select(TranscriptChunk)).first()
    if chunk is None:
        pytest.skip("no transcripts seeded in this checkout")
    return chunk.course_identifier, chunk


@pytest.fixture
def stub_query_vector(monkeypatch):
    """Stand a stored chunk's own vector in for the query embedding."""

    def use(vector):
        monkeypatch.setattr(
            embeddings,
            "embed_texts",
            lambda texts, task_type="RETRIEVAL_DOCUMENT", **kw: [vector],
        )

    return use


class TestRetrieval:
    def test_finds_the_passage_that_answers_the_question(self, db, stub_query_vector):
        course, chunk = a_transcribed_course(db)
        stub_query_vector(chunk.embedding)

        passages = retrieve_passages(db, course, "anything")
        assert passages
        assert passages[0]["quote"] == chunk.text
        assert passages[0]["score"] == pytest.approx(1.0, abs=1e-3)

    def test_stays_inside_the_course(self, db, stub_query_vector):
        """An officer asking inside a course wants that course's material."""
        course, chunk = a_transcribed_course(db)
        stub_query_vector(chunk.embedding)

        for passage in retrieve_passages(db, course, "anything"):
            owner = db.scalars(
                select(TranscriptChunk).where(TranscriptChunk.lesson_id == passage["lesson_id"])
            ).first()
            assert owner.course_identifier == course

    def test_names_the_lesson_each_passage_came_from(self, db, stub_query_vector):
        course, chunk = a_transcribed_course(db)
        stub_query_vector(chunk.embedding)

        for passage in retrieve_passages(db, course, "anything"):
            assert passage["lesson_title"]
            assert passage["lesson_id"]

    def test_an_unrelated_question_retrieves_nothing(self, db, monkeypatch):
        """Below the relevance floor the tutor must get no material at all."""
        course, chunk = a_transcribed_course(db)
        # A vector nearly orthogonal to everything stored.
        far = embeddings.normalise([1.0] + [0.0] * (len(chunk.embedding) - 1))
        monkeypatch.setattr(
            embeddings, "embed_texts", lambda texts, task_type="x", **kw: [far]
        )
        assert retrieve_passages(db, course, "how do I bake bread") == []

    def test_a_broken_embedder_degrades_instead_of_erroring(self, db, monkeypatch):
        """Losing retrieval costs subject answers, not the whole tutor."""
        course, _chunk = a_transcribed_course(db)

        def explode(*_args, **_kwargs):
            raise RuntimeError("no key")

        monkeypatch.setattr(embeddings, "embed_texts", explode)
        assert retrieve_passages(db, course, "what is a UDF") == []

    def test_a_course_with_no_transcripts_retrieves_nothing(self, db, stub_query_vector):
        _course, chunk = a_transcribed_course(db)
        stub_query_vector(chunk.embedding)
        assert retrieve_passages(db, "do_not_a_real_course", "anything") == []


class TestPromptAssembly:
    def test_passages_are_labelled_with_their_lesson(self):
        text = passages_for_model(
            [{"lesson_id": 1, "lesson_title": "Histograms", "quote": "A histogram bins values.", "score": 0.9}]
        )
        assert "Histograms" in text
        assert "A histogram bins values." in text

    def test_nothing_retrieved_adds_nothing_to_the_prompt(self):
        assert passages_for_model([]) == ""


class FakeProvider:
    """Records what context it was handed, and answers from it."""

    name = "fake"

    def __init__(self):
        self.context = ""

    def chat(self, context: str, question: str) -> str:
        self.context = context
        return "Answer grounded in the supplied context."


class TestAnsweringWithRetrieval:
    @staticmethod
    def enrol(db, user_id, course):
        existing = db.scalars(
            select(Enrolment).where(
                Enrolment.user_id == user_id, Enrolment.course_identifier == course
            )
        ).first()
        if existing is None:
            db.add(Enrolment(user_id=user_id, course_identifier=course, course_name="Course"))
            db.commit()

    def test_the_lessons_reach_the_model(self, db, stub_query_vector):
        course, chunk = a_transcribed_course(db)
        self.enrol(db, "u-jso-anita", course)
        stub_query_vector(chunk.embedding)

        provider = FakeProvider()
        reply = answer(db, "u-jso-anita", course, "explain this subject please", provider)

        assert chunk.text[:60] in provider.context, "retrieved material never reached the prompt"
        assert reply.source == "lessons"
        assert reply.sources

    def test_an_answer_says_which_lessons_it_rests_on(self, db, stub_query_vector):
        course, chunk = a_transcribed_course(db)
        self.enrol(db, "u-jso-anita", course)
        stub_query_vector(chunk.embedding)

        reply = answer(db, "u-jso-anita", course, "explain this subject please", FakeProvider())
        for source in reply.sources:
            assert source["lesson_title"]
            assert 0.0 <= source["score"] <= 1.0

    def test_without_retrieval_the_answer_is_not_credited_to_the_lessons(self, db, monkeypatch):
        course, _chunk = a_transcribed_course(db)
        self.enrol(db, "u-jso-anita", course)
        monkeypatch.setattr(
            embeddings, "embed_texts", lambda *a, **k: (_ for _ in ()).throw(RuntimeError())
        )

        reply = answer(db, "u-jso-anita", course, "explain this subject please", FakeProvider())
        assert reply.source == "model"
        assert reply.sources == []

    def test_record_questions_still_bypass_the_model_entirely(self, db, stub_query_vector):
        """Progress and weakness come from the record, where the numbers are real."""
        course, chunk = a_transcribed_course(db)
        self.enrol(db, "u-jso-anita", course)
        stub_query_vector(chunk.embedding)

        provider = FakeProvider()
        reply = answer(db, "u-jso-anita", course, "how am I doing?", provider)
        assert reply.source == "record"
        assert provider.context == "", "the model was called for a question the record answers"
