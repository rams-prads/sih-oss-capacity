"""Upload -> text -> MCQs (spec 8.3).

The generator is a supporting module: its output feeds the competency estimate
in engines/assessment.py. Every generated item passes a validation gate before
it reaches a learner, and the pass rate is reported as the MCQ validity metric.
"""
from __future__ import annotations

import io
import re

from app.llm.base import GeneratedQuestion, LLMProvider

MIN_TEXT_CHARS = 200
MAX_PROMPT_CHARS = 12000


class ExtractionError(ValueError):
    pass


def extract_text(filename: str, content_type: str, raw: bytes) -> tuple[str, int]:
    """Return (text, page_count). Accepts PDF and plain text only."""
    name = (filename or "").lower()
    if name.endswith(".pdf") or "pdf" in (content_type or ""):
        return _extract_pdf(raw)
    if name.endswith((".txt", ".md")) or (content_type or "").startswith("text/"):
        return _clean(raw.decode("utf-8", errors="replace")), 0
    raise ExtractionError("Unsupported file type. Upload a PDF or a .txt/.md file.")


def _extract_pdf(raw: bytes) -> tuple[str, int]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover
        raise ExtractionError("pypdf is not installed") from exc

    try:
        reader = PdfReader(io.BytesIO(raw))
        pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:
        raise ExtractionError(f"Could not read this PDF: {exc}") from exc

    text = _clean("\n".join(pages))
    if len(text) < MIN_TEXT_CHARS:
        raise ExtractionError(
            "Not enough extractable text. Scanned/image-only PDFs need OCR first."
        )
    return text, len(pages)


def _clean(text: str) -> str:
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chunk_text(text: str, size: int = 3000, overlap: int = 200) -> list[str]:
    """Split on paragraph boundaries into ~size-char chunks with a small overlap."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if current and len(current) + len(para) + 2 > size:
            chunks.append(current)
            current = current[-overlap:] + "\n\n" + para if overlap else para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current:
        chunks.append(current)
    return chunks or ([text] if text else [])


def select_prompt_text(text: str) -> str:
    """Pick the material sent to the model, capped to a sane prompt budget."""
    if len(text) <= MAX_PROMPT_CHARS:
        return text
    chunks = chunk_text(text)
    selected: list[str] = []
    budget = MAX_PROMPT_CHARS
    # Sample across the document rather than truncating to the first pages.
    step = max(1, len(chunks) // 4)
    for chunk in chunks[::step]:
        if len(chunk) > budget:
            break
        selected.append(chunk)
        budget -= len(chunk)
    return "\n\n".join(selected) or text[:MAX_PROMPT_CHARS]


def validate_question(q: GeneratedQuestion) -> bool:
    """Quality gate. One correct option, four distinct non-empty choices, real stem."""
    if not q.stem or len(q.stem.strip()) < 10:
        return False
    options = [o.strip() for o in q.options]
    if len(options) != 4:
        return False
    if any(not o for o in options):
        return False
    if len({o.lower() for o in options}) != 4:
        return False
    if not 0 <= q.answer_index < len(options):
        return False
    if not 0.0 <= q.difficulty <= 1.0:
        return False
    return True


def generate_questions(
    provider: LLMProvider, text: str, competency_name: str, n: int
) -> tuple[list[GeneratedQuestion], int]:
    """Return (valid questions, rejected count)."""
    material = select_prompt_text(text)
    # Over-request slightly so the validation gate does not starve the quiz.
    raw_questions = provider.generate_mcqs(material, competency_name, min(n + 2, 20))

    valid: list[GeneratedQuestion] = []
    seen: set[tuple[str, str]] = set()
    rejected = 0
    for q in raw_questions:
        key = (q.stem.strip().lower(), q.options[q.answer_index].strip().lower()
               if 0 <= q.answer_index < len(q.options) else "")
        if not validate_question(q) or key in seen:
            rejected += 1
            continue
        seen.add(key)
        valid.append(q)

    return valid[:n], rejected
