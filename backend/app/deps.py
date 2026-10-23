"""FastAPI dependencies: services, DB session, authentication, rate limiting."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.firebase import AuthError
from app.db.models import User
from app.errors import AppError
from app.logging_config import user_id_var
from app.repositories.users import UserRepo
from app.services.container import Services
from app.services.ratelimit import DAY_BUCKET

_bearer = HTTPBearer(auto_error=False, description="Firebase ID token")


def get_services(request: Request) -> Services:
    services: Services = request.app.state.services
    return services


ServicesDep = Annotated[Services, Depends(get_services)]


async def get_session(svc: ServicesDep) -> AsyncIterator[AsyncSession]:
    async with svc.sessionmaker() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _unauthorized(code: str, message: str) -> AppError:
    return AppError(401, code, message, headers={"WWW-Authenticate": "Bearer"})


async def get_current_user(
    svc: ServicesDep,
    session: SessionDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    """Verifies the Firebase ID token on every call; identity comes ONLY from the token."""
    if creds is None or not creds.credentials:
        raise _unauthorized("unauthorized", "Missing bearer token")
    try:
        token = await svc.verifier.verify(creds.credentials)
    except AuthError:
        raise _unauthorized("invalid_token", "Invalid or expired token") from None
    if svc.settings.require_verified_email and token.email and not token.email_verified:
        raise _unauthorized("email_not_verified", "Email address is not verified")
    user = await UserRepo(session).upsert_from_token(token.uid, token.email, token.name)
    user_id_var.set(str(user.id))
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def rate_limit(
    bucket: str, per_min_setting: str, *, daily: bool = True
) -> Callable[..., Awaitable[User]]:
    """Dependency factory: authenticate, then enforce per-minute limit and daily quota."""

    async def _dep(svc: ServicesDep, user: CurrentUser) -> User:
        limit = int(getattr(svc.settings, per_min_setting))
        await svc.limiter.check(user.id, bucket, 60, limit)
        if daily:
            await svc.limiter.check(user.id, DAY_BUCKET, 86400, svc.settings.daily_quota)
        return user

    return _dep
