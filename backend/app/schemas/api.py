"""Request/response schemas (strict: unknown fields are rejected)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Persona = Literal["study-buddy", "teacher", "mentor"]
Language = Annotated[str, StringConstraints(pattern=r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$")]
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- account ------------------------------------------------------------------------------------
class MeOut(Out):
    id: uuid.UUID
    email: str | None
    display_name: str | None
    course: str | None
    degree: str | None
    college: str | None
    location: str | None
    created_at: datetime


class MeUpdate(Strict):
    display_name: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None
    ) = None
    course: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    degree: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    college: Annotated[str, StringConstraints(strip_whitespace=True, max_length=160)] | None = None
    location: Annotated[str, StringConstraints(strip_whitespace=True, max_length=160)] | None = None


# --- chat ---------------------------------------------------------------------------------------
class ChatRequest(Strict):
    conversation_id: uuid.UUID | None = None
    message_id: uuid.UUID
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]
    persona: Persona = "study-buddy"
    document_id: uuid.UUID | None = None
    language: Language | None = None
    history_window: Annotated[int, Field(ge=0, le=100)] | None = None


# --- conversations ------------------------------------------------------------------------------
class ConversationItem(Out):
    id: uuid.UUID
    title: str
    subject: str | None
    persona: str
    is_favorite: bool
    updated_at: datetime
    preview: str


class ConversationPage(BaseModel):
    items: list[ConversationItem]
    next_cursor: str | None


class MessageOut(Out):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class ConversationDetail(Out):
    id: uuid.UUID
    title: str
    subject: str | None
    persona: str
    is_favorite: bool
    created_at: datetime
    updated_at: datetime
    messages: list[MessageOut]


class ConversationPatch(Strict):
    title: Short | None = None
    is_favorite: bool | None = None


# --- documents ----------------------------------------------------------------------------------
class DocumentUploadOut(Out):
    id: uuid.UUID
    name: str
    status: str


class DocumentOut(Out):
    id: uuid.UUID
    name: str
    status: str
    created_at: datetime


class DocumentPage(BaseModel):
    items: list[DocumentOut]
    next_cursor: str | None = None


# --- tools --------------------------------------------------------------------------------------
class TextOut(BaseModel):
    text: str


class ContentIn(Strict):
    content: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20000)
    ]


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    answer_index: int
    explanation: str


class QuizOut(BaseModel):
    questions: list[QuizQuestion]


class FlowchartOut(BaseModel):
    mermaid: str


class ReportOut(BaseModel):
    summary: str


# --- stats --------------------------------------------------------------------------------------
class QuizResultIn(Strict):
    score: Annotated[int, Field(ge=0, le=1000)]
    total: Annotated[int, Field(ge=1, le=1000)]
    subject: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None

    @model_validator(mode="after")
    def _score_le_total(self) -> QuizResultIn:
        if self.score > self.total:
            raise ValueError("score cannot exceed total")
        return self


class QuizResultOut(Out):
    id: uuid.UUID
    score: int
    total: int
    subject: str | None
    created_at: datetime


class StatsOut(BaseModel):
    quiz_results: list[QuizResultOut]
    chat_count: int
    streak_days: int
