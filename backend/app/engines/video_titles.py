"""The name a video gives itself.

iGOT publishes many lessons under placeholder names: "Advanced Concepts in SQL"
calls its twelve videos `SQL2_Resource1..12`, which the ingest cleans up to
"Video 1..12". That is what the catalogue says, and it tells a learner nothing.

The video itself usually opens on a title card, and the transcript we already
hold starts with that card - "USER DEFINED FUNCTIONS (UDFs) - INTRODUCTION".
That is the name the course's own author gave the video, so it is recovered
here rather than invented, and only where the catalogue name is a placeholder.
A video that opens straight into speech keeps its catalogue name: a first
sentence is not a title.
"""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Lesson, LessonTranscript

# "Video 3", "Lesson 2", "SQL2_Resource1", "Part 4" - a number is not a name.
PLACEHOLDER = re.compile(
    r"^(?:video|lesson|resource|part|session|module|unit|clip)\s*[-_ ]?\d+\.?$"
    r"|^[a-z0-9]+_resource\s*\d+\.?$",
    re.I,
)

# A title card is short, has no sentence punctuation, and is not a sentence.
MAX_WORDS = 12
MAX_CHARS = 80
SENTENCE_END = re.compile(r"[.!?;:]\s*$")
LOWER_START = re.compile(r"^[a-z]")
# A caption track often opens on a timestamp or a sound cue, not a title.
NOISE = re.compile(r"^\d{1,2}:\d{2}|^\[")


def is_placeholder(title: str) -> bool:
    return not title.strip() or bool(PLACEHOLDER.match(title.strip()))


def title_from_transcript(text: str) -> str | None:
    """The opening title card, or None when the video opens on speech."""
    for raw in (text or "").splitlines():
        line = raw.strip(" \t-–—")
        if not line:
            continue
        # Only the first non-empty line can be the card.
        if SENTENCE_END.search(line) or LOWER_START.match(line) or NOISE.match(line):
            return None
        words = line.split()
        if not 1 < len(words) <= MAX_WORDS or len(line) > MAX_CHARS:
            return None
        letters = [c for c in line if c.isalpha()]
        if not letters:
            return None
        # A card is set in capitals or in title case; a spoken sentence is not.
        shouted = sum(c.isupper() for c in letters) / len(letters) > 0.7
        titled = all(w[0].isupper() or not w[0].isalpha() for w in words)
        if not (shouted or titled):
            return None
        return _readable(line) if shouted else line
    return None


# Words a title keeps in lower case, and short capitals that are acronyms.
SMALL = {"a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"}


def _readable(shouted: str) -> str:
    """"USER DEFINED FUNCTIONS (UDFs)" -> "User Defined Functions (UDFs)"."""
    words = []
    for index, word in enumerate(shouted.split()):
        core = word.strip("()[],:-")
        lowered = core.lower()
        if index and lowered in SMALL:
            # "AND", "OF", "THE" - short, but words, not acronyms.
            words.append(word.lower())
        elif core and (not core.isupper() or len(core) <= 3):
            # Left as the author set it: anything already mixed case ("UDFs"),
            # and any run of three capitals or fewer ("SQL", "GDP").
            words.append(word)
        else:
            words.append(word.lower().capitalize())
    return " ".join(words)


def recovered_titles(db: Session, course_identifier: str) -> dict[int, str]:
    """Lesson id -> the title card, for the lessons whose name is a placeholder."""
    rows = db.execute(
        select(Lesson.id, Lesson.title, LessonTranscript.text)
        .join(LessonTranscript, LessonTranscript.lesson_id == Lesson.id)
        .where(Lesson.course_identifier == course_identifier)
    ).all()

    found: dict[int, str] = {}
    for lesson_id, title, text in rows:
        if not is_placeholder(title):
            continue
        card = title_from_transcript(text)
        if card:
            found[lesson_id] = card
    return found
