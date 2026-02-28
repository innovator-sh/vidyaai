"""Node: update_student_memory — writes session results to long-term Memory 2."""

from pipeline.state import PipelineState
from memory.student_memory import StudentMemory


def update_student_memory(state: PipelineState) -> dict:
    """Write the current session's Q&A, analysis, and document context to ChromaDB."""

    student_mem = StudentMemory(state["student_id"])

    # Store the doubt and solution
    doubt_entry = f"Doubt: {state['query_text']}\nSolution: {state.get('solution', '')}"
    student_mem.add_entry(doubt_entry, metadata={
        "tag": "doubt_resolution",
        "session_id": state["session_id"],
    })

    # Store root cause for future reference
    root_cause = state.get("root_cause_analysis", "")
    if root_cause:
        student_mem.add_entry(root_cause, metadata={
            "tag": "root_cause",
            "session_id": state["session_id"],
        })

    # The state passes through unchanged — this is a write-only node
    return {}
