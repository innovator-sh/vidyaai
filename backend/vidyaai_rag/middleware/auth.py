"""Authentication middleware for Firebase ID token verification.

This middleware verifies Firebase ID tokens on all protected routes, ensuring
only authenticated users can access the RAG pipeline endpoints.
"""

import logging
from fastapi import Request, HTTPException
from firebase_admin import auth
from config.firebase_admin import get_firebase_admin

logger = logging.getLogger(__name__)

# Routes that bypass authentication
UNPROTECTED_ROUTES = ["/", "/health", "/docs", "/openapi.json", "/redoc"]


async def verify_firebase_token(request: Request, call_next):
    """Middleware to verify Firebase ID tokens on protected routes.
    
    This middleware extracts the ID token from the Authorization header,
    verifies it using Firebase Admin SDK, and attaches the Firebase UID
    to the request state for downstream use.
    
    Args:
        request: FastAPI Request object
        call_next: Next middleware/route handler in the chain
        
    Returns:
        Response from the next handler
        
    Raises:
        HTTPException: 401 if token is missing, invalid, or expired
                      503 if Firebase service is unavailable
    """
    # Skip verification for unprotected routes
    if request.url.path in UNPROTECTED_ROUTES:
        return await call_next(request)
    
    # Extract token from Authorization header
    auth_header = request.headers.get("Authorization")
    
    if not auth_header:
        logger.warning(f"Missing Authorization header from {request.client.host}")
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header. Please include a valid Firebase ID token."
        )
    
    if not auth_header.startswith("Bearer "):
        logger.warning(f"Invalid Authorization header format from {request.client.host}")
        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header format. Expected 'Bearer <token>'"
        )
    
    # Extract token
    token = auth_header.split("Bearer ")[1].strip()
    
    if not token:
        logger.warning(f"Empty token from {request.client.host}")
        raise HTTPException(
            status_code=401,
            detail="Empty authentication token"
        )
    
    try:
        # Initialize Firebase Admin SDK
        get_firebase_admin()
        
        # Verify token with Firebase Admin SDK
        decoded_token = auth.verify_id_token(token)
        firebase_uid = decoded_token.get("uid")
        
        if not firebase_uid:
            logger.error("Token verified but no UID found")
            raise HTTPException(
                status_code=401,
                detail="Invalid token: missing user ID"
            )
        
        # Attach Firebase UID to request state for downstream use
        request.state.firebase_uid = firebase_uid
        
        logger.debug(f"Token verified successfully for user: {firebase_uid}")
        return await call_next(request)
        
    except auth.InvalidIdTokenError as e:
        logger.warning(f"Invalid ID token from {request.client.host}: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token. Please sign in again."
        )
    except auth.ExpiredIdTokenError as e:
        logger.warning(f"Expired ID token from {request.client.host}: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail="Authentication token has expired. Please sign in again."
        )
    except auth.RevokedIdTokenError as e:
        logger.warning(f"Revoked ID token from {request.client.host}: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail="Authentication token has been revoked. Please sign in again."
        )
    except auth.CertificateFetchError as e:
        logger.error(f"Firebase certificate fetch error: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail="Unable to verify authentication token. Please try again in a moment."
        )
    except Exception as e:
        logger.error(f"Unexpected error verifying token: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail="Unable to verify authentication token. Please try again."
        )
