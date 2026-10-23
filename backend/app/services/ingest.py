"""Document ingestion: validate -> extract text -> chunk -> embed -> Qdrant (background task)."""

from __future__ import annotations

import io
import logging
import re
import uuid
from datetime import UTC, datetime
from typing import Any

from pypdf import PdfReader

from app.errors import AppError
from app.providers.ocr import OCRUnavailable
from app.repositories.documents import DocumentRepo
from app.services.container import Services
from app.utils.chunker import chunk_text
from app.vector.store import DOC_CHUNKS

log = logging.getLogger("app.ingest")

ALLOWED_MIME = {
    "application/pdf": b"%PDF-",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/jpeg": b"\xff\xd8\xff",
}


def sanitize_filename(name: str | None) -> str:
    base = (name or "document").replace("\\", "/").split("/")[-1]
    base = re.sub(r"[\x00-\x1f\x7f<>:\"|?*]", "", base).strip(" .")
    return (base or "document")[:120]


def validate_upload(content_type: str | None, data: bytes, max_bytes: int) -> str:
    """Return the canonical MIME type or raise (MIME allow-list + magic bytes + size)."""
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime == "image/jpg":
        mime = "image/jpeg"
    if mime not in ALLOWED_MIME:
        raise AppError(422, "unsupported_type", "Only PDF, PNG and JPEG files are supported")
    if not data:
        raise AppError(422, "empty_file", "The uploaded file is empty")
    if len(data) > max_bytes:
        raise AppError(413, "payload_too_large", "File exceeds the size limit")
    magic = ALLOWED_MIME[mime]
    head = data[:1024] if mime == "application/pdf" else data[: len(magic)]
    if (magic not in head) if mime == "application/pdf" else (not head.startswith(magic)):
        raise AppError(422, "content_mismatch", "File content does not match its declared type")
    return mime


def extract_pdf_text(data: bytes, max_pages: int, max_chars: int) -> str:
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        raise ValueError("encrypted PDF")
    if len(reader.pages) > max_pages:
        raise ValueError(f"PDF has more than {max_pages} pages")
    out: list[str] = []
    total = 0
    for page in reader.pages:
        text = (page.extract_text() or "").strip()
        if text:
            out.append(text)
            total += len(text)
        if total >= max_chars:
            break
    return "\n\n".join(out)[:max_chars]


async def ingest_document(
    svc: Services, user_id: uuid.UUID, doc_id: uuid.UUID, name: str, mime: str, data: bytes
) -> None:
    """Never raises: failures are recorded on the document row (status=failed)."""
    s = svc.settings
    status, error, count = "failed", "Processing failed", 0
    try:
        if mime == "application/pdf":
            text = extract_pdf_text(data, s.pdf_max_pages, s.doc_max_chars)
        else:
            text = (await svc.ocr.extract(data, mime, "handwriting"))[: s.doc_max_chars]
        chunks = chunk_text(text)[: s.doc_max_chunks]
        if not chunks:
            error = "No readable text found in the document"
        else:
            now = datetime.now(UTC).isoformat()
            items: list[tuple[list[float], dict[str, Any]]] = []
            for i in range(0, len(chunks), 64):
                batch = chunks[i : i + 64]
                vectors = await svc.embedder.embed_documents(batch)
                items.extend(
                    (
                        vec,
                        {
                            "doc_id": str(doc_id),
                            "doc_name": name,
                            "chunk_index": i + j,
                            "text": chunk,
                            "tag": "doc_chunk",
                            "created_at": now,
                        },
                    )
                    for j, (vec, chunk) in enumerate(zip(vectors, batch, strict=True))
                )
            await svc.vectors.upsert(DOC_CHUNKS, user_id, items)
            status, error, count = "ready", None, len(chunks)  # type: ignore[assignment]
    except OCRUnavailable:
        error = "Text recognition is unavailable right now"
    except Exception as exc:  # corrupt PDF, embedding/vector outage, ...
        log.warning("ingest_failed", extra={"error_type": type(exc).__name__})
        if isinstance(exc, ValueError):
            error = str(exc)[:200]
    try:
        async with svc.sessionmaker() as session:
            repo = DocumentRepo(session)
            if await repo.get(user_id, doc_id) is None:
                # Deleted while processing: do not leave orphaned vectors behind.
                await svc.vectors.delete_where(DOC_CHUNKS, user_id, doc_id=doc_id)
                return
            await repo.set_status(user_id, doc_id, status, chunk_count=count, error=error)
    except Exception as exc:
        log.error("ingest_status_update_failed", extra={"error_type": type(exc).__name__})
