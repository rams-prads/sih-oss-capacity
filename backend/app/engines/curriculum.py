"""Turning iGOT's hierarchy into sections that mean something.

iGOT wraps most videos in a unit of their own, named after the video it holds.
Ingested literally that produced 484 modules containing exactly one lesson, with
the section title repeating the lesson title directly beneath it. A section that
holds one item is not a section: it is a heading with nothing under it, and it
doubles the height of the outline while carrying no information.

Some courses do have real structure - 42 of the 174 have at least one unit
holding several videos - and that is left exactly as it is. The rest are what
they actually are: a flat run of videos, grouped into parts only so a course of
sixty-eight of them can be navigated and paced.
"""
from __future__ import annotations

import re

# Long enough that a section means something, short enough that a checkpoint
# after each one is not a slog.
SECTION_SIZE = 5

# Words iGOT uses when a unit was never given a name. Followed by a number they
# carry nothing the position does not already say: "Module 3", "SQL_Resource7".
GENERIC_WORDS = {"module", "video", "lesson", "unit", "part", "section", "resource", "item"}
SPLIT = re.compile(r"[^a-z0-9]+")
TRAILING_NUMBER = re.compile(r"^([a-z]+?)(\d+)$")


def _normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def is_placeholder(title: str) -> bool:
    """True when a title says only what its position already says.

    Written as a word test rather than one compound regex because the forms
    vary: "Module 3", "Video 12", "SQL_Resource7", "Untitled". An anchored
    regex missed the third, since the giveaway is at the end.
    """
    words = [w for w in SPLIT.split((title or "").lower()) if w]
    if not words:
        return True
    if words[0] == "untitled":
        return True

    # Split a run-together form so "resource7" is read as "resource" and "7".
    expanded: list[str] = []
    for word in words:
        match = TRAILING_NUMBER.match(word)
        if match:
            expanded.extend(match.groups())
        else:
            expanded.append(word)

    # A placeholder is generic words and numbers, and nothing else. "Module
    # design" survives because "design" is neither.
    meaningful = [w for w in expanded if not w.isdigit() and w not in GENERIC_WORDS]
    return not meaningful and any(w.isdigit() for w in expanded)


def has_real_structure(modules: list[dict]) -> bool:
    """True when at least one unit actually groups several videos."""
    return any(len(m.get("lessons") or []) > 1 for m in modules)


def _best_title(module: dict, lesson: dict) -> str:
    """The better of a single-video unit's two titles.

    Usually they are the same string. Where they differ, the informative one
    wins: a unit called "State Intervention" holding a video called "Video 4"
    should keep the words, not the number.
    """
    unit, video = (module.get("title") or "").strip(), (lesson.get("title") or "").strip()
    if is_placeholder(video) and not is_placeholder(unit):
        return unit
    return video or unit


def regroup(modules: list[dict], section_size: int = SECTION_SIZE) -> list[dict]:
    """Sections worth showing, from whatever the hierarchy gave us.

    Courses with genuine grouping are returned untouched. Everything else is
    flattened and cut into runs, titled by the videos they span, which is a
    factual label rather than a claim that somebody authored a module.
    """
    modules = [m for m in modules if m.get("lessons")]
    if not modules:
        return []
    if has_real_structure(modules):
        return modules

    lessons = []
    for module in modules:
        lesson = dict(module["lessons"][0])
        lesson["title"] = _best_title(module, lesson)
        lessons.append(lesson)

    if len(lessons) <= section_size:
        return [{"title": "Course videos", "lessons": lessons}]

    sections = []
    for start in range(0, len(lessons), section_size):
        chunk = lessons[start : start + section_size]
        first, last = start + 1, start + len(chunk)
        sections.append(
            {
                "title": f"Videos {first}\u2013{last}" if last > first else f"Video {first}",
                "lessons": chunk,
            }
        )
    return sections


def remap_module_index(old_index: int, section_size: int = SECTION_SIZE) -> int:
    """Where a question written for a one-video unit now belongs.

    Assessments generated per unit are keyed by its index. With one video per
    unit that index is also the video's position, so after regrouping it lands
    in the run that now contains it. Several old units collapsing into one
    section is expected, and their questions merge.
    """
    return old_index // section_size
