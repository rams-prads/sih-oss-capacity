"""Write in-video retrieval prompts from the lesson transcripts.

A pool of short questions per passage of each lesson, anchored to the moment in
the video that passage was spoken. The learner meets one or two of them mid
lecture, ungraded, in the way a MOOC platform interrupts a video to ask what was
just said.

    python -m scripts.generate_video_prompts --user u-jso-anita --dry-run
    python -m scripts.generate_video_prompts --user u-jso-anita

Embeddings do two jobs here that string matching cannot. Asked for four
questions about one passage a model will write the same question twice in
different words, so each candidate is embedded and the near-duplicates dropped.
The survivors keep their vectors, so the serving side can pick a spread across
the pool and ask about something different on a second viewing.

Output is committed seed data: generated once by whoever holds the key, then
free for everyone who clones the repository.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.engines.embeddings import embed_texts  # noqa: E402
from app.engines.video_prompts import (  # noqa: E402
    POOL_PER_SEGMENT,
    deduplicate,
    plan_segments,
)
from app.quiz.service import validate_question  # noqa: E402
from app.llm.base import GeneratedQuestion  # noqa: E402
from scripts.generate_video_quizzes import _generate_url, _model  # noqa: E402

TRANSCRIPTS = Path(__file__).resolve().parents[1] / "seed" / "igot_transcripts.json"
OUT_PATH = Path(__file__).resolve().parents[1] / "seed" / "igot_video_prompts.json"

PROMPT = """A trainee officer has just watched this part of a lesson video. Write {n}
short questions checking they followed what was said.

Rules:
- Use ONLY the passage below. Do not ask about anything it does not state.
- Exactly 4 options, exactly one correct.
- Ask about {n} DIFFERENT points in the passage, not the same point reworded.
- Distractors should be things a half-listening learner might believe, ideally
  other points from this same passage.
- Keep the stem to one sentence: this interrupts a video.
- Never write "according to the text", "in the passage" or "the transcript".
  The learner is watching a lecture, not reading; refer to the lesson or to
  nothing at all.
- "quote" must be the words from the passage that answer it, verbatim.

Return JSON only: a list of objects with keys stem, options, answer_index,
explanation, quote, difficulty (0.0-1.0).

PASSAGE:
{passage}"""


def ask_model(client: httpx.Client, key: str, passage: str, n: int) -> list[dict]:
    """Candidate questions for one passage. Anything malformed is dropped."""
    body = {"contents": [{"parts": [{"text": PROMPT.format(n=n, passage=passage)}]}]}
    for attempt in range(4):
        try:
            response = client.post(
                _generate_url(), headers={"x-goog-api-key": key}, json=body, timeout=180
            )
            if response.status_code in (429, 500, 503):
                wait = 20 * (attempt + 1)
                print(f"      {response.status_code}, waiting {wait}s", flush=True)
                time.sleep(wait)
                continue
            response.raise_for_status()
            parts = response.json()["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts)
            return parse(text)
        except httpx.HTTPError as exc:
            print(f"      {type(exc).__name__}", file=sys.stderr, flush=True)
            if attempt == 3:
                return []
            time.sleep(20 * (attempt + 1))
    return []


def parse(raw: str) -> list[dict]:
    """Tolerant JSON parse, then the same quality gate the quiz service uses."""
    import re

    cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    match = re.search(r"\[.*\]", cleaned, flags=re.DOTALL)
    if not match:
        return []
    try:
        rows = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []

    good = []
    for row in rows if isinstance(rows, list) else []:
        try:
            question = GeneratedQuestion.model_validate(
                {k: v for k, v in row.items() if k != "quote"}
            )
        except Exception:
            continue
        if not validate_question(question):
            continue
        good.append(
            {
                "stem": question.stem,
                "options": question.options,
                "answer_index": question.answer_index,
                "explanation": question.explanation,
                "quote": str(row.get("quote", ""))[:400],
                "difficulty": question.difficulty,
            }
        )
    return good


def _write(store: dict) -> None:
    store["_comment"] = (
        "In-video retrieval prompts, generated from the lesson transcripts. A pool "
        "per passage of each lesson, anchored to the moment in the video that "
        "passage was spoken. Near-duplicate questions were removed by comparing "
        "their embeddings, and the surviving vectors are kept so the serving side "
        "can ask about something different on a repeat viewing. Ungraded: these "
        "never feed the competency estimate. Regenerate with "
        "scripts/generate_video_prompts.py."
    )
    OUT_PATH.write_text(
        json.dumps(store, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user", help="Lessons in the courses recommended to this officer")
    parser.add_argument("--course", action="append", default=[])
    parser.add_argument("--limit", type=int, default=0, help="Stop after N lessons")
    parser.add_argument("--pool", type=int, default=POOL_PER_SEGMENT)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not TRANSCRIPTS.is_file():
        sys.exit("No transcripts yet. Run scripts/transcribe_lessons.py first.")
    transcripts = json.loads(TRANSCRIPTS.read_text(encoding="utf-8"))["lessons"]

    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Lesson

    with SessionLocal() as db:
        durations = {
            lesson.id: lesson.duration_min
            for lesson in db.scalars(select(Lesson)).all()
        }

    # Scope by course. Resolving a user's recommendations needs the database, so
    # only that path opens one.
    if args.user:
        from app.engines.gap import compute_gaps
        from app.engines.recommend import recommend_courses
        from app.integration.mock import MockKarmayogiClient

        with SessionLocal() as db:
            report = compute_gaps(db, args.user)
            wanted = {
                r.course.identifier
                for r in recommend_courses(MockKarmayogiClient(), report.items, limit=10)
            }
        scope = f"courses recommended to {args.user}"
    elif args.course:
        wanted = set(args.course)
        scope = ", ".join(args.course)
    else:
        wanted = None
        scope = "every transcribed lesson"

    store = json.loads(OUT_PATH.read_text(encoding="utf-8")) if OUT_PATH.is_file() else {}
    store.setdefault("lessons", {})

    todo = [
        (key, entry)
        for key, entry in transcripts.items()
        if (wanted is None or entry["course_identifier"] in wanted)
        and key not in store["lessons"]
    ]
    if args.limit:
        todo = todo[: args.limit]

    print(scope)
    print(f"  {len(transcripts)} transcripts, {len(store['lessons'])} already done, {len(todo)} to do")

    if args.dry_run:
        for key, entry in todo:
            chunks = [(c["position"], c["text"]) for c in entry.get("chunks", [])]
            minutes = durations.get(entry["lesson_id"], 0)
            segments = plan_segments(chunks, minutes)
            stamps = [f"{s.timestamp_seconds//60}:{s.timestamp_seconds%60:02d}" for s in segments]
            print(
                f"    {entry['lesson_title'][:40]:40} {minutes:2}min "
                f"{len(segments)} prompt(s) at {stamps}"
            )
        return

    if not todo:
        print("  nothing to do")
        return

    key = get_settings().gemini_api_key
    if not key:
        sys.exit("GEMINI_API_KEY is required")

    with httpx.Client() as client:
        for n, (lesson_key, entry) in enumerate(todo, 1):
            title = entry["lesson_title"]
            print(f"  [{n}/{len(todo)}] {title}", flush=True)

            chunks = [(c["position"], c["text"]) for c in entry.get("chunks", [])]
            segments = plan_segments(chunks, durations.get(entry["lesson_id"], 0))
            if not segments:
                print("      no transcript chunks, skipping", flush=True)
                continue

            prompts = []
            for segment in segments:
                candidates = ask_model(client, key, segment.text, args.pool)
                if not candidates:
                    print(f"      segment {segment.index}: none generated", flush=True)
                    continue

                # Embed the stems and drop questions that restate one already kept.
                # A refused embedding must not lose the lesson's other segments:
                # keep the candidates unembedded, which costs de-duplication and
                # variety for this segment only, and say so.
                try:
                    vectors = embed_texts(
                        [c["stem"] for c in candidates], task_type="SEMANTIC_SIMILARITY"
                    )
                except Exception as exc:
                    print(
                        f"      embedding refused ({type(exc).__name__}); keeping all "
                        "candidates for this segment, rerun to de-duplicate",
                        file=sys.stderr,
                        flush=True,
                    )
                    vectors = [[] for _ in candidates]
                keep = deduplicate(list(zip([c["stem"] for c in candidates], vectors)))
                dropped = len(candidates) - len(keep)

                for index in keep:
                    prompts.append(
                        {
                            **candidates[index],
                            "segment_index": segment.index,
                            "position_pct": segment.position_pct,
                            "timestamp_seconds": segment.timestamp_seconds,
                            "embedding": vectors[index],
                        }
                    )
                stamp = f"{segment.timestamp_seconds//60}:{segment.timestamp_seconds%60:02d}"
                print(
                    f"      {stamp}  {len(keep)} kept, {dropped} duplicate(s) dropped",
                    flush=True,
                )

            store["lessons"][lesson_key] = {
                "lesson_id": entry["lesson_id"],
                "course_identifier": entry["course_identifier"],
                "lesson_title": title,
                "prompts": prompts,
            }
            _write(store)

    total = sum(len(v["prompts"]) for v in store["lessons"].values())
    print(f"\n{len(store['lessons'])} lessons, {total} prompts written to {OUT_PATH.name}")


if __name__ == "__main__":
    main()
