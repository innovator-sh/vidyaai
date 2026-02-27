"""Feature 1 — Root Cause Analysis prompt."""


def get_root_cause_prompt(
    query_text: str,
    document_chunks: str,
    past_related_doubts: str = "No past related doubts found",
) -> str:
    return f"""Your task is to identify exactly why the student's doubt has arisen.
Do not solve the doubt yet. Only diagnose the root cause.

Student's Doubt: {query_text}

Relevant Document Segments: {document_chunks}

Student's Past Related Doubts: {past_related_doubts}

Respond ONLY in the following JSON format:
{{
  "core_gap": "The fundamental concept the student is missing",
  "misconception": "A specific misconception if detected, else null",
  "topic_area": "The broader subject area this falls under",
  "reasoning": "A concise explanation of why this doubt arose based on the document and student history"
}}"""
