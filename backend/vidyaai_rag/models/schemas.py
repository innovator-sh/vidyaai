"""Pydantic request/response models matching the API contract."""

from pydantic import BaseModel
from typing import Optional, List


# ── Request Models ──────────────────────────────────────────────

class SessionStartRequest(BaseModel):
    student_id: str
    session_id: str
    document_text: Optional[str] = None  # Now optional - can answer without document
    query_text: str


class FollowUpRequest(BaseModel):
    session_id: str
    student_id: str
    query_text: str


class SessionEndRequest(BaseModel):
    session_id: str
    student_id: str


# ── Response Models ─────────────────────────────────────────────

class RootCauseAnalysis(BaseModel):
    core_gap: str
    misconception: Optional[str] = None
    topic_area: str
    reasoning: str


class SessionStartResponse(BaseModel):
    session_id: str
    root_cause_analysis: RootCauseAnalysis
    background_concepts: List[str]
    solution: str
    improvement_advice: Optional[str] = None


class FollowUpResponse(BaseModel):
    solution: str
    improvement_advice: Optional[str] = None
