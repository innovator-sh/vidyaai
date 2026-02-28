"""Feature 2 — Background Concepts prompt."""


def get_background_concepts_prompt(
    root_cause_analysis: str,
    mastered_concepts: str = "None identified yet",
    weak_areas: str = "None identified yet",
    has_document: bool = True,
) -> str:
    document_note = "grounded in the uploaded document where possible" if has_document else "using general knowledge"
    
    return f"""Based on the root cause identified below, provide all prerequisite and related concepts
the student must understand before the solution will make sense.

Root Cause Analysis: {root_cause_analysis}

Concepts this student has ALREADY mastered (DO NOT re-explain these): {mastered_concepts}

Concepts this student has STRUGGLED with before (give extra depth here): {weak_areas}

Instructions:
- Skip everything in mastered concepts entirely.
- For anything in weak areas, go deeper — use simpler language and extra examples.
- Order concepts from most fundamental to most advanced.
- Each concept must have a brief, student-friendly explanation {document_note}.

Return your answer as a numbered list of concepts with explanations."""
