"""Node: solve_doubt — Feature 3: Doubt Resolution & Solution."""

from pipeline.state import PipelineState
from prompts.system_prompt import get_system_prompt
from prompts.solution_prompt import get_solution_prompt
from utils.llm_client import get_llm
from pipeline.session_store import get_session
from langchain_core.messages import SystemMessage, HumanMessage


def solve_doubt(state: PipelineState) -> dict:
    """Generate a complete, personalized step-by-step solution."""

    llm = get_llm()

    # Get session history
    session_mem = get_session(state["session_id"])
    session_history = session_mem.get_session_history_text()

    system_msg = get_system_prompt(
        weak_areas=state.get("weak_areas", "None identified yet"),
        mastered_concepts=state.get("mastered_concepts", "None identified yet"),
        past_struggles=state.get("past_struggles", "No prior sessions"),
        explanation_style=state.get("explanation_style", "Adaptive"),
        recent_session_summary=state.get("recent_session_summary", "First session"),
        session_history=session_history,
        document_chunks=state.get("document_chunks", ""),
    )

    student_profile = f"Weak areas: {state.get('weak_areas', 'N/A')}\nMastered: {state.get('mastered_concepts', 'N/A')}"

    user_msg = get_solution_prompt(
        query_text=state["query_text"],
        root_cause_analysis=state.get("root_cause_analysis", ""),
        background_concepts=state.get("background_concepts", ""),
        session_history=session_history,
        student_profile=student_profile,
    )

    response = llm.invoke([
        SystemMessage(content=system_msg),
        HumanMessage(content=user_msg),
    ])

    solution = response.content

    # Extract improvement advice if present
    improvement_advice = None
    if "<improvement_advice>" in solution and "</improvement_advice>" in solution:
        parts = solution.split("<improvement_advice>")
        main_solution = parts[0]
        advice_parts = parts[1].split("</improvement_advice>")
        improvement_advice = advice_parts[0].strip()
        # Append anything after the closing tag back to the main solution
        if len(advice_parts) > 1:
            main_solution += advice_parts[1]
        solution = main_solution.strip()

    # Store the Q&A pair in session memory
    session_mem.add_text(
        f"Student: {state['query_text']}\nVidyaAI: {solution}",
        metadata={"type": "qa_pair"},
    )

    return {
        "solution": solution,
        "improvement_advice": improvement_advice
    }
