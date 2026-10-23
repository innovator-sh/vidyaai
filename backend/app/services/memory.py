"""Student memory + document retrieval (Qdrant) and the post-chat background update."""

from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import update

from app.db.models import Conversation
from app.prompts.root_cause_prompt import get_root_cause_prompt
from app.providers.llm import LLMError
from app.services.container import Services
from app.vector.store import DOC_CHUNKS, STUDENT_MEMORY

log = logging.getLogger("app.memory")

TAG_DOUBT = "doubt_resolution"
TAG_ROOT_CAUSE = "root_cause"


@dataclass
class RetrievedContext:
    memory: list[str] = field(default_factory=list)
    doc_chunks: list[tuple[str, str]] = field(default_factory=list)  # (doc name, text)
    weak_areas: list[str] = field(default_factory=list)
    doc_ids: list[str] = field(default_factory=list)


async def retrieve_context(
    svc: Services, user_id: uuid.UUID, query: str, document_id: uuid.UUID | None
) -> RetrievedContext:
    """Best-effort retrieval: a vector-store outage must never break chat."""
    s = svc.settings
    ctx = RetrievedContext()
    try:
        vec = await svc.embedder.embed_query(query)
        mem = await svc.vectors.search(
            STUDENT_MEMORY,
            user_id,
            vec,
            limit=s.rag_memory_k,
            tag=TAG_DOUBT,
            score_threshold=s.rag_score_threshold,
        )
        ctx.memory = [str(h.payload.get("text", ""))[:600] for h in mem if h.payload.get("text")]
        gaps = await svc.vectors.search(
            STUDENT_MEMORY,
            user_id,
            vec,
            limit=3,
            tag=TAG_ROOT_CAUSE,
            score_threshold=s.rag_score_threshold,
        )
        ctx.weak_areas = [str(h.payload["core_gap"]) for h in gaps if h.payload.get("core_gap")]
        docs = await svc.vectors.search(
            DOC_CHUNKS,
            user_id,
            vec,
            limit=s.rag_doc_k,
            doc_id=document_id,
            score_threshold=s.rag_score_threshold,
        )
        for h in docs:
            ctx.doc_chunks.append(
                (str(h.payload.get("doc_name", "document")), str(h.payload["text"]))
            )
            did = str(h.payload.get("doc_id", ""))
            if did and did not in ctx.doc_ids:
                ctx.doc_ids.append(did)
    except Exception as exc:
        log.warning("retrieval_failed", extra={"error_type": type(exc).__name__})
    return ctx


def parse_json_object(raw: str) -> dict[str, Any] | None:
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


@dataclass
class PostChat:
    """Filled by the streaming generator; consumed by the background task after the response."""

    user_id: uuid.UUID
    conversation_id: uuid.UUID
    question: str
    doc_text: str = ""
    past: str = ""
    answer: str = ""


async def update_student_memory(svc: Services, job: PostChat) -> None:
    """Runs AFTER the SSE response: store the Q&A and a root-cause note; set the subject."""
    if not job.answer:
        return
    try:
        now = datetime.now(UTC).isoformat()
        texts = [f"Doubt: {job.question[:1500]}\nSolution: {job.answer[:2500]}"]
        payloads: list[dict[str, Any]] = [
            {
                "tag": TAG_DOUBT,
                "text": texts[0],
                "conversation_id": str(job.conversation_id),
                "created_at": now,
            }
        ]
        root: dict[str, Any] | None = None
        if len(job.question) >= 12:
            try:
                raw = await svc.llm.complete(
                    [
                        {
                            "role": "user",
                            "content": get_root_cause_prompt(
                                job.question,
                                job.doc_text,
                                job.past or "No past related doubts found",
                            ),
                        }
                    ],
                    model=svc.settings.llm_fast_model,
                    temperature=0.1,
                    max_tokens=300,
                    json_mode=True,
                )
                root = parse_json_object(raw)
            except LLMError:
                root = None
        if root and root.get("core_gap"):
            gap = str(root["core_gap"])[:300]
            topic = str(root.get("topic_area") or "")[:80]
            texts.append(f"Root cause: {gap}. {str(root.get('reasoning') or '')[:300]}")
            payloads.append(
                {
                    "tag": TAG_ROOT_CAUSE,
                    "text": texts[-1],
                    "core_gap": gap,
                    "topic_area": topic,
                    "conversation_id": str(job.conversation_id),
                    "created_at": now,
                }
            )
            if topic:
                async with svc.sessionmaker() as session:
                    await session.execute(
                        update(Conversation)
                        .where(
                            Conversation.id == job.conversation_id,
                            Conversation.user_id == job.user_id,
                            Conversation.subject.is_(None),
                        )
                        .values(subject=topic)
                    )
                    await session.commit()
        vectors = await svc.embedder.embed_documents(texts)
        await svc.vectors.upsert(
            STUDENT_MEMORY, job.user_id, list(zip(vectors, payloads, strict=True))
        )
    except Exception as exc:
        log.warning("memory_update_failed", extra={"error_type": type(exc).__name__})
