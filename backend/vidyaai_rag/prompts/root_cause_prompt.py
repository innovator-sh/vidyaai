"""Feature 1 — Root Cause Analysis prompt."""


def get_root_cause_prompt(
    query_text: str,
    document_chunks: str,
    past_related_doubts: str = "No past related doubts found",
) -> str:
    # Truncate document chunks if too long
    max_chunk_length = 2000
    if len(document_chunks) > max_chunk_length:
        document_chunks = document_chunks[:max_chunk_length] + "...[truncated]"
    
    # Handle case when no document is provided
    if not document_chunks or not document_chunks.strip():
        content_section = f"""No document was uploaded. Use your general knowledge and the student's history to answer.

Student's Past Related Doubts:
{past_related_doubts}"""
    else:
        content_section = f"""Relevant Content from Uploaded Document:
{document_chunks}

Student's Past Related Doubts:
{past_related_doubts}"""
    
    return f"""Analyze this student's question and identify the root cause of their confusion.

Question: {query_text}

{content_section}

Respond in this EXACT JSON format (no extra text):
{{
  "core_gap": "what concept they're missing",
  "misconception": null,
  "topic_area": "the subject area",
  "reasoning": "why they're confused"
}}"""
