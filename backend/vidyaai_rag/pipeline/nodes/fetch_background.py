"""Node: fetch_background — Feature 2: Background & Related Concepts."""

from pipeline.state import PipelineState
from prompts.system_prompt import get_system_prompt
from prompts.background_concepts_prompt import get_background_concepts_prompt
from utils.llm_client import get_llm
from langchain_core.messages import SystemMessage, HumanMessage


def fetch_background(state: PipelineState) -> dict:
    """Identify prerequisite concepts the student needs before the solution."""

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

    user_msg = get_background_concepts_prompt(
        root_cause_analysis=state.get("root_cause_analysis", ""),
        mastered_concepts=state.get("mastered_concepts", "None identified yet"),
        weak_areas=state.get("weak_areas", "None identified yet"),
    )

    response = llm.invoke([
        SystemMessage(content=system_msg),
        HumanMessage(content=user_msg),
    ])

    return {"background_concepts": response.content}
