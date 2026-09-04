"""Generate module assessments from what the iGOT lesson videos actually say.

The problem statement asks for MCQs generated from learning material including
videos. iGOT ships no transcripts and its own question sets are behind a
Keycloak token (every questionset endpoint answers 401), so the only honest
route to a question about a video is the video itself.

Gemini accepts the mp4 directly, so this transcribes each lesson and writes
questions from that transcript. Nothing is invented: a distractor is another
step from the same lesson, and every explanation quotes what was said.

    python -m scripts.generate_video_quizzes --courses 3
    python -m scripts.generate_video_quizzes --courses 3 --dry-run

Output is committed seed data. That matters: the questions are generated once,
here, by whoever holds the key - and every other machine that clones the
repository gets them from the seed file with no key, no network and no cost.

Per module rather than per course, deliberately. Module assessments were not
defensible before: with only a title to go on, saying "you failed module 2 on
data quality" was a guess about what module 2 contained. A transcript removes
the guess.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import tempfile
import re
import sys
import time
from pathlib import Path

import httpx

from app.config import get_settings
from app.llm.base import GeneratedQuestion
from app.quiz.service import validate_question

SEED_PATH = Path(__file__).resolve().parents[1] / "seed" / "igot_courses_seed.json"
OUT_PATH = Path(__file__).resolve().parents[1] / "seed" / "igot_video_questions.json"

API = "https://generativelanguage.googleapis.com"
UPLOAD_URL = f"{API}/upload/v1beta/files"
INLINE_LIMIT = 18_000_000          # above this the File API is required
# iGOT video runs about 23 MB per minute, so a 10 minute lesson is a quarter of a
# gigabyte to pull down and push back up. Past this it is not worth the wait for a
# demo batch; the module simply uses its other lessons.
SIZE_LIMIT = 260_000_000
# Processing scales with file size. The first attempt polled for 90 seconds total
# and every large lesson silently returned nothing.
POLL_ATTEMPTS = 150
POLL_SECONDS = 5
QUESTIONS_PER_MODULE = 4
MAX_TRANSCRIPT_CHARS = 14_000

TRANSCRIBE = (
    "Transcribe the spoken audio of this lesson verbatim, including any text shown "
    "on slides. Output only the transcript."
)

QUESTION_PROMPT = """You are writing assessment items for officers of India's Official
Statistical System, based on one training lesson they have just watched.

Write exactly {n} multiple-choice questions using ONLY the transcript below.

Rules:
- Exactly 4 options, exactly one correct.
- Distractors must be plausible to someone who watched carelessly - prefer other
  points actually made in this lesson over invented ones.
- The explanation must say what the lesson stated, not general knowledge.
- Do not ask about anything the transcript does not cover.

Return JSON only: a list of objects with keys stem, options, answer_index,
explanation, difficulty (0.0-1.0).

TRANSCRIPT:
{transcript}"""


def _model() -> str:
    return get_settings().llm_model or "gemini-3.1-flash-lite"


def _generate_url() -> str:
    return f"{API}/v1beta/models/{_model()}:generateContent"


# Uploading tens of megabytes takes minutes, and httpx defaults to five seconds.
# Leaving these unset once killed a whole run on its first large lesson.
UPLOAD_TIMEOUT = httpx.Timeout(900.0, connect=60.0)


def download_to_disk(client: httpx.Client, url: str) -> tuple[Path | None, int]:
    """Stream a lesson to a temp file.

    Reading a 250 MB video into memory and then base64-encoding it needs the best
    part of a gigabyte, which is how a whole batch died with MemoryError. Nothing
    here holds more than a chunk.
    """
    handle, path_str = tempfile.mkstemp(suffix=".mp4")
    path = Path(path_str)
    size = 0
    try:
        with os.fdopen(handle, "wb") as sink:
            with client.stream("GET", url, timeout=600) as response:
                response.raise_for_status()
                for chunk in response.iter_bytes(1_048_576):
                    sink.write(chunk)
                    size += len(chunk)
        return path, size
    except Exception as exc:
        print(f"      download failed: {type(exc).__name__}", file=sys.stderr, flush=True)
        path.unlink(missing_ok=True)
        return None, 0


def upload_file(client: httpx.Client, key: str, path: Path, size: int, name: str) -> str | None:
    """Push a video through the resumable File API; returns its uri once ACTIVE.

    Returns None on any failure: one unreadable lesson must cost that lesson, not
    the run.
    """
    start = client.post(
        UPLOAD_URL,
        params={"key": key},
        headers={
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": str(size),
            "X-Goog-Upload-Header-Content-Type": "video/mp4",
            "Content-Type": "application/json",
        },
        json={"file": {"display_name": name[:100]}},
        timeout=UPLOAD_TIMEOUT,
    )
    session = start.headers.get("x-goog-upload-url")
    if start.status_code != 200 or not session:
        print(f"      upload start failed: HTTP {start.status_code}", file=sys.stderr)
        return None

    # Hand httpx the file object so it streams from disk instead of buffering.
    with path.open("rb") as source:
        done = client.post(
            session,
            headers={
                "Content-Length": str(size),
                "X-Goog-Upload-Offset": "0",
                "X-Goog-Upload-Command": "upload, finalize",
            },
            content=source,
            timeout=UPLOAD_TIMEOUT,
        )
    if done.status_code != 200:
        print(f"      upload finalize failed: HTTP {done.status_code}", file=sys.stderr)
        return None

    info = done.json().get("file", {})
    uri, state = info.get("uri"), info.get("state")
    # Large files are transcoded before they can be referenced.
    for attempt in range(POLL_ATTEMPTS):
        if state == "ACTIVE":
            return uri
        if state == "FAILED":
            print("      file processing FAILED", file=sys.stderr, flush=True)
            return None
        time.sleep(POLL_SECONDS)
        poll = client.get(
            f"{API}/v1beta/{info.get('name')}", params={"key": key}, timeout=120
        )
        state = poll.json().get("state") if poll.status_code == 200 else state
        if attempt and attempt % 12 == 0:
            print(f"      still {state} after {attempt * POLL_SECONDS}s", flush=True)
    print(f"      gave up waiting; last state {state}", file=sys.stderr, flush=True)
    return None


def transcribe(client: httpx.Client, key: str, url: str, title: str) -> str:
    """Transcript of one lesson, or "" if the video cannot be read."""
    path, size = download_to_disk(client, url)
    if path is None:
        return ""

    try:
        print(f"      {size/1_000_000:.0f} MB", flush=True)
        if size > SIZE_LIMIT:
            print("      too large for this batch, skipping", flush=True)
            return ""

        if size <= INLINE_LIMIT:
            part = {
                "inline_data": {
                    "mime_type": "video/mp4",
                    "data": base64.b64encode(path.read_bytes()).decode(),
                }
            }
        else:
            try:
                uri = upload_file(client, key, path, size, title)
            except Exception as exc:
                print(f"      upload failed: {type(exc).__name__}", file=sys.stderr, flush=True)
                return ""
            if not uri:
                return ""
            part = {"file_data": {"mime_type": "video/mp4", "file_uri": uri}}
    finally:
        path.unlink(missing_ok=True)

    # Print the status and the message. Swallowing them turned every failure into
    # an indistinguishable "no transcript", which hid a rate limit for two runs.
    for attempt in range(4):
        try:
            response = client.post(
                _generate_url(),
                headers={"x-goog-api-key": key},
                json={"contents": [{"parts": [part, {"text": TRANSCRIBE}]}]},
                timeout=900,
            )
        except Exception as exc:
            print(f"      transcribe error: {type(exc).__name__}", file=sys.stderr, flush=True)
            return ""

        if response.status_code == 200:
            payload = response.json()
            candidates = payload.get("candidates") or []
            if not candidates:
                print(f"      no candidates: {str(payload)[:160]}", file=sys.stderr, flush=True)
                return ""
            parts_out = candidates[0].get("content", {}).get("parts") or []
            return "".join(p.get("text", "") for p in parts_out).strip()

        message = ""
        try:
            message = response.json().get("error", {}).get("message", "")[:150]
        except Exception:
            message = response.text[:150]
        print(f"      HTTP {response.status_code}: {message}", file=sys.stderr, flush=True)

        # 429 is a quota pause and 5xx is transient; both are worth waiting out.
        if response.status_code in (429, 500, 503) and attempt < 3:
            wait = 30 * (attempt + 1)
            print(f"      waiting {wait}s and retrying", flush=True)
            time.sleep(wait)
            continue
        return ""
    return ""


def questions_from(client: httpx.Client, key: str, transcript: str) -> list[dict]:
    """Validated MCQs from a transcript. Anything malformed is dropped."""
    prompt = QUESTION_PROMPT.format(
        n=QUESTIONS_PER_MODULE, transcript=transcript[:MAX_TRANSCRIPT_CHARS]
    )
    try:
        response = client.post(
            _generate_url(),
            headers={"x-goog-api-key": key},
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=300,
        )
        response.raise_for_status()
        raw = "".join(
            p.get("text", "") for p in response.json()["candidates"][0]["content"]["parts"]
        )
    except Exception as exc:
        print(f"      generation failed: {type(exc).__name__}", file=sys.stderr)
        return []

    match = re.search(r"\[.*\]", raw, re.S)
    if not match:
        return []
    try:
        rows = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []

    kept = []
    for row in rows if isinstance(rows, list) else []:
        try:
            question = GeneratedQuestion.model_validate(row)
        except Exception:
            continue
        if validate_question(question):
            kept.append(question.model_dump())
    return kept


def pick_courses(catalogue: list[dict], wanted: int) -> list[dict]:
    """Courses worth spending API calls on: real video, sane module count."""
    candidates = [
        c
        for c in catalogue
        if c.get("source") == "igot"
        and c.get("modules")
        and 2 <= len(c["modules"]) <= 4
        and c.get("se_competencies")
    ]
    # Shortest first: the demo wants coverage, not the longest videos on iGOT.
    candidates.sort(
        key=lambda c: sum(l["duration_min"] for m in c["modules"] for l in m["lessons"])
    )
    return candidates[:wanted]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--courses", type=int, default=3, help="how many courses to do")
    parser.add_argument(
        "--only",
        default="",
        help=(
            "comma-separated course identifiers to do instead of picking by size. "
            "Use this to finish one officer's courses so a demo tells a whole story."
        ),
    )
    parser.add_argument(
        "--for-user",
        default="",
        help="do the courses this officer is enrolled in, in shortest-first order",
    )
    parser.add_argument("--dry-run", action="store_true", help="show the plan, call nothing")
    args = parser.parse_args()

    key = get_settings().gemini_api_key
    if not key and not args.dry_run:
        raise SystemExit("GEMINI_API_KEY is not set - put it in .env")

    catalogue = json.loads(SEED_PATH.read_text(encoding="utf-8"))["content"]

    wanted: set[str] = {c.strip() for c in args.only.split(",") if c.strip()}
    if args.for_user:
        # Assessing every course one officer holds is worth more for a demo than
        # the same effort spread thinly over unrelated courses.
        from sqlalchemy import select

        from app.db import SessionLocal
        from app.models import Enrolment

        with SessionLocal() as db:
            wanted |= {
                e.course_identifier
                for e in db.scalars(
                    select(Enrolment).where(Enrolment.user_id == args.for_user)
                ).all()
            }

    if wanted:
        by_id = {c["identifier"]: c for c in catalogue}
        chosen = [
            by_id[i]
            for i in wanted
            if i in by_id and by_id[i].get("modules")
        ]
        chosen.sort(
            key=lambda c: sum(l["duration_min"] for m in c["modules"] for l in m["lessons"])
        )
        missing = [i for i in wanted if i not in by_id or not by_id[i].get("modules")]
        for identifier in missing:
            print(f"  (no playable video for {identifier}, skipping)")
    else:
        chosen = pick_courses(catalogue, args.courses)
    if not chosen:
        raise SystemExit("no suitable courses in the catalogue")

    print(f"model: {_model()}")
    for course in chosen:
        minutes = sum(l["duration_min"] for m in course["modules"] for l in m["lessons"])
        print(f"  {course['name'][:56]:56} {len(course['modules'])} modules, {minutes} min")
    if args.dry_run:
        print("\n--dry-run: nothing called, nothing written.")
        return

    existing = (
        json.loads(OUT_PATH.read_text(encoding="utf-8")) if OUT_PATH.exists() else {}
    )
    generated = existing.get("courses", {})

    with httpx.Client() as client:
        for course in chosen:
            print(f"\n=== {course['name'][:64]}")
            modules_out = []
            for index, module in enumerate(course["modules"]):
                transcripts = []
                for lesson in module["lessons"]:
                    print(
                        f"    transcribing: {lesson['title'][:48]} "
                        f"({lesson['duration_min']} min)",
                        flush=True,
                    )
                    try:
                        text = transcribe(client, key, lesson["url"], lesson["title"])
                    except Exception as exc:
                        print(f"      skipped: {type(exc).__name__}", file=sys.stderr)
                        text = ""
                    if text:
                        transcripts.append(text)
                if not transcripts:
                    print("    no transcript for this module, skipping")
                    continue

                questions = questions_from(client, key, "\n\n".join(transcripts))
                print(f"    module {index + 1}: {len(questions)} valid questions", flush=True)
                if questions:
                    modules_out.append(
                        {
                            "module_index": index,
                            "title": module["title"],
                            "competency_id": course["se_competencies"][0],
                            "questions": questions,
                        }
                    )

            if modules_out:
                generated[course["identifier"]] = {
                    "course_name": course["name"],
                    "modules": modules_out,
                }

    payload = {
        "_comment": (
            "Module assessments generated from the iGOT lesson videos themselves by "
            "scripts/generate_video_quizzes.py: each video was transcribed and the "
            "questions written from that transcript, then put through the same "
            "validity gate as any other generated item. Committed so the app runs "
            "these assessments with no API key, no network and no cost - the key is "
            "only needed to regenerate."
        ),
        "courses": generated,
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    modules = sum(len(c["modules"]) for c in generated.values())
    questions = sum(len(m["questions"]) for c in generated.values() for m in c["modules"])
    print(f"\nWrote {OUT_PATH}")
    print(f"  {len(generated)} courses, {modules} module assessments, {questions} questions")


if __name__ == "__main__":
    main()
