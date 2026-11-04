"""Pure aggregation helpers behind GET /v1/stats (kept free of I/O so they are easy to test)."""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import UTC, datetime, timedelta

UNKNOWN_SUBJECT = "General"
MAX_GAP_SECONDS = 300  # a pause longer than 5 minutes counts as 5 minutes of studying
MAX_SUBJECTS = 20


def _label(subject: str | None) -> str:
    return (subject or "").strip() or UNKNOWN_SUBJECT


def _top(totals: dict[str, float], display: dict[str, str]) -> list[tuple[str, float]]:
    ranked = sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))[:MAX_SUBJECTS]
    return [(display[k], v) for k, v in ranked]


def merge_subject_counts(*groups: list[tuple[str | None, int]]) -> list[dict[str, int | str]]:
    """Sum counts per subject, case-insensitively (the LLM may say 'Biology' and 'biology')."""
    totals: Counter[str] = Counter()
    seen: Counter[str] = Counter()
    display: dict[str, str] = {}
    best_seen: dict[str, int] = {}
    for group in groups:
        for subject, n in group:
            label = _label(subject)
            key = label.casefold()
            totals[key] += n
            seen[label] += n
            if seen[label] >= best_seen.get(key, 0):  # most frequent spelling wins
                best_seen[key] = seen[label]
                display[key] = label
    return [
        {"subject": name, "count": int(v)}
        for name, v in _top({k: float(v) for k, v in totals.items()}, display)
    ]


def weekly_activity(
    times: list[datetime], today: datetime | None = None
) -> list[dict[str, int | str]]:
    """Message counts for the 7 UTC days ending today, oldest first (zeros included)."""
    end = (today or datetime.now(UTC)).astimezone(UTC).date()
    days = [end - timedelta(days=i) for i in range(6, -1, -1)]
    counts = Counter(t.astimezone(UTC).date() for t in times)
    return [{"date": d.isoformat(), "messages": counts.get(d, 0)} for d in days]


def study_minutes(
    timeline: list[tuple[uuid.UUID, str | None, datetime]],
) -> list[dict[str, float | str]]:
    """Estimate study time per subject from message timestamps.

    Within each conversation, the gap between consecutive messages is summed, each gap capped at
    5 minutes (a long pause means the student left). Time is attributed to the conversation's
    subject. `timeline` must be ordered by (conversation, time).
    """
    seconds: Counter[str] = Counter()
    display: dict[str, str] = {}
    prev_conv: uuid.UUID | None = None
    prev_time: datetime | None = None
    for conv_id, subject, at in timeline:
        if conv_id == prev_conv and prev_time is not None:
            gap = min(max((at - prev_time).total_seconds(), 0.0), float(MAX_GAP_SECONDS))
            label = _label(subject)
            seconds[label.casefold()] += round(gap)
            display.setdefault(label.casefold(), label)
        prev_conv, prev_time = conv_id, at
    ranked = _top({k: float(v) for k, v in seconds.items()}, display)
    return [{"subject": name, "minutes": round(v / 60, 1)} for name, v in ranked if v > 0]
