from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import httpx

from app.db.models import Conversation, Message, QuizResult
from app.services.container import Services
from app.services.stats import merge_subject_counts, study_minutes, weekly_activity
from tests.conftest import auth

T0 = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)


def test_weekly_activity_has_seven_utc_days_oldest_first() -> None:
    times = [T0, T0 + timedelta(minutes=5), T0 - timedelta(days=2), T0 - timedelta(days=30)]
    out = weekly_activity(times, T0)
    assert [d["date"] for d in out] == [
        "2026-10-29",
        "2026-10-30",
        "2026-10-31",
        "2026-11-01",
        "2026-11-02",
        "2026-11-03",
        "2026-11-04",
    ]
    assert [d["messages"] for d in out] == [0, 0, 0, 0, 1, 0, 2]


def test_weekly_activity_uses_utc_day_boundaries() -> None:
    late = datetime(2026, 11, 3, 23, 59, tzinfo=UTC)
    early = datetime(2026, 11, 4, 0, 1, tzinfo=UTC)
    out = {d["date"]: d["messages"] for d in weekly_activity([late, early], T0)}
    assert out["2026-11-03"] == 1 and out["2026-11-04"] == 1


def test_merge_subject_counts_is_case_insensitive_and_labels_unknown() -> None:
    out = merge_subject_counts(
        [("Biology", 2), (None, 1), ("physics", 1)], [("biology", 1), ("Biology", 1), ("  ", 1)]
    )
    assert out == [
        {"subject": "Biology", "count": 4},
        {"subject": "General", "count": 2},
        {"subject": "physics", "count": 1},
    ]


def test_study_minutes_caps_gaps_and_splits_conversations() -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    timeline = [
        (a, "Biology", T0),
        (a, "Biology", T0 + timedelta(seconds=60)),  # 60s
        (a, "Biology", T0 + timedelta(minutes=60)),  # 59 min gap -> capped to 300s
        (b, None, T0),
        (b, None, T0 + timedelta(seconds=120)),  # 120s -> General
        (uuid.uuid4(), "Chemistry", T0),  # single message: no time
    ]
    assert study_minutes(timeline) == [
        {"subject": "Biology", "minutes": 6.0},
        {"subject": "General", "minutes": 2.0},
    ]
    assert study_minutes([]) == []


async def _seed(svc: Services, user_id: str) -> None:
    now = datetime.now(UTC)
    uid = uuid.UUID(user_id)
    async with svc.sessionmaker() as s:
        bio = Conversation(
            user_id=uid, title="b", subject="Biology", created_at=now, updated_at=now
        )
        phy = Conversation(
            user_id=uid, title="p", subject="Physics", created_at=now, updated_at=now
        )
        old = Conversation(
            user_id=uid,
            title="o",
            subject="Chemistry",
            created_at=now - timedelta(days=200),
            updated_at=now - timedelta(days=200),
        )
        s.add_all([bio, phy, old])
        await s.flush()
        base = now - timedelta(minutes=30)
        for i, (conv, role, gap) in enumerate(
            [(bio, "user", 0), (bio, "assistant", 20), (bio, "user", 40), (phy, "user", 0)]
        ):
            s.add(
                Message(
                    conversation_id=conv.id,
                    user_id=uid,
                    role=role,
                    content=f"m{i}",
                    created_at=base + timedelta(seconds=gap),
                )
            )
        s.add(
            Message(
                conversation_id=old.id,
                user_id=uid,
                role="user",
                content="ancient",
                created_at=now - timedelta(days=200),
            )
        )
        s.add_all(
            [
                QuizResult(user_id=uid, score=3, total=4, subject="Biology"),
                QuizResult(user_id=uid, score=1, total=4, subject=None),
            ]
        )
        await s.commit()


async def test_stats_extended_fields(client: httpx.AsyncClient, svc: Services) -> None:
    me = (await client.get("/v1/me", headers=auth())).json()
    await _seed(svc, me["id"])
    stats = (await client.get("/v1/stats", headers=auth())).json()

    # existing fields are unchanged in shape
    assert stats["chat_count"] == 4 and stats["streak_days"] >= 1
    assert len(stats["quiz_results"]) == 2

    # conversations (2 recent) + quiz results grouped by subject; 200-day-old chat excluded
    assert {(r["subject"], r["count"]) for r in stats["by_subject"]} == {
        ("Biology", 2),
        ("Physics", 1),
        ("General", 1),
    }
    assert stats["by_subject"][0] == {"subject": "Biology", "count": 2}

    week = stats["weekly_activity"]
    assert len(week) == 7 and week[-1]["date"] == datetime.now(UTC).date().isoformat()
    assert sum(d["messages"] for d in week) == 3  # 3 user messages in the last 7 days

    assert stats["quiz_accuracy"] == 0.5  # (3+1)/(4+4)

    # Biology: 20s + 20s of gaps = 40s -> 0.7 min; Physics has one message (no gap)
    assert stats["study_minutes_by_subject"] == [{"subject": "Biology", "minutes": 0.7}]


async def test_stats_are_isolated_per_user(client: httpx.AsyncClient, svc: Services) -> None:
    me = (await client.get("/v1/me", headers=auth("alice"))).json()
    await _seed(svc, me["id"])
    bob = (await client.get("/v1/stats", headers=auth("bob"))).json()
    assert bob["by_subject"] == [] and bob["study_minutes_by_subject"] == []
    assert bob["quiz_accuracy"] is None
    assert all(d["messages"] == 0 for d in bob["weekly_activity"])
