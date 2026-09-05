"""Turning iGOT's hierarchy into sections that mean something.

iGOT wraps most videos in a unit of their own, named after the video it holds.
Taken literally that produced 484 sections containing exactly one lesson, each
with a heading repeating the line directly beneath it.
"""
from app.engines.curriculum import (
    SECTION_SIZE,
    has_real_structure,
    is_placeholder,
    regroup,
    remap_module_index,
)


def video(title: str) -> dict:
    return {"title": title, "url": "u", "duration_min": 5}


def wrapped(*titles: str) -> list[dict]:
    """iGOT's usual shape: one unit per video, named after the video."""
    return [{"title": t, "lessons": [video(t)]} for t in titles]


class TestDetectingRealStructure:
    def test_a_unit_holding_several_videos_is_real(self):
        assert has_real_structure([{"title": "Intro", "lessons": [video("a"), video("b")]}])

    def test_one_video_per_unit_is_not(self):
        assert not has_real_structure(wrapped("a", "b", "c"))

    def test_a_single_real_unit_is_enough_to_keep_the_whole_course(self):
        modules = wrapped("a", "b") + [{"title": "Part", "lessons": [video("c"), video("d")]}]
        assert has_real_structure(modules)


class TestPlaceholderTitles:
    def test_recognises_generated_names(self):
        for title in ("Module 3", "Video 12", "Lesson 1", "Unit 2", "Resource 7", "Untitled", "2"):
            assert is_placeholder(title), title

    def test_a_title_carrying_any_real_word_is_kept(self):
        """SQL_Resource7 keeps "SQL". Without the course name there is no way to
        know that prefix is redundant, and guessing wrong discards a real
        title. Keeping it costs nothing: the video's own name is used anyway."""
        assert not is_placeholder("SQL_Resource7")

    def test_leaves_real_names_alone(self):
        for title in ("State Intervention", "Introduction", "Pattern and Process", "Module design"):
            assert not is_placeholder(title), title

    def test_empty_counts_as_placeholder(self):
        assert is_placeholder("")
        assert is_placeholder("   ")


class TestRegrouping:
    def test_a_course_with_real_grouping_is_untouched(self):
        modules = [
            {"title": "Introduction", "lessons": [video("a"), video("b")]},
            {"title": "Practice", "lessons": [video("c")]},
        ]
        assert regroup(modules) == modules

    def test_one_video_per_unit_collapses_into_runs(self):
        sections = regroup(wrapped(*[f"v{i}" for i in range(12)]))
        assert [len(s["lessons"]) for s in sections] == [5, 5, 2]

    def test_a_short_course_becomes_one_section(self):
        sections = regroup(wrapped("a", "b", "c"))
        assert len(sections) == 1
        assert sections[0]["title"] == "Course videos"
        assert len(sections[0]["lessons"]) == 3

    def test_no_lesson_is_lost_or_duplicated(self):
        titles = [f"v{i}" for i in range(23)]
        sections = regroup(wrapped(*titles))
        flattened = [l["title"] for s in sections for l in s["lessons"]]
        assert flattened == titles

    def test_sections_are_labelled_by_the_videos_they_span(self):
        sections = regroup(wrapped(*[f"v{i}" for i in range(12)]))
        assert sections[0]["title"] == "Videos 1\u20135"
        assert sections[1]["title"] == "Videos 6\u201310"
        assert sections[2]["title"] == "Videos 11\u201312"

    def test_a_real_unit_name_survives_a_placeholder_video_title(self):
        """"State Intervention" holding "Video 4" should keep the words."""
        modules = [
            {"title": "State Intervention", "lessons": [video("Video 4")]},
            {"title": "Significance", "lessons": [video("Video 5")]},
        ]
        titles = [l["title"] for s in regroup(modules) for l in s["lessons"]]
        assert titles == ["State Intervention", "Significance"]

    def test_the_video_title_wins_when_both_are_real(self):
        modules = [{"title": "Unit one", "lessons": [video("Sampling frames")]}]
        assert regroup(modules)[0]["lessons"][0]["title"] == "Sampling frames"

    def test_empty_units_are_dropped(self):
        assert regroup([{"title": "Empty", "lessons": []}]) == []
        assert regroup([]) == []

    def test_a_single_video_course_is_left_as_one_section(self):
        sections = regroup(wrapped("only"))
        assert len(sections) == 1
        assert len(sections[0]["lessons"]) == 1


class TestMovingAssessments:
    def test_a_question_follows_its_video_into_the_new_section(self):
        # With one video per unit the unit index is also the video's position.
        assert remap_module_index(0) == 0
        assert remap_module_index(4) == 0
        assert remap_module_index(5) == 1
        assert remap_module_index(11) == 2

    def test_units_collapsing_together_share_a_section(self):
        assert remap_module_index(1) == remap_module_index(3)

    def test_it_agrees_with_the_section_size_used_to_regroup(self):
        sections = regroup(wrapped(*[f"v{i}" for i in range(20)]))
        for old in range(20):
            assert remap_module_index(old) < len(sections)
        assert SECTION_SIZE == 5


class TestAgainstTheSeededCatalogue:
    def test_no_invented_single_video_section_survives(self, db):
        """Every remaining one-video section is either a course with a single
        video, or a course iGOT genuinely grouped that way."""
        from collections import defaultdict

        from sqlalchemy import select

        from app.models import Lesson

        by_course: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
        for lesson in db.scalars(select(Lesson)).all():
            by_course[lesson.course_identifier][lesson.module_index] += 1

        for course, sections in by_course.items():
            singles = [n for n in sections.values() if n == 1]
            if not singles:
                continue
            total = sum(sections.values())
            genuine = any(n > 1 for n in sections.values())
            assert genuine or total == 1, (
                f"{course} has {len(singles)} one-video sections with no real grouping"
            )
