"""Node: analyze_doubt — Feature 1: Root Cause Analysis."""

from pipeline.state import PipelineState
from prompts.system_prompt import get_system_prompt
from prompts.root_cause_prompt import get_root_cause_prompt
from utils.llm_client import get_llm
from langchain_core.messages import SystemMessage, HumanMessage


def analyze_doubt(state: PipelineState) -> dict:
    """Identify the root cause of the student's doubt."""

    llm = get_llm()

    system_msg = get_system_prompt(
        weak_areas=state.get("weak_areas", "None identified yet"),
        mastered_concepts=state.get("mastered_concepts", "None identified yet"),
        past_struggles=state.get("past_struggles", "No prior sessions"),
        explanation_style=state.get("explanation_style", "Adaptive"),
        recent_session_summary=state.get("recent_session_summary", "First session"),
        session_history=state.get("session_history", ""),
        document_chunks=state.get("document_chunks", ""),
    )

    user_msg = get_root_cause_prompt(
        query_text=state["query_text"],
        document_chunks=state.get("document_chunks", ""),
        past_related_doubts=state.get("past_related_doubts", "No past related doubts found"),
    )

    response = llm.invoke([
        SystemMessage(content=system_msg),
        HumanMessage(content=user_msg),
    ])

    return {"root_cause_analysis": response.content}
