"""In-process fakes for every external provider - tests never touch the network."""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections.abc import AsyncIterator, Sequence
from typing import Any

from app.auth.firebase import AuthError, VerifiedToken
from app.providers.llm import LLMUnavailable, Messages
from app.providers.ocr import OCRMode, OCRUnavailable
from app.providers.stt import STTUnavailable

QUIZ_JSON = json.dumps(
    [
        {
            "question": f"Question {i}?",
            "options": ["A", "B", "C", "D"],
            "answer_index": i % 4,
            "explanation": "Because.",
        }
        for i in range(5)
    ]
)


class FakeVerifier:
    """Tokens look like 'tok-<name>'. 'tok-unverified-<name>' has an unverified email."""

    def __init__(self) -> None:
        self.calls = 0

    async def verify(self, token: str) -> VerifiedToken:
        self.calls += 1
        m = re.fullmatch(r"tok-(unverified-)?([a-z0-9]+)", token)
        if not m:
            raise AuthError("bad token")
        name = m.group(2)
        return VerifiedToken(
            uid=f"uid-{name}",
            email=f"{name}@example.com",
            name=name.title(),
            email_verified=m.group(1) is None,
        )


class FakeAuthAdmin:
    def __init__(self) -> None:
        self.deleted: list[str] = []
        self.fail = False

    async def delete_user(self, uid: str) -> None:
        if self.fail:
            raise RuntimeError("boom")
        self.deleted.append(uid)


class FakeEmbedder:
    """Deterministic bag-of-words hashing embedder: shared words => cosine similarity."""

    dim = 384

    def _vec(self, text: str) -> list[float]:
        v = [0.0] * self.dim
        for word in re.findall(r"[a-z0-9]+", text.lower()):
            h = int(hashlib.md5(word.encode(), usedforsecurity=False).hexdigest(), 16)
            v[h % self.dim] += 1.0
        norm = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / norm for x in v]

    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    async def embed_query(self, text: str) -> list[float]:
        return self._vec(text)


class FakeLLM:
    def __init__(self) -> None:
        self.reply = "Photosynthesis converts light into chemical energy."
        self.stream_calls: list[Messages] = []
        self.complete_calls: list[Messages] = []
        self.fail = False
        self.complete_text: str | None = None

    async def stream(self, messages: Messages, **_: Any) -> AsyncIterator[str]:
        self.stream_calls.append(messages)
        if self.fail:
            raise LLMUnavailable("down")
        for word in re.findall(r"\S+\s*", self.reply):
            yield word

    async def complete(self, messages: Messages, **_: Any) -> str:
        self.complete_calls.append(messages)
        if self.fail:
            raise LLMUnavailable("down")
        if self.complete_text is not None:
            return self.complete_text
        system = str(messages[0]["content"])
        user = str(messages[-1]["content"])
        if "Respond in this EXACT JSON" in user:
            return json.dumps(
                {
                    "core_gap": "light reactions",
                    "misconception": None,
                    "topic_area": "Biology",
                    "reasoning": "unclear on inputs",
                }
            )
        if "quiz generator" in system:
            return QUIZ_JSON
        if "Mermaid" in system:
            return '```mermaid\ngraph TD\n    A["Start"] --> B["End"]\n```'
        return "- key point one\n- key point two"

    async def vision(self, image: bytes, mime: str, prompt: str) -> str:
        return "x^2 + y^2 = z^2"


class FakeOCR:
    def __init__(self) -> None:
        self.calls: list[tuple[str, int]] = []
        self.fail = False
        self.text = "Newton's second law states that force equals mass times acceleration."

    async def extract(self, image: bytes, mime: str, mode: OCRMode) -> str:
        self.calls.append((mode, len(image)))
        if self.fail:
            raise OCRUnavailable("down")
        return self.text


class FakeSTT:
    def __init__(self) -> None:
        self.fail = False

    async def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        if self.fail:
            raise STTUnavailable("down")
        return "hello world"
