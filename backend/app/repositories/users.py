from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User

PROFILE_FIELDS = ("display_name", "course", "degree", "college", "location")


class UserRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def get(self, user_id: uuid.UUID) -> User | None:
        return await self.s.get(User, user_id)

    async def get_by_firebase_uid(self, uid: str) -> User | None:
        res = await self.s.execute(select(User).where(User.firebase_uid == uid))
        return res.scalar_one_or_none()

    async def upsert_from_token(self, uid: str, email: str | None, name: str | None) -> User:
        user = await self.get_by_firebase_uid(uid)
        if user is None:
            user = User(firebase_uid=uid, email=email, display_name=name)
            self.s.add(user)
            try:
                await self.s.commit()
            except IntegrityError:  # concurrent first request created it
                await self.s.rollback()
                user = await self.get_by_firebase_uid(uid)
                if user is None:  # pragma: no cover - defensive
                    raise
            return user
        if email and user.email != email:
            user.email = email
            await self.s.commit()
        return user

    async def update_profile(self, user: User, fields: dict[str, Any]) -> User:
        for key, value in fields.items():
            if key in PROFILE_FIELDS:
                setattr(user, key, value)
        await self.s.commit()
        return user

    async def delete(self, user_id: uuid.UUID) -> None:
        """Deletes the user row; all owned rows go via ON DELETE CASCADE."""
        await self.s.execute(delete(User).where(User.id == user_id))
        await self.s.commit()
