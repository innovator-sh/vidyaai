"""RAG session endpoints — /rag/session/start, /followup, /end, /save, /history."""

import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from models.schemas import (
    SessionStartRequest,
    SessionStartResponse,
    FollowUpRequest,
    FollowUpResponse,
    SessionEndRequest,
    RootCauseAnalysis,
)
from pipeline.graph import full_pipeline, followup_pipeline
from pipeline.session_store import get_session, destroy_session, has_session
from memory.student_memory import StudentMemory
from utils.llm_client import get_llm
from langchain_core.messages import HumanMessage
from db.user_manager import UserManager

router = APIRouter(prefix="/rag/session")

# Singleton UserManager — maps firebase_uid <-> student_id
user_manager = UserManager()


@router.post("/start", response_model=SessionStartResponse)
async def session_start(request: SessionStartRequest):
    """
    Initialize session, load student context, and run the full pipeline.

    Accepts firebase_uid (preferred) or falls back to student_id directly.
    If document_text is empty, runs lightweight direct-QA using student memory.
    """
    # Resolve student_id — prefer firebase_uid mapping, fallback to direct student_id
    student_id = getattr(request, "student_id", None) or ""
    firebase_uid = getattr(request, "firebase_uid", None)
    if firebase_uid:
        try:
            student_id = user_manager.get_or_create_student_id(firebase_uid)
        except Exception:
            pass  # fall back to raw student_id if mapping fails

    # Prepare initial state
    initial_state = {
        "student_id": student_id,
        "session_id": request.session_id,
        "document_text": request.document_text or "",
        "query_text": request.query_text,
    }

    try:
        result = full_pipeline.invoke(initial_state)
        root_cause = _parse_root_cause(result.get("root_cause_analysis", ""))
        background = _parse_background_concepts(result.get("background_concepts", ""))

        return SessionStartResponse(
            session_id=request.session_id,
            root_cause_analysis=root_cause,
            background_concepts=background,
            solution=result.get("solution", ""),
            improvement_advice=result.get("improvement_advice"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/followup", response_model=FollowUpResponse)
async def session_followup(request: FollowUpRequest):
    """Handle a follow-up query within an existing session."""

    if not has_session(request.session_id):
        raise HTTPException(status_code=404, detail="Session not found. Start a session first.")

    # Get existing session memory to retrieve document context
    session_mem = get_session(request.session_id)
    docs = session_mem.retrieve(request.query_text, k=4)
    document_chunks = "\n\n".join([doc.page_content for doc in docs])

    initial_state = {
        "student_id": request.student_id,
        "session_id": request.session_id,
        "query_text": request.query_text,
        "document_text": "",  # No new document for follow-ups
        "document_chunks": document_chunks,
        "session_history": session_mem.get_session_history_text(),
    }

    try:
        result = followup_pipeline.invoke(initial_state)
        return FollowUpResponse(
            solution=result.get("solution", ""),
            improvement_advice=result.get("improvement_advice")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/end")
async def session_end(request: SessionEndRequest):
    """Close the session — generate summary and write to long-term memory."""

    if not has_session(request.session_id):
        raise HTTPException(status_code=404, detail="Session not found.")

    session_mem = get_session(request.session_id)
    history = session_mem.get_session_history_text()

    # Generate a session summary using the LLM
    summary = "No conversation to summarize."
    if history.strip():
        llm = get_llm()
        summary_response = llm.invoke([
            HumanMessage(content=f"Summarize this tutoring session in 2-3 sentences. Focus on what topics were covered, what the student struggled with, and what was resolved.\n\nSession:\n{history}")
        ])
        summary = summary_response.content

    # Write summary to long-term memory
    student_mem = StudentMemory(request.student_id)
    student_mem.add_entry(summary, metadata={
        "tag": "session_summary",
        "session_id": request.session_id,
    })

    # Destroy session memory
    destroy_session(request.session_id)

    return {"status": "session_closed", "summary": summary}


def _parse_root_cause(raw: str) -> RootCauseAnalysis:
    """Try to parse the LLM's JSON output into a RootCauseAnalysis model."""
    try:
        # Try to extract JSON from the response
        # The LLM might wrap it in markdown code blocks
        cleaned = raw.strip()
        if "```json" in cleaned:
            cleaned = cleaned.split("```json")[1].split("```")[0].strip()
        elif "```" in cleaned:
            cleaned = cleaned.split("```")[1].split("```")[0].strip()

        data = json.loads(cleaned)
        return RootCauseAnalysis(**data)
    except (json.JSONDecodeError, KeyError, IndexError):
        # Fallback: treat the entire response as the reasoning
        return RootCauseAnalysis(
            core_gap="See reasoning",
            misconception=None,
            topic_area="General",
            reasoning=raw,
        )


def _parse_background_concepts(raw: str) -> list:
    """Parse the background concepts response into a list of strings."""
    lines = raw.strip().split("\n")
    concepts = []
    for line in lines:
        line = line.strip()
        if line and not line.startswith("#"):
            # Remove numbering like "1. " or "- "
            cleaned = line.lstrip("0123456789.-) ").strip()
            if cleaned:
                concepts.append(cleaned)
    return concepts if concepts else [raw]

# ── History Endpoints ────────────────────────────────────────────────────────

@router.post("/save")
async def save_chat_entry(
    firebase_uid: str,
    question: str,
    answer: str,
    subject: str = "General",
):
    """Lightweight endpoint to save a Q&A pair to ChromaDB."""
    try:
        student_id = user_manager.get_or_create_student_id(firebase_uid)
    except Exception:
        return {"status": "skipped", "reason": "could not map user"}

    try:
        student_mem = StudentMemory(student_id)
        content = f"Doubt: {question}\n\nAnswer: {answer}"
        student_mem.add_entry(
            content,
            metadata={
                "tag": "doubt_resolution",
                "topic_area": subject.lower(),
                "question": question[:200],
                "answer_preview": answer[:200],
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
        return {"status": "saved"}
    except Exception as e:
        return {"status": "error", "reason": str(e)}


@router.get("/history")
async def get_history(firebase_uid: str, limit: int = 50):
    """Return the student's chat history from ChromaDB for the history page."""
    try:
        student_id = user_manager.get_or_create_student_id(firebase_uid)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get student ID: {str(e)}")

    student_mem = StudentMemory(student_id)
    entries = student_mem.get_history(k=limit)

    history_items = []
    for entry in entries:
        content = entry["content"]
        meta = entry["metadata"]
        ts_str = meta.get("timestamp", "")

        title = "Chat Session"
        preview = content[:200]
        if "Doubt: " in content or "Student: " in content:
            first_line = content.split("\n")[0]
            title = first_line.replace("Doubt: ", "").replace("Student: ", "").strip()[:80]
            if len(title) > 80:
                title = title[:77] + "..."

        subject = meta.get("topic_area", meta.get("subject", "General"))
        subject_map = {
            "mathematics": "Mathematics", "math": "Mathematics",
            "physics": "Physics", "chemistry": "Chemistry",
            "biology": "Biology", "history": "History",
            "english": "English", "computer science": "Computer Science",
            "economics": "Economics",
        }
        subject = subject_map.get(subject.lower(), subject.title())
        
        history_items.append({
            "id": meta.get("id", str(hash(content))),
            "title": title,
            "preview": preview,
            "subject": subject,
            "date": ts_str,
            "isFavorite": meta.get("isFavorite", False)
        })
        
    return {"history": history_items}

@router.delete("/history/{item_id}")
async def delete_history_item(firebase_uid: str, item_id: str):
    """Delete a specific history entry."""
    try:
        student_id = user_manager.get_or_create_student_id(firebase_uid)
        student_mem = StudentMemory(student_id)
        student_mem.delete_entry(item_id)
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
