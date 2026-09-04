"""Chunking, embedding and retrieval over lesson transcripts.

A transcript is only useful to the rest of the system if a question can find the
passage that answers it. That means three things: cutting the text where an idea
ends rather than every N characters, turning each passage into a vector, and
ranking passages by similarity to a query.

Vectors live in a JSON column so the demo runs on SQLite with nothing installed.
That is a deliberate ceiling: cosine similarity over every chunk is linear, which
is fine for the few hundred chunks a demo holds and wrong for a national
deployment. Moving to pgvector changes this module and nothing above it.
"""
from __future__ import annotations

import math
import re
import time
from dataclasses import dataclass

import httpx

from app.config import get_settings

API = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"

# 768 rather than the model's full width: Matryoshka training means the leading
# dimensions carry most of the signal, and a quarter of the storage matters when
# every vector sits in a JSON column.
DIMENSIONS = 768

CHUNK_CHARS = 1200
CHUNK_OVERLAP = 150

# Gemini embeddings sit on a high similarity floor: any two pieces of English
# score around 0.45-0.50 whatever they are about, so a naive threshold like 0.35
# retrieves SQL passages for a question about baking bread. Measured against the
# stored transcripts, on-topic queries scored 0.708-0.748 and deliberately
# off-topic ones 0.456-0.515, so 0.60 sits clear of both with margin either side.
# Re-measure this if the embedding model changes; it is a property of the model,
# not a universal constant.
MIN_RELEVANCE = 0.60


def embedding_model() -> str:
    settings = get_settings()
    return getattr(settings, "embedding_model", "") or DEFAULT_EMBEDDING_MODEL


def chunk_transcript(text: str, size: int = CHUNK_CHARS, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split a transcript into passages, cutting only at sentence boundaries.

    Both the split and the overlap work in whole sentences. Carrying a character
    tail forward instead is what an earlier version did, and it started every
    chunk after the first in the middle of a word: a fragment embeds as a
    fragment, and reads as one when quoted back to a learner.
    """
    clean = re.sub(r"\s+", " ", text or "").strip()
    if not clean:
        return []
    if len(clean) <= size:
        return [clean]

    # Break any sentence that is longer than the whole budget, on whitespace.
    sentences: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", clean):
        while len(sentence) > size:
            head = sentence[:size].rsplit(" ", 1)[0] or sentence[:size]
            sentences.append(head)
            sentence = sentence[len(head):].strip()
        if sentence:
            sentences.append(sentence)

    chunks: list[str] = []
    current: list[str] = []
    length = 0

    for sentence in sentences:
        if current and length + len(sentence) + 1 > size:
            chunks.append(" ".join(current))
            # Carry back whole trailing sentences, up to the overlap budget.
            carried: list[str] = []
            carried_len = 0
            for previous in reversed(current):
                if carried_len + len(previous) + 1 > overlap:
                    break
                carried.insert(0, previous)
                carried_len += len(previous) + 1
            current = carried
            length = carried_len
        current.append(sentence)
        length += len(sentence) + 1

    if current:
        chunks.append(" ".join(current))
    return [c.strip() for c in chunks if c.strip()]


# The transcription path retries; this one did not, and a 429 partway through a
# batch killed an hour-long run. Free-tier embedding quota is easy to exhaust.
EMBED_ATTEMPTS = 5
EMBED_BACKOFF_SECONDS = 20


def embed_texts(
    texts: list[str],
    task_type: str = "RETRIEVAL_DOCUMENT",
    model: str | None = None,
    timeout: float = 120.0,
) -> list[list[float]]:
    """Embed a batch of passages, retrying when the API pushes back.

    task_type matters: Gemini embeds a document and the query that should find it
    into deliberately different spaces, and using one type for both measurably
    degrades retrieval.
    """
    if not texts:
        return []
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is required to build embeddings")

    name = model or embedding_model()
    payload = {
        "requests": [
            {
                "model": f"models/{name}",
                "content": {"parts": [{"text": text}]},
                "taskType": task_type,
                "outputDimensionality": DIMENSIONS,
            }
            for text in texts
        ]
    }

    last_error: Exception | None = None
    for attempt in range(EMBED_ATTEMPTS):
        try:
            response = httpx.post(
                f"{API}/models/{name}:batchEmbedContents",
                headers={"x-goog-api-key": settings.gemini_api_key},
                json=payload,
                timeout=timeout,
            )
            if response.status_code in (429, 500, 503):
                raise httpx.HTTPStatusError(
                    f"HTTP {response.status_code}", request=response.request,
                    response=response,
                )
            response.raise_for_status()
            return [
                normalise(item["values"])
                for item in response.json().get("embeddings", [])
            ]
        except httpx.HTTPStatusError as exc:
            last_error = exc
            status = exc.response.status_code if exc.response is not None else 0
            if status not in (429, 500, 503) or attempt == EMBED_ATTEMPTS - 1:
                raise
            # Honour Retry-After when the API sends one; it knows better than we do.
            wait = EMBED_BACKOFF_SECONDS * (attempt + 1)
            header = exc.response.headers.get("retry-after") if exc.response else None
            if header and header.isdigit():
                wait = max(wait, int(header))
            print(f"      embedding {status}, waiting {wait}s", flush=True)
            time.sleep(wait)
        except httpx.RequestError as exc:
            last_error = exc
            if attempt == EMBED_ATTEMPTS - 1:
                raise
            time.sleep(EMBED_BACKOFF_SECONDS * (attempt + 1))

    raise last_error if last_error else RuntimeError("embedding failed")


def normalise(vector: list[float]) -> list[float]:
    """Unit-length vectors, so cosine similarity is a dot product.

    Truncating a Matryoshka embedding to fewer dimensions leaves it no longer
    unit length, so this is required rather than an optimisation.
    """
    norm = math.sqrt(sum(v * v for v in vector))
    return [v / norm for v in vector] if norm else vector


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))


@dataclass
class Match:
    chunk_id: int
    lesson_id: int
    course_identifier: str
    text: str
    score: float


def search(
    query_vector: list[float],
    chunks: list[tuple[int, int, str, str, list[float]]],
    limit: int = 5,
    min_score: float = 0.0,
) -> list[Match]:
    """Rank stored chunks against a query vector.

    `chunks` are (chunk_id, lesson_id, course_identifier, text, embedding).
    """
    scored = [
        Match(
            chunk_id=chunk_id,
            lesson_id=lesson_id,
            course_identifier=course_id,
            text=text,
            score=cosine(query_vector, vector),
        )
        for chunk_id, lesson_id, course_id, text, vector in chunks
        if vector
    ]
    scored.sort(key=lambda m: -m.score)
    return [m for m in scored if m.score >= min_score][:limit]


# --- retrieval over stored transcripts -------------------------------------
def search_transcripts(
    db,
    query: str,
    limit: int = 5,
    course_identifier: str | None = None,
    min_score: float = MIN_RELEVANCE,
) -> list[Match]:
    """Find the passages of lesson video that answer a question.

    Scoped to a course when one is given, because a learner asking a question
    inside a course wants an answer from that course, not the nearest sentence
    anywhere in the catalogue.

    Returns nothing when no passage is close enough. That matters more than it
    sounds: a tutor handed a weak match will answer from the model's own
    knowledge and present it as what the lesson said.
    """
    from sqlalchemy import select

    from app.models import TranscriptChunk

    stmt = select(TranscriptChunk)
    if course_identifier:
        stmt = stmt.where(TranscriptChunk.course_identifier == course_identifier)
    rows = db.scalars(stmt).all()
    if not rows:
        return []

    query_vector = embed_texts([query], task_type="RETRIEVAL_QUERY")[0]
    return search(
        query_vector,
        [
            (r.id, r.lesson_id, r.course_identifier, r.text, r.embedding or [])
            for r in rows
        ],
        limit=limit,
        min_score=min_score,
    )
