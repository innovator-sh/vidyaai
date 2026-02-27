"""Student profile model — holds retrieved long-term context."""

from dataclasses import dataclass, field
from typing import List


@dataclass
class StudentProfile:
    """Aggregated student context retrieved from long-term memory."""

    student_id: str
    weak_areas: List[str] = field(default_factory=list)
    mastered_concepts: List[str] = field(default_factory=list)
    past_doubts: List[str] = field(default_factory=list)
    session_summaries: List[str] = field(default_factory=list)
    explanation_style: str = "Adaptive"

    def to_prompt_string(self) -> str:
        """Format profile for injection into prompts."""
        parts = [
            f"Student ID: {self.student_id}",
            f"Weak Areas: {', '.join(self.weak_areas) if self.weak_areas else 'None identified yet'}",
            f"Mastered Concepts: {', '.join(self.mastered_concepts) if self.mastered_concepts else 'None identified yet'}",
            f"Explanation Style: {self.explanation_style}",
        ]
        if self.session_summaries:
            parts.append(f"Recent Session Summary: {self.session_summaries[-1]}")
        return "\n".join(parts)
