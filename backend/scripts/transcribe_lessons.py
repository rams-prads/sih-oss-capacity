"""Transcribe iGOT lesson videos and keep the transcript.

generate_video_quizzes.py already sends a lesson to Gemini and writes questions
from what it hears, but it throws the transcript away afterwards. That was the
expensive half: the video is a quarter of a gigabyte, the transcription costs a
key and several minutes, and the result is the only text that exists for these
lessons anywhere - iGOT publishes none.

So this keeps it. Once a lesson is transcribed it can be embedded for retrieval,
quoted by the tutor, and used to write new assessments later without touching
the video again.

    python -m scripts.transcribe_lessons --user u-jso-anita --dry-run
    python -m scripts.transcribe_lessons --user u-jso-anita
    python -m scripts.transcribe_lessons --course do_11391537250983936014 --embed

Output is committed seed data, so everyone who clones the repository gets the
transcripts with no key, no network and no cost. Only whoever regenerates them
needs a key.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.engines.embeddings import (  # noqa: E402
    DIMENSIONS,
    chunk_transcript,
    embed_texts,
    embedding_model,
)
from app.engines.gap import compute_gaps  # noqa: E402
from app.engines.recommend import recommend_courses  # noqa: E402
from app.integration.mock import MockKarmayogiClient  # noqa: E402
from app.models import Lesson  # noqa: E402
from scripts.generate_video_quizzes import _model, transcribe  # noqa: E402

from sqlalchemy import select  # noqa: E402

OUT_PATH = Path(__file__).resolve().parents[1] / "seed" / "igot_transcripts.json"

# Batched so one oversized request cannot fail a whole lesson's embeddings.
EMBED_BATCH = 32


def load_existing() -> dict:
    if OUT_PATH.is_file():
        return json.loads(OUT_PATH.read_text(encoding="utf-8"))
    return {"_comment": "", "lessons": {}}


def lessons_for_user(db, user_id: str) -> list[Lesson]:
    """Every video in the courses currently recommended to this officer."""
    report = compute_gaps(db, user_id)
    recommendations = recommend_courses(MockKarmayogiClient(), report.items, limit=10)
    identifiers = [r.course.identifier for r in recommendations]
    if not identifiers:
        return []
    return list(
        db.scalars(
            select(Lesson)
            .where(Lesson.course_identifier.in_(identifiers))
            .order_by(Lesson.course_identifier, Lesson.position)
        ).all()
    )


def lessons_for_courses(db, identifiers: list[str]) -> list[Lesson]:
    return list(
        db.scalars(
            select(Lesson)
            .where(Lesson.course_identifier.in_(identifiers))
            .order_by(Lesson.course_identifier, Lesson.position)
        ).all()
    )


def build_embeddings(store: dict, only: set[str] | None = None) -> int:
    """Chunk and embed every transcript that does not have vectors yet."""
    pending: list[tuple[str, int, str]] = []
    for key, entry in store["lessons"].items():
        if only is not None and key not in only:
            continue
        if entry.get("chunks") and entry["chunks"][0].get("embedding"):
            continue
        pieces = chunk_transcript(entry["text"])
        entry["chunks"] = [{"position": i, "text": t} for i, t in enumerate(pieces)]
        for i, text in enumerate(pieces):
            pending.append((key, i, text))

    if not pending:
        return 0

    print(f"  embedding {len(pending)} chunks with {embedding_model()}", flush=True)
    done = 0
    for start in range(0, len(pending), EMBED_BATCH):
        batch = pending[start : start + EMBED_BATCH]
        vectors = embed_texts([text for _k, _i, text in batch])
        for (key, index, _text), vector in zip(batch, vectors):
            chunk = store["lessons"][key]["chunks"][index]
            chunk["embedding"] = vector
            chunk["embedding_model"] = embedding_model()
            chunk["dimensions"] = DIMENSIONS
        done += len(batch)
        print(f"    {done}/{len(pending)}", flush=True)
    return done


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user", help="Transcribe the courses recommended to this officer")
    parser.add_argument("--course", action="append", default=[], help="Course identifier")
    parser.add_argument("--limit", type=int, default=0, help="Stop after N lessons")
    parser.add_argument("--embed", action="store_true", help="Also build embeddings")
    parser.add_argument(
        "--embed-only",
        action="store_true",
        help="Skip transcription and embed what is already stored",
    )
    parser.add_argument("--dry-run", action="store_true", help="List the work, do nothing")
    args = parser.parse_args()

    store = load_existing()
    store.setdefault("lessons", {})

    if args.embed_only:
        if not get_settings().gemini_api_key:
            sys.exit("GEMINI_API_KEY is required to build embeddings")
        count = build_embeddings(store)
        _write(store)
        print(f"embedded {count} chunks")
        return

    with SessionLocal() as db:
        if args.user:
            lessons = lessons_for_user(db, args.user)
            scope = f"courses recommended to {args.user}"
        elif args.course:
            lessons = lessons_for_courses(db, args.course)
            scope = ", ".join(args.course)
        else:
            sys.exit("Give --user or --course")

        playable = [lesson for lesson in lessons if lesson.video_url]
        todo = [
            lesson
            for lesson in playable
            if str(lesson.id) not in store["lessons"]
        ]
        if args.limit:
            todo = todo[: args.limit]

        print(f"{scope}")
        print(f"  {len(lessons)} lessons, {len(playable)} with a video URL")
        print(f"  {len(playable) - len(todo)} already transcribed, {len(todo)} to do")

        if args.dry_run:
            for lesson in todo:
                print(f"    [{lesson.course_identifier}] {lesson.position:2} {lesson.title}")
            return
        if not todo:
            print("  nothing to transcribe")
        else:
            key = get_settings().gemini_api_key
            if not key:
                sys.exit("GEMINI_API_KEY is required to transcribe")

            with httpx.Client(follow_redirects=True) as client:
                for n, lesson in enumerate(todo, 1):
                    label = f"{lesson.course_identifier} #{lesson.position} {lesson.title}"
                    print(f"  [{n}/{len(todo)}] {label}", flush=True)
                    text = transcribe(client, key, lesson.video_url, lesson.title)
                    if not text.strip():
                        print("      no transcript, skipping", flush=True)
                        continue
                    store["lessons"][str(lesson.id)] = {
                        "lesson_id": lesson.id,
                        "course_identifier": lesson.course_identifier,
                        "lesson_title": lesson.title,
                        "video_url": lesson.video_url,
                        "text": text.strip(),
                        "char_count": len(text.strip()),
                        "source": "gemini-video",
                        "model": _model(),
                        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                        "chunks": [],
                    }
                    print(f"      {len(text.strip()):,} characters", flush=True)
                    # Written after every lesson: a run can take an hour, and
                    # losing all of it to one failure at the end is unacceptable.
                    _write(store)

    if args.embed:
        build_embeddings(store)
        _write(store)

    totals = store["lessons"].values()
    embedded = sum(
        1 for e in totals if e.get("chunks") and e["chunks"][0].get("embedding")
    )
    print(
        f"\n{len(store['lessons'])} transcripts stored "
        f"({sum(e['char_count'] for e in totals):,} characters), "
        f"{embedded} embedded"
    )
    print(f"written to {OUT_PATH.relative_to(Path.cwd()) if OUT_PATH.is_relative_to(Path.cwd()) else OUT_PATH}")


def _write(store: dict) -> None:
    store["_comment"] = (
        "Transcripts of iGOT lesson videos, produced once with Gemini from the "
        "video itself because iGOT publishes none. Committed so that cloning the "
        "repository gets the text with no key, no network and no cost. Chunk "
        "embeddings are stored alongside for retrieval. Regenerate with "
        "scripts/transcribe_lessons.py."
    )
    OUT_PATH.write_text(
        json.dumps(store, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
