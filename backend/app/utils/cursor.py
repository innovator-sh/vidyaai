"""Opaque keyset-pagination cursors: (timestamp, id) -> url-safe token."""

from __future__ import annotations

import base64
import binascii
import json
import uuid
from datetime import datetime

from app.errors import AppError


def encode_cursor(ts: datetime, id_: uuid.UUID) -> str:
    raw = json.dumps({"t": ts.isoformat(), "i": str(id_)}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(token: str) -> tuple[datetime, uuid.UUID]:
    try:
        padded = token + "=" * (-len(token) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode()))
        return datetime.fromisoformat(data["t"]), uuid.UUID(data["i"])
    except (ValueError, KeyError, TypeError, binascii.Error) as exc:
        raise AppError(422, "invalid_cursor", "Invalid cursor") from exc
