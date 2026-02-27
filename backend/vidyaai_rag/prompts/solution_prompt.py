"""Feature 3 — Solution prompt."""


def get_solution_prompt(
    query_text: str,
    root_cause_analysis: str,
    background_concepts: str,
    session_history: str = "",
    student_profile: str = "",
) -> str:
    return f"""Now deliver the complete solution to the student's doubt.
You have the root cause and the background concepts already prepared.
Build directly on top of them. Do not repeat what has already been explained.

Student's Doubt: {query_text}
Root Cause: {root_cause_analysis}
Background Concepts Already Covered: {background_concepts}
Current Session History: {session_history}
Student Profile: {student_profile}

Instructions:
- Start where the background concepts left off — do not repeat them.
- Walk through the solution step by step.
- Use examples or analogies that fit the student's level and past interactions.
- RECURRING STRUGGLES: Analyze the 'Student Profile' and 'Past Related Doubts'. If you detect that the student has struggled with this specific topic or concept before, or if this is a recurring query, you MUST provide explicit improvement advice.
- WRAPPING ADVISE: Wrap your improvement advice in <improvement_advice> tags. For example: <improvement_advice>Since you've struggled with X before, I recommend focusing on Y...</improvement_advice>.
- If no significant recurring struggle is found, you may omit the tags or leave them empty.
- End the main solution with a single memorable summary sentence the student can use to retain this concept.
- Format with clear numbered steps. Highlight key terms."""
