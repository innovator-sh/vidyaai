"""Speech-to-text provider interface + Sarvam implementation."""

from __future__ import annotations

import logging
from typing import Protocol

import httpx

log = logging.getLogger("app.stt")

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text-translate"


class STTUnavailable(Exception):
    """Provider not configured or failed."""


class STTProvider(Protocol):
    async def transcribe(self, audio: bytes, filename: str, content_type: str) -> str: ...


class UnconfiguredSTT:
    async def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        raise STTUnavailable("speech-to-text is not configured")


class SarvamSTT:
    def __init__(self, api_key: str, timeout: float = 60.0) -> None:
        self._api_key = api_key
        self._timeout = timeout

    async def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    SARVAM_STT_URL,
                    headers={"api-subscription-key": self._api_key},
                    files={"file": (filename, audio, content_type)},
                    data={"prompt": "translate to english"},
                )
            resp.raise_for_status()
            return str(resp.json().get("transcript", ""))
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("sarvam_stt_failed", extra={"error_type": type(exc).__name__})
            raise STTUnavailable("speech-to-text failed") from None
