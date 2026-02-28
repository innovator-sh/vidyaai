"""Session store — in-memory registry of active session memories."""

from memory.session_memory import SessionMemory
from typing import Dict

_active_sessions: Dict[str, SessionMemory] = {}


def get_session(session_id: str) -> SessionMemory:
    """Get or create a SessionMemory for the given session ID."""
    if session_id not in _active_sessions:
        _active_sessions[session_id] = SessionMemory()
    return _active_sessions[session_id]


def destroy_session(session_id: str) -> None:
    """Remove a session's memory (called at session end)."""
    _active_sessions.pop(session_id, None)


def has_session(session_id: str) -> bool:
    """Check if a session exists."""
    return session_id in _active_sessions
