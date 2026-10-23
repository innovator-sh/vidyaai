from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.db.models import User
from app.deps import ServicesDep, rate_limit
from app.errors import AppError
from app.providers.ocr import OCRUnavailable
from app.providers.stt import STTUnavailable
from app.schemas.api import ContentIn, FlowchartOut, QuizOut, ReportOut, TextOut
from app.services.generate import generate_flowchart, generate_quiz, generate_report
from app.services.ingest import sanitize_filename, validate_upload

router = APIRouter(prefix="/v1", tags=["tools"])

OcrUser = Annotated[User, Depends(rate_limit("ocr_stt", "rl_ocr_stt_per_min"))]
GenUser = Annotated[User, Depends(rate_limit("generate", "rl_generate_per_min"))]

_AUDIO_MAGIC = (b"RIFF", b"ID3", b"OggS", b"fLaC", b"\x1a\x45\xdf\xa3", b"\xff\xfb", b"\xff\xf3")


def _looks_like_audio(data: bytes) -> bool:
    return data.startswith(_AUDIO_MAGIC) or data[4:8] == b"ftyp"


@router.post("/ocr", response_model=TextOut)
async def ocr(
    image: Annotated[UploadFile, File()],
    user: OcrUser,
    svc: ServicesDep,
    mode: Annotated[Literal["handwriting", "math"], Form()] = "handwriting",
) -> Any:
    limit = svc.settings.max_upload_bytes
    data = await image.read(limit + 1)
    mime = validate_upload(image.content_type, data, limit)
    if not mime.startswith("image/"):
        raise AppError(422, "unsupported_type", "OCR accepts PNG or JPEG images")
    try:
        text = await svc.ocr.extract(data, mime, mode)
    except OCRUnavailable:
        raise AppError(
            503, "ocr_unavailable", "Text recognition is unavailable right now"
        ) from None
    return {"text": text}


@router.post("/stt", response_model=TextOut)
async def stt(audio: Annotated[UploadFile, File()], user: OcrUser, svc: ServicesDep) -> Any:
    limit = svc.settings.max_upload_bytes
    data = await audio.read(limit + 1)
    if not data:
        raise AppError(422, "empty_file", "The uploaded file is empty")
    if len(data) > limit:
        raise AppError(413, "payload_too_large", "File exceeds the size limit")
    ctype = (audio.content_type or "").split(";")[0].strip().lower()
    if not (ctype.startswith(("audio/", "video/mp4", "video/webm"))) or not _looks_like_audio(data):
        raise AppError(422, "unsupported_type", "Unsupported audio format")
    try:
        text = await svc.stt.transcribe(data, sanitize_filename(audio.filename), ctype)
    except STTUnavailable:
        raise AppError(503, "stt_unavailable", "Speech-to-text is unavailable right now") from None
    return {"text": text}


@router.post("/generate/quiz", response_model=QuizOut)
async def quiz(body: ContentIn, user: GenUser, svc: ServicesDep) -> Any:
    questions = await generate_quiz(svc.llm, svc.settings.llm_chat_model, body.content)
    return {"questions": questions}


@router.post("/generate/flowchart", response_model=FlowchartOut)
async def flowchart(body: ContentIn, user: GenUser, svc: ServicesDep) -> Any:
    return {"mermaid": await generate_flowchart(svc.llm, svc.settings.llm_fast_model, body.content)}


@router.post("/generate/report", response_model=ReportOut)
async def report(body: ContentIn, user: GenUser, svc: ServicesDep) -> Any:
    return {"summary": await generate_report(svc.llm, svc.settings.llm_fast_model, body.content)}
