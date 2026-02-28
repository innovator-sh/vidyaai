"""Auth endpoints — /auth/register, /auth/login, /auth/logout, /auth/me."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from db.user_manager import UserManager

router = APIRouter(prefix="/auth")
user_manager = UserManager()


# ── Request / Response models ──────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    fullname: str = ""
    course: str = ""
    degree: str = ""
    college: str = ""
    location: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    user_id: str
    session_token: str
    email: str
    fullname: str


# ── Routes ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse)
async def register(req: RegisterRequest):
    """Create a new account and return a session token."""
    try:
        result = user_manager.register(
            email=req.email,
            password=req.password,
            fullname=req.fullname,
            course=req.course,
            degree=req.degree,
            college=req.college,
            location=req.location,
        )
        return AuthResponse(
            user_id=result["user_id"],
            session_token=result["session_token"],
            email=result["email"],
            fullname=result["fullname"],
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    """Verify credentials and return a session token."""
    try:
        result = user_manager.login(email=req.email, password=req.password)
        return AuthResponse(
            user_id=result["user_id"],
            session_token=result["session_token"],
            email=result["email"],
            fullname=result["fullname"],
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


@router.post("/logout")
async def logout(session_token: str):
    """Destroy the session token."""
    user_manager.logout(session_token)
    return {"status": "logged_out"}


@router.get("/me")
async def me(session_token: str):
    """Return the profile for a valid session token."""
    profile = user_manager.get_user_by_session(session_token)
    if not profile:
        raise HTTPException(status_code=401, detail="Invalid or expired session token.")
    return profile
