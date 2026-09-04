"""Concrete LLM providers. Swap with LLM_PROVIDER in .env.

  stub    - offline, deterministic; keeps the judging-day demo free of network calls
  openai  - chat completions
  gemini  - generateContent
  ollama  - local model, no API key
"""
from __future__ import annotations

import json
import re

import httpx

from app.config import get_settings
from app.llm.base import (
    MCQ_SYSTEM_PROMPT,
    TUTOR_SYSTEM_PROMPT,
    GeneratedQuestion,
    build_mcq_prompt,
    build_tutor_prompt,
)


def parse_mcq_json(raw: str) -> list[GeneratedQuestion]:
    """Tolerant parse of a model response into questions. Malformed items are dropped."""
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?|```$", "", cleaned, flags=re.MULTILINE).strip()
    match = re.search(r"\[.*\]", cleaned, flags=re.DOTALL)
    if not match:
        return []
    try:
        rows = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []

    questions = []
    for row in rows if isinstance(rows, list) else []:
        try:
            questions.append(GeneratedQuestion.model_validate(row))
        except Exception:
            continue
    return questions


class StubLLMProvider:
    """Deterministic generator used when no API key is configured.

    It builds items from salient sentences in the material, so an offline demo
    still shows the upload-to-quiz loop end to end. Item quality is obviously
    below a real model's; this is a fallback, not the intended production path.
    """

    name = "stub"

    DISTRACTOR_TEMPLATES = [
        "It is determined solely by the size of the reporting unit.",
        "It applies only to administrative registers, never to survey data.",
        "It is fixed by statute and cannot be revised between cycles.",
    ]

    STEM_TEMPLATES = [
        "Which statement about {topic} is supported by the source material?",
        "According to the material, what is correct regarding {topic}?",
        "In the context of {competency}, which claim about {topic} holds?",
        "The source material states which of the following about {topic}?",
    ]

    @staticmethod
    def _topic(sentence: str) -> str:
        """A short subject phrase, so each stem is distinct."""
        words = re.sub(r"^(The|A|An|This|These|In|For)\s+", "", sentence).split()
        return " ".join(words[:5]).rstrip(",;:.").lower() or "this topic"

    def chat(self, context: str, question: str) -> str:
        """No model, so no freeform answer.

        The tutor answers everything it can from the learner's own record; this
        returning empty is what tells it to say plainly that open questions need a
        model configured, rather than inventing a reply.
        """
        return ""

    def generate_mcqs(self, text: str, competency_name: str, n: int) -> list[GeneratedQuestion]:
        sentences = [
            s.strip()
            for s in re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", text))
            if 60 <= len(s.strip()) <= 300
        ]
        questions: list[GeneratedQuestion] = []
        for idx, sentence in enumerate(sentences[:n]):
            focus = sentence.rstrip(".")
            options = [focus] + self.DISTRACTOR_TEMPLATES
            # Rotate the correct option so the answer key is not always index 0.
            shift = idx % 4
            if shift:
                options = options[-shift:] + options[:-shift]
            template = self.STEM_TEMPLATES[idx % len(self.STEM_TEMPLATES)]
            questions.append(
                GeneratedQuestion(
                    stem=template.format(
                        topic=self._topic(sentence), competency=competency_name
                    ),
                    options=options,
                    answer_index=options.index(focus),
                    explanation="Stated directly in the uploaded material.",
                    difficulty=round(0.3 + 0.5 * (idx % 3) / 2, 2),
                )
            )
        return questions


class OpenAIProvider:
    name = "openai"

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.openai_api_key
        self.model = settings.llm_model or "gpt-4o-mini"
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is required for LLM_PROVIDER=openai")

    def generate_mcqs(self, text: str, competency_name: str, n: int) -> list[GeneratedQuestion]:
        response = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "temperature": 0.4,
                "messages": [
                    {"role": "system", "content": MCQ_SYSTEM_PROMPT},
                    {"role": "user", "content": build_mcq_prompt(text, competency_name, n)},
                ],
            },
            timeout=90.0,
        )
        response.raise_for_status()
        return parse_mcq_json(response.json()["choices"][0]["message"]["content"])

    def chat(self, context: str, question: str) -> str:
        response = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": TUTOR_SYSTEM_PROMPT},
                    {"role": "user", "content": build_tutor_prompt(context, question)},
                ],
            },
            timeout=60.0,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()


class GeminiProvider:
    name = "gemini"

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.gemini_api_key
        self.model = settings.llm_model or "gemini-2.0-flash"
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY is required for LLM_PROVIDER=gemini")

    def generate_mcqs(self, text: str, competency_name: str, n: int) -> list[GeneratedQuestion]:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent"
        )
        prompt = f"{MCQ_SYSTEM_PROMPT}\n\n{build_mcq_prompt(text, competency_name, n)}"
        response = httpx.post(
            url,
            headers={"x-goog-api-key": self.api_key},
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=90.0,
        )
        response.raise_for_status()
        parts = response.json()["candidates"][0]["content"]["parts"]
        return parse_mcq_json("".join(p.get("text", "") for p in parts))

    def chat(self, context: str, question: str) -> str:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent"
        )
        prompt = f"{TUTOR_SYSTEM_PROMPT}\n\n{build_tutor_prompt(context, question)}"
        response = httpx.post(
            url,
            headers={"x-goog-api-key": self.api_key},
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=60.0,
        )
        response.raise_for_status()
        parts = response.json()["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts).strip()


class OllamaProvider:
    name = "ollama"

    def __init__(self) -> None:
        settings = get_settings()
        self.base = settings.ollama_base.rstrip("/")
        self.model = settings.llm_model or "llama3.1"

    def generate_mcqs(self, text: str, competency_name: str, n: int) -> list[GeneratedQuestion]:
        response = httpx.post(
            f"{self.base}/api/generate",
            json={
                "model": self.model,
                "prompt": f"{MCQ_SYSTEM_PROMPT}\n\n{build_mcq_prompt(text, competency_name, n)}",
                "stream": False,
            },
            timeout=180.0,
        )
        response.raise_for_status()
        return parse_mcq_json(response.json().get("response", ""))

    def chat(self, context: str, question: str) -> str:
        response = httpx.post(
            f"{self.base}/api/generate",
            json={
                "model": self.model,
                "prompt": f"{TUTOR_SYSTEM_PROMPT}\n\n{build_tutor_prompt(context, question)}",
                "stream": False,
            },
            timeout=120.0,
        )
        response.raise_for_status()
        return response.json().get("response", "").strip()


_PROVIDERS = {
    "stub": StubLLMProvider,
    "openai": OpenAIProvider,
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
}


def get_llm_provider(name: str | None = None):
    key = (name or get_settings().llm_provider or "stub").lower()
    factory = _PROVIDERS.get(key)
    if factory is None:
        raise RuntimeError(f"Unknown LLM_PROVIDER '{key}'. Options: {sorted(_PROVIDERS)}")
    return factory()
