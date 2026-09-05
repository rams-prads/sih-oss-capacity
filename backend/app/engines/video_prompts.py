"""Planning, de-duplicating and varying in-video retrieval prompts.

Three problems have to be solved before a question can be shown mid-lecture.

WHERE it goes. The transcripts carry no timings, so a passage's position in the
text is mapped onto the lesson's duration. Speech rate is roughly constant, so a
passage 40% of the way through the transcript is about 40% of the way through the
video. It is an estimate, and it only has to be good enough to pause near the
thing being asked about.

WHICH questions survive. A model asked for six questions about one passage will
write the same question three times in different words. Embedding each question
and dropping the ones that sit too close to an accepted one removes that, which
string comparison cannot: "What does a UDF return?" and "What is the output of a
user defined function?" share almost no words.

WHICH are served this time. The learner should not meet the same question twice.
Prompts are generated as a pool per segment and selected for spread in embedding
space, so a second viewing asks about different parts of what was said.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from app.engines.embeddings import cosine

# Two questions above this cosine are the same question. Measured on generated
# pools: genuine paraphrases sat at 0.93-0.97, while questions about different
# points in the same passage sat below 0.85.
DUPLICATE_THRESHOLD = 0.90

# One pause roughly every four minutes. Coursera-style in-video questions are
# frequent and short; a fifteen minute lesson gets three, a three minute lesson
# gets one.
MINUTES_PER_PROMPT = 4
MAX_PROMPTS_PER_LESSON = 4
POOL_PER_SEGMENT = 4

# The last segment ends at the last word, which maps to the last second of the
# video - where a prompt is useless because playback has already stopped. Pull
# every prompt back to at most this fraction of the runtime.
LATEST_POSITION = 0.92


@dataclass
class Segment:
    """A stretch of transcript, and the moment in the video it belongs to."""

    index: int
    text: str
    chunk_ids: list[int] = field(default_factory=list)
    position_pct: float = 0.0
    timestamp_seconds: int = 0


def plan_segments(
    chunks: list[tuple[int, str]],
    duration_min: int,
    minutes_per_prompt: int = MINUTES_PER_PROMPT,
    max_segments: int = MAX_PROMPTS_PER_LESSON,
) -> list[Segment]:
    """Split a lesson's transcript into the passages that earn a pause.

    `chunks` are (chunk_id, text) in transcript order. Each returned segment is
    the material a learner has just watched when the prompt appears, so the
    question is answerable from what they have seen rather than what is coming.
    """
    if not chunks:
        return []

    wanted = max(1, min(max_segments, round((duration_min or 1) / minutes_per_prompt)))
    wanted = min(wanted, len(chunks))
    per_segment = math.ceil(len(chunks) / wanted)

    total_chars = sum(len(text) for _cid, text in chunks) or 1
    duration_seconds = max(1, (duration_min or 1) * 60)

    segments: list[Segment] = []
    consumed = 0
    for index in range(wanted):
        group = chunks[index * per_segment : (index + 1) * per_segment]
        if not group:
            break
        consumed += sum(len(text) for _cid, text in group)
        # The prompt appears at the END of the passage it asks about, but never
        # so late that the video has finished playing.
        position = min(consumed / total_chars, LATEST_POSITION)
        segments.append(
            Segment(
                index=index,
                text=" ".join(text for _cid, text in group),
                chunk_ids=[cid for cid, _text in group],
                position_pct=round(100 * position, 1),
                timestamp_seconds=int(duration_seconds * position),
            )
        )
    return segments


def deduplicate(
    candidates: list[tuple[str, list[float]]],
    threshold: float = DUPLICATE_THRESHOLD,
) -> list[int]:
    """Indices of the candidates worth keeping.

    Greedy: walk the list, keep a candidate only if it is far enough from every
    candidate already kept. Order is preserved, so the first phrasing of an idea
    wins and later restatements of it are dropped.
    """
    kept: list[int] = []
    for index, (_text, vector) in enumerate(candidates):
        if not vector:
            kept.append(index)
            continue
        if all(
            cosine(vector, candidates[other][1]) < threshold
            for other in kept
            if candidates[other][1]
        ):
            kept.append(index)
    return kept


def select_varied(
    pool: list[tuple[int, list[float]]],
    count: int,
    seen_vectors: list[list[float]] | None = None,
) -> list[int]:
    """Choose `count` prompts from a pool, as spread out as possible.

    Greedy max-min: repeatedly take whichever remaining prompt is furthest from
    everything already chosen, and from anything this learner has already been
    asked. Taking the first N instead would ask about the same corner of the
    passage every time.
    """
    if count <= 0 or not pool:
        return []

    chosen: list[int] = []
    chosen_vectors: list[list[float]] = list(seen_vectors or [])
    remaining = list(range(len(pool)))

    while remaining and len(chosen) < count:
        if not chosen_vectors:
            pick = remaining[0]
        else:
            def closest(i: int) -> float:
                vector = pool[i][1]
                if not vector:
                    return -1.0
                return max(
                    (cosine(vector, other) for other in chosen_vectors if other),
                    default=-1.0,
                )

            # Furthest from everything seen so far is the least similar maximum.
            pick = min(remaining, key=closest)

        chosen.append(pool[pick][0])
        if pool[pick][1]:
            chosen_vectors.append(pool[pick][1])
        remaining.remove(pick)

    return chosen


# --- where the answer was actually taught ----------------------------------
# "Rewatch this part" originally rewound a fixed sixty seconds from where the
# question appeared. That is arbitrary, and it was actively misleading here:
# distractors are deliberately drawn from the same passage, so a blind rewind
# often landed on the material behind a WRONG option and appeared to teach it.
#
# Every prompt carries the verbatim line that answers it, so we can find where
# that line falls in the transcript and map it onto the runtime the same way the
# prompt's own position is estimated.
REWATCH_LEAD_IN_SECONDS = 8

# A quote has to be long enough to identify one moment. "movie" appears within
# the first three seconds of a lesson that says it forty times, and seeking
# there is worse than not trying: the learner is dropped somewhere unrelated and
# told it is the answer.
MIN_LOCATABLE_QUOTE = 30


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip().lower()


def locate_quote(transcript: str, quote: str) -> float | None:
    """Where in the transcript this line falls, as a fraction from 0 to 1.

    Returns None unless the line is long enough to be distinctive and occurs
    exactly once, so the caller falls back rather than seeking somewhere
    confidently wrong.
    """
    haystack = _normalise(transcript)
    needle = _normalise(quote)
    if not haystack or len(needle) < MIN_LOCATABLE_QUOTE:
        return None

    occurrences = haystack.count(needle)
    if occurrences == 1:
        return haystack.find(needle) / len(haystack)
    if occurrences > 1:
        # Said more than once; we cannot tell which time was meant.
        return None

    # A model sometimes tidies the tail of a quote. The opening is enough,
    # provided it is still distinctive and unique.
    head = needle[:MIN_LOCATABLE_QUOTE]
    if haystack.count(head) == 1:
        return haystack.find(head) / len(haystack)
    return None


def answer_timestamp(
    transcript: str,
    quote: str,
    duration_min: int,
    prompt_timestamp: int,
    segment_start_seconds: int | None = None,
    lead_in: int = REWATCH_LEAD_IN_SECONDS,
) -> int:
    """The second to seek to so the answer is explained just after landing.

    When the quote cannot be placed, fall back to the start of the passage the
    question was drawn from - still the right part of the lesson, just less
    precisely. A fixed rewind is the last resort.
    """
    duration_seconds = max(1, (duration_min or 1) * 60)
    ceiling = max(0, prompt_timestamp - 1)

    position = locate_quote(transcript, quote)
    if position is not None:
        at = int(duration_seconds * position) - lead_in
        # Never past the question: the answer was spoken before it was asked.
        return max(0, min(at, ceiling))

    if segment_start_seconds is not None:
        return max(0, min(segment_start_seconds, ceiling))
    return max(0, min(prompt_timestamp - 30, ceiling))
