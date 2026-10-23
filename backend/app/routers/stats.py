from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter

from app.deps import CurrentUser, SessionDep
from app.repositories.conversations import ConversationRepo
from app.repositories.documents import QuizRepo
from app.schemas.api import QuizResultIn, QuizResultOut

router = APIRouter(prefix="/v1", tags=["stats"])


def streak_from_days(days: set[str], today: datetime | None = None) -> int:
    """Consecutive active UTC days ending today (or yesterday, so the streak is not lost early)."""
    day = (today or datetime.now(UTC)).date()
    if day.isoformat() not in days:
        day -= timedelta(days=1)
    streak = 0
    while day.isoformat() in days:
        streak += 1
        day -= timedelta(days=1)
    return streak


@router.post("/quiz-results", response_model=QuizResultOut, status_code=201)
async def create_quiz_result(body: QuizResultIn, user: CurrentUser, session: SessionDep) -> Any:
    return await QuizRepo(session).create(
        user.id, score=body.score, total=body.total, subject=body.subject
    )


@router.get("/stats")
async def stats(user: CurrentUser, session: SessionDep) -> dict[str, Any]:
    convs = ConversationRepo(session)
    results = await QuizRepo(session).recent(user.id, limit=50)
    days = await convs.activity_days(user.id, datetime.now(UTC) - timedelta(days=400))
    return {
        "quiz_results": [QuizResultOut.model_validate(r).model_dump(mode="json") for r in results],
        "chat_count": await convs.count_user_messages(user.id),
        "streak_days": streak_from_days(days),
    }
