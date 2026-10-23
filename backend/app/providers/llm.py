"""LLM provider interface and the Groq implementation (timeouts, retries, circuit breaker)."""

from __future__ import annotations

import base64
import logging
import time
from collections.abc import AsyncIterator
from typing import Any, Protocol

import groq

log = logging.getLogger("app.llm")

Messages = list[dict[str, Any]]


class LLMError(Exception):
    """Provider failure (already sanitised - safe to log, never contains user content)."""


class LLMUnavailable(LLMError):
    """Provider is down, misconfigured or the circuit is open."""


class LLMProvider(Protocol):
    def stream(
        self,
        messages: Messages,
        *,
        model: str | None = None,
        temperature: float = 0.6,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]: ...

    async def complete(
        self,
        messages: Messages,
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 800,
        json_mode: bool = False,
    ) -> str: ...

    async def vision(self, image: bytes, mime: str, prompt: str) -> str: ...


class CircuitBreaker:
    """Opens after `threshold` consecutive failures; half-opens after `cooldown` seconds."""

    def __init__(self, threshold: int = 5, cooldown: float = 30.0) -> None:
        self.threshold = threshold
        self.cooldown = cooldown
        self._failures = 0
        self._opened_at = 0.0

    def allow(self) -> bool:
        if self._failures < self.threshold:
            return True
        return time.monotonic() - self._opened_at >= self.cooldown

    def success(self) -> None:
        self._failures = 0

    def failure(self) -> None:
        self._failures += 1
        if self._failures >= self.threshold:
            self._opened_at = time.monotonic()


class UnconfiguredLLM:
    """Used when GROQ_API_KEY is absent (dev/test): every call fails fast and cleanly."""

    def stream(self, messages: Messages, **_: Any) -> AsyncIterator[str]:
        return self._fail()

    async def _fail(self) -> AsyncIterator[str]:
        raise LLMUnavailable("LLM provider is not configured")
        yield ""  # pragma: no cover

    async def complete(self, messages: Messages, **_: Any) -> str:
        raise LLMUnavailable("LLM provider is not configured")

    async def vision(self, image: bytes, mime: str, prompt: str) -> str:
        raise LLMUnavailable("LLM provider is not configured")


def _counts_as_outage(exc: groq.APIError) -> bool:
    if isinstance(exc, groq.APIStatusError):
        return exc.status_code >= 500 or exc.status_code == 429
    return True  # connection / timeout errors


class GroqLLM:
    def __init__(
        self,
        api_key: str,
        *,
        chat_model: str,
        vision_model: str,
        timeout: float = 30.0,
        max_tokens: int = 1024,
        breaker: CircuitBreaker | None = None,
    ) -> None:
        self._client = groq.AsyncGroq(api_key=api_key, timeout=timeout, max_retries=2)
        self._chat_model = chat_model
        self._vision_model = vision_model
        self._max_tokens = max_tokens
        self._breaker = breaker or CircuitBreaker()

    def _guard(self) -> None:
        if not self._breaker.allow():
            raise LLMUnavailable("LLM circuit open")

    def _wrap(self, exc: groq.APIError) -> LLMError:
        if _counts_as_outage(exc):
            self._breaker.failure()
        log.warning("llm_call_failed", extra={"error_type": type(exc).__name__})
        return LLMUnavailable(type(exc).__name__)

    async def stream(
        self,
        messages: Messages,
        *,
        model: str | None = None,
        temperature: float = 0.6,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        self._guard()
        try:
            resp = await self._client.chat.completions.create(
                model=model or self._chat_model,
                messages=messages,  # type: ignore[arg-type]
                temperature=temperature,
                max_tokens=max_tokens or self._max_tokens,
                stream=True,
            )
            async for chunk in resp:  # type: ignore[union-attr]
                if chunk.choices:
                    piece = chunk.choices[0].delta.content
                    if piece:
                        yield piece
            self._breaker.success()
        except groq.APIError as exc:
            raise self._wrap(exc) from None

    async def complete(
        self,
        messages: Messages,
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 800,
        json_mode: bool = False,
    ) -> str:
        self._guard()
        kwargs: dict[str, Any] = {}
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        try:
            resp = await self._client.chat.completions.create(
                model=model or self._chat_model,
                messages=messages,  # type: ignore[arg-type]
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs,
            )
        except groq.APIError as exc:
            raise self._wrap(exc) from None
        self._breaker.success()
        return resp.choices[0].message.content or ""

    async def vision(self, image: bytes, mime: str, prompt: str) -> str:
        self._guard()
        data_url = f"data:{mime};base64,{base64.b64encode(image).decode()}"
        messages: Messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ]
        try:
            resp = await self._client.chat.completions.create(
                model=self._vision_model,
                messages=messages,  # type: ignore[arg-type]
                temperature=0.0,
                max_tokens=1024,
            )
        except groq.APIError as exc:
            raise self._wrap(exc) from None
        self._breaker.success()
        return resp.choices[0].message.content or ""
