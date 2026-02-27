"""Shared LangGraph state schema."""

from typing import TypedDict, Optional, List


class PipelineState(TypedDict, total=False):
    """State that flows through every node in the LangGraph DAG."""

    # ── Inputs ──────────────────────────────────────────────────
    student_id: str
    session_id: str
    document_text: str
    query_text: str

    # ── Memory references (set at runtime, not serialized) ──────
    # These are stored in the active_sessions dict, not in the state
    # We pass string representations for the graph

    # ── Student context (from Memory 2) ─────────────────────────
    weak_areas: str
    mastered_concepts: str
    past_struggles: str
    explanation_style: str
    recent_session_summary: str
    past_related_doubts: str

    # ── Session context ─────────────────────────────────────────
    document_chunks: str
    session_history: str

    # ── Pipeline outputs ────────────────────────────────────────
    root_cause_analysis: str
    background_concepts: str
    solution: str
    improvement_advice: Optional[str]
