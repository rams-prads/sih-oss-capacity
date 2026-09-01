"""LLM provider seam. The MCQ generator never talks to a vendor SDK directly."""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field


class GeneratedQuestion(BaseModel):
    stem: str
    options: list[str]
    answer_index: int
    explanation: str = ""
    difficulty: float = Field(default=0.5, ge=0.0, le=1.0)


@runtime_checkable
class LLMProvider(Protocol):
    name: str

    def generate_mcqs(
        self, text: str, competency_name: str, n: int
    ) -> list[GeneratedQuestion]: ...


MCQ_SYSTEM_PROMPT = (
    "You are a subject-matter examiner for India's Official Statistical System, writing "
    "assessment items for civil servants under Mission Karmayogi. Write rigorous, "
    "unambiguous multiple-choice questions that test understanding of the supplied "
    "material, not trivia or wording recall."
)


def build_mcq_prompt(text: str, competency_name: str, n: int) -> str:
    return f"""Generate exactly {n} multiple-choice questions assessing the competency
"{competency_name}", based only on the study material below.

Rules:
- Each question has exactly 4 options and exactly ONE correct option.
- Distractors must be plausible to someone who has skimmed the material.
- Vary difficulty: include easy recall items and harder applied items.
- "difficulty" is a number from 0.1 (easy recall) to 0.9 (hard application).
- Do not reference "the passage" or "the document" in the question stem.

Return ONLY a JSON array, no prose or code fences, with this shape:
[{{"stem": "...", "options": ["A","B","C","D"], "answer_index": 0,
   "explanation": "...", "difficulty": 0.5}}]

STUDY MATERIAL:
{text}
"""
