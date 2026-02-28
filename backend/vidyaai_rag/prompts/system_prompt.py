"""Shared system prompt — injected into every LLM call."""


def get_system_prompt(
    weak_areas: str = "None identified yet",
    mastered_concepts: str = "None identified yet",
    past_struggles: str = "No prior sessions",
    explanation_style: str = "Adaptive",
    recent_session_summary: str = "First session",
    session_history: str = "",
    document_chunks: str = "",
) -> str:
    # Truncate document chunks if too long to avoid overwhelming the LLM
    max_chunk_length = 3000
    if len(document_chunks) > max_chunk_length:
        document_chunks = document_chunks[:max_chunk_length] + "...[content truncated for brevity]"
    
    # Handle case when no document is provided
    if not document_chunks or not document_chunks.strip():
        context_section = """Document Context:
No document was uploaded. Use your general knowledge and the student's learning history to provide accurate, helpful answers."""
    else:
        context_section = f"""Document Context:
{document_chunks}"""
    
    return f"""You are VidyaAI, a private tutor for this student.

Student Profile:
- Weak areas: {weak_areas}
- Mastered: {mastered_concepts}

{context_section}

Rules:
1. Be concise and specific
2. Focus on the student's actual question
3. Use the document context if provided, otherwise use general knowledge
4. Don't repeat mastered concepts"""
