from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter

from app.deps import CurrentUser, SessionDep
from app.repositories.conversations import ConversationRepo
from app.repositories.documents import QuizRepo
from app.schemas.api import QuizResultIn, QuizResultOut, StatsOut
from app.services.stats import merge_subject_counts, study_minutes, weekly_activity

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


@router.get("/stats", response_model=StatsOut)
async def stats(user: CurrentUser, session: SessionDep) -> dict[str, Any]:
    convs = ConversationRepo(session)
    quizzes = QuizRepo(session)
    now = datetime.now(UTC)
    results = await quizzes.recent(user.id, limit=50)
    days = await convs.activity_days(user.id, now - timedelta(days=400))
    since_90 = now - timedelta(days=90)
    score, total = await quizzes.totals(user.id)
    week_start = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
    return {
        "quiz_results": [QuizResultOut.model_validate(r).model_dump(mode="json") for r in results],
        "chat_count": await convs.count_user_messages(user.id),
        "streak_days": streak_from_days(days),
        "by_subject": merge_subject_counts(
            await convs.conversation_subject_counts(user.id, since_90),
            await quizzes.subject_counts(user.id, since_90),
        ),
        "weekly_activity": weekly_activity(
            await convs.user_message_times(user.id, week_start), now
        ),
        "quiz_accuracy": round(score / total, 4) if total else None,
        "study_minutes_by_subject": study_minutes(
            await convs.message_timeline(user.id, now - timedelta(days=30))
        ),
    }
