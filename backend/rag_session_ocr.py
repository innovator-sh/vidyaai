"""RAG session endpoints — /rag/session/start, /followup, /end."""

import json
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

router = APIRouter(prefix="/rag/session")


@router.post("/start", response_model=SessionStartResponse)
async def session_start(request: SessionStartRequest):
    """
    Initialize session, load student context, and run the full 3-feature pipeline.
    
    The document_text field is OPTIONAL:
    - If provided: System uses document + student memory for personalized answers
    - If null/empty: System uses only student memory + general knowledge
    
    This allows students to ask questions without uploading documents.
    """

    # Prepare initial state
    initial_state = {
        "student_id": request.student_id,
        "session_id": request.session_id,
        "document_text": request.document_text or "",  # Handle None
        "query_text": request.query_text,
    }

    try:
        # Run the full LangGraph pipeline
        result = full_pipeline.invoke(initial_state)

        # Parse root cause analysis JSON from LLM output
        root_cause = _parse_root_cause(result.get("root_cause_analysis", ""))

        # Parse background concepts into a list
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
