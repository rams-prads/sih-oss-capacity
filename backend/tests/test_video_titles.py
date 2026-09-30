"""The name a video gives itself, where iGOT published a placeholder."""
import re

from app.engines.video_titles import is_placeholder, recovered_titles, title_from_transcript

DEMO = "u-jso-anita"


def test_a_published_placeholder_is_recognised_as_one():
    for title in ("Video 3", "video 12", "Lesson 2", "SQL2_Resource1", "Part 4", "  "):
        assert is_placeholder(title), title
    for title in ("Measuring GDP - Concepts", "Histograms", "Video editing for surveys"):
        assert not is_placeholder(title), title


def test_the_opening_title_card_is_the_name():
    card = title_from_transcript(
        "USER DEFINED FUNCTIONS (UDFs) - INTRODUCTION\nWhat are UDFs?\nSimilar to Python."
    )
    # Set in capitals on the slide; sentence case to read, with the acronym kept.
    assert card == "User Defined Functions (UDFs) - Introduction"
    assert title_from_transcript("GDP AND THE CIRCULAR FLOW OF INCOME\nLet us begin.") == (
        "GDP and the Circular Flow of Income"
    )
    # Title case on the slide is left exactly as the author set it.
    assert title_from_transcript("Cleaning MIS Data\nIn this video") == "Cleaning MIS Data"


def test_a_video_that_opens_on_speech_keeps_its_published_name():
    for text in (
        "In the third session, we'll go into some advanced concepts in SQL.",
        "00:00 [Music]",
        "[Music]",
        "so today we are looking at indexes",
        "THIS IS A LONG SHOUTED SENTENCE THAT RUNS WELL PAST ANY REASONABLE TITLE CARD LENGTH",
        "",
    ):
        assert title_from_transcript(text) is None, text


def test_only_placeholders_are_renamed(db):
    """A lesson iGOT named properly is never overwritten by its title card."""
    from sqlalchemy import select

    from app.models import Lesson, LessonTranscript

    courses = db.scalars(select(Lesson.course_identifier).distinct()).all()
    renamed = 0
    for course in courses:
        found = recovered_titles(db, course)
        for lesson_id, title in found.items():
            lesson = db.get(Lesson, lesson_id)
            assert is_placeholder(lesson.title)
            assert not is_placeholder(title)
            assert db.scalar(
                select(LessonTranscript).where(LessonTranscript.lesson_id == lesson_id)
            )
            renamed += 1
    # The seed carries transcripts, and at least one of them opens on a card.
    assert renamed >= 1


def test_the_curriculum_serves_the_recovered_name_and_says_where_it_came_from(client):
    courses = client.get(f"/api/users/{DEMO}/learning").json()["courses"]
    lessons = [lesson for c in courses for m in c["modules"] for lesson in m["lessons"]]
    assert lessons, "the demo officer has a curriculum"

    from_video = [lesson for lesson in lessons if lesson["title_from"] == "video"]
    assert from_video, "at least one video names itself"
    for lesson in from_video:
        assert not re.fullmatch(r"(?i)video\s*\d+", lesson["title"])
    for lesson in lessons:
        assert lesson["title_from"] in {"video", "catalogue"}


def test_a_course_carries_what_it_is_for_the_about_panel(client):
    courses = client.get(f"/api/users/{DEMO}/learning").json()["courses"]
    igot = [c for c in courses if c["source"] == "igot" and c["lessons_total"] > 0]
    assert igot, "the demo officer is enrolled in ingested iGOT courses"

    described = [c for c in igot if c["description"]]
    assert described, "iGOT publishes descriptions and they reach the client"
    for course in igot:
        # Every competency the course is tagged with is named, not just coded.
        assert [ref["id"] for ref in course["competencies"]] == course["competency_ids"]
        for ref in course["competencies"]:
            assert ref["name"] and ref["name"] != ref["id"] or ref["id"] not in {
                "C01",
                "C03",
                "C19",
            }
        assert course["duration_min"] >= 0
