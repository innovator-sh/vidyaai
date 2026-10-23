from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, Response, UploadFile

from app.db.models import User
from app.deps import CurrentUser, ServicesDep, SessionDep, rate_limit
from app.errors import not_found
from app.repositories.documents import DocumentRepo
from app.schemas.api import DocumentOut, DocumentPage, DocumentUploadOut
from app.services.ingest import ingest_document, sanitize_filename, validate_upload
from app.vector.store import DOC_CHUNKS

router = APIRouter(prefix="/v1/documents", tags=["documents"])

UploadUser = Annotated[User, Depends(rate_limit("upload", "rl_upload_per_min", daily=False))]


@router.post("", response_model=DocumentUploadOut, status_code=202)
async def upload_document(
    file: Annotated[UploadFile, File()],
    user: UploadUser,
    session: SessionDep,
    svc: ServicesDep,
    background: BackgroundTasks,
) -> Any:
    limit = svc.settings.max_upload_bytes
    data = await file.read(limit + 1)
    mime = validate_upload(file.content_type, data, limit)
    name = sanitize_filename(file.filename)
    doc = await DocumentRepo(session).create(
        user.id, name=name, mime_type=mime, size_bytes=len(data)
    )
    # Bytes stay in memory; nothing is written to disk. Status flips to ready/failed later.
    background.add_task(ingest_document, svc, user.id, doc.id, name, mime, data)
    return doc


@router.get("", response_model=DocumentPage)
async def list_documents(
    user: CurrentUser,
    session: SessionDep,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Any:
    items, next_cursor = await DocumentRepo(session).list_page(user.id, cursor, limit)
    return {"items": items, "next_cursor": next_cursor}


@router.get("/{doc_id}", response_model=DocumentOut)
async def get_document(doc_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> Any:
    doc = await DocumentRepo(session).get(user.id, doc_id)
    if doc is None:
        raise not_found("Document")
    return doc


@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    doc_id: uuid.UUID, user: CurrentUser, session: SessionDep, svc: ServicesDep
) -> Response:
    repo = DocumentRepo(session)
    if await repo.get(user.id, doc_id) is None:
        raise not_found("Document")
    await svc.vectors.delete_where(DOC_CHUNKS, user.id, doc_id=doc_id)
    await repo.delete(user.id, doc_id)
    return Response(status_code=204)
