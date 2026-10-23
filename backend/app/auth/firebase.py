"""Firebase ID-token verification and admin actions, behind small interfaces."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any, Protocol

log = logging.getLogger("app.auth")


class AuthError(Exception):
    """Token missing/invalid/expired/wrong audience/unverified email."""


@dataclass(frozen=True)
class VerifiedToken:
    uid: str
    email: str | None
    name: str | None
    email_verified: bool


class TokenVerifier(Protocol):
    async def verify(self, token: str) -> VerifiedToken: ...


class AuthAdmin(Protocol):
    async def delete_user(self, uid: str) -> None: ...


class NullAuthAdmin:
    async def delete_user(self, uid: str) -> None:
        log.info("auth_admin_noop_delete")


def _init_firebase(service_account_json: str) -> Any:
    import firebase_admin
    from firebase_admin import credentials

    try:
        return firebase_admin.get_app()
    except ValueError:
        cred = credentials.Certificate(json.loads(service_account_json))
        return firebase_admin.initialize_app(cred)


class FirebaseVerifier:
    """Real verifier: audience/issuer/expiry are checked by firebase_admin (RS256, Google certs).

    check_revoked is intentionally off (it costs a network call per request).
    """

    def __init__(self, service_account_json: str) -> None:
        self._app = _init_firebase(service_account_json)

    def _verify_sync(self, token: str) -> dict[str, Any]:
        from firebase_admin import auth

        claims: dict[str, Any] = auth.verify_id_token(token, app=self._app, check_revoked=False)
        return claims

    async def verify(self, token: str) -> VerifiedToken:
        try:
            claims = await asyncio.to_thread(self._verify_sync, token)
        except Exception as exc:  # InvalidIdToken, ExpiredIdToken, CertificateFetchError, ...
            log.info("token_rejected", extra={"error_type": type(exc).__name__})
            raise AuthError("invalid token") from None
        uid = claims.get("uid") or claims.get("sub")
        if not uid:
            raise AuthError("token has no subject")
        return VerifiedToken(
            uid=str(uid),
            email=claims.get("email"),
            name=claims.get("name"),
            email_verified=bool(claims.get("email_verified", False)),
        )


class FirebaseAuthAdmin:
    def __init__(self, service_account_json: str) -> None:
        self._app = _init_firebase(service_account_json)

    def _delete_sync(self, uid: str) -> None:
        from firebase_admin import auth

        try:
            auth.delete_user(uid, app=self._app)
        except auth.UserNotFoundError:
            return

    async def delete_user(self, uid: str) -> None:
        await asyncio.to_thread(self._delete_sync, uid)
