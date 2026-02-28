"""Auth middleware — simplified for SQLite auth MVP.

Firebase has been replaced with SQLite-based auth. All route-level
identification now uses `firebase_uid` query param (which is actually
the SQLite user_id). This middleware is a pass-through that just
extracts the user_id from query params and attaches it to request state.
No token verification needed — routes handle their own auth as needed.
"""

import logging
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request

logger = logging.getLogger(__name__)


async def verify_firebase_token(request: Request, call_next):
    """Pass-through middleware — no Firebase token verification.

    Extracts `firebase_uid` (SQLite user_id) from query params and
    attaches to request.state for any downstream route that needs it.
    All routes are allowed through.
    """
    # Attach user_id from query param to request state (optional convenience)
    user_id = request.query_params.get("firebase_uid", "")
    request.state.firebase_uid = user_id

    return await call_next(request)
