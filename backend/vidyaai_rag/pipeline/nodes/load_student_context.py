"""Node: load_student_context — retrieves long-term memory (Memory 2) at session start."""

from pipeline.state import PipelineState
from memory.student_memory import StudentMemory


def load_student_context(state: PipelineState) -> dict:
    """Retrieve the student's long-term profile and inject into state."""

    student_mem = StudentMemory(state["student_id"])
    query = state["query_text"]

    # Retrieve semantically similar past entries
    past_entries = student_mem.retrieve(query, k=10)
    past_doubts_text = "\n".join([e["content"] for e in past_entries]) if past_entries else "No past doubts found"

    # Retrieve tagged concepts
    weak_areas = student_mem.get_weak_areas()
    mastered = student_mem.get_mastered()
    summaries = student_mem.get_session_summaries(k=3)

    return {
        "weak_areas": ", ".join(weak_areas) if weak_areas else "None identified yet",
        "mastered_concepts": ", ".join(mastered) if mastered else "None identified yet",
        "past_struggles": past_doubts_text,
        "explanation_style": "Adaptive",
        "recent_session_summary": summaries[-1] if summaries else "First session",
        "past_related_doubts": past_doubts_text,
    }
