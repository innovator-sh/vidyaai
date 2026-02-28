"""Firebase Admin SDK configuration module.

This module initializes the Firebase Admin SDK for server-side authentication
and token verification. It loads credentials from environment variables and
provides a singleton instance of the Firebase Admin Auth client.
"""

import os
import logging
from typing import Optional
import firebase_admin
from firebase_admin import credentials, auth

logger = logging.getLogger(__name__)

_firebase_app: Optional[firebase_admin.App] = None


def get_firebase_admin() -> auth.Client:
    """Initialize and return Firebase Admin Auth client.
    
    This function implements a singleton pattern to ensure Firebase Admin SDK
    is initialized only once. It loads service account credentials from the
    path specified in the FIREBASE_SERVICE_ACCOUNT_PATH environment variable.
    
    Returns:
        auth.Client: Initialized Firebase Admin Auth client
        
    Raises:
        ValueError: If FIREBASE_SERVICE_ACCOUNT_PATH environment variable is not set
        FileNotFoundError: If service account file doesn't exist
        Exception: If Firebase Admin SDK initialization fails
    """
    global _firebase_app
    
    if _firebase_app is not None:
        return auth
    
    # Get service account path from environment
    service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
    
    if not service_account_path:
        error_msg = (
            "FIREBASE_SERVICE_ACCOUNT_PATH environment variable is not set. "
            "Please set it to the path of your Firebase service account JSON file."
        )
        logger.error(error_msg)
        raise ValueError(error_msg)
    
    # Check if file exists
    if not os.path.exists(service_account_path):
        error_msg = (
            f"Firebase service account file not found at: {service_account_path}. "
            "Please ensure the file exists and the path is correct."
        )
        logger.error(error_msg)
        raise FileNotFoundError(error_msg)
    
    try:
        # Initialize Firebase Admin SDK
        cred = credentials.Certificate(service_account_path)
        _firebase_app = firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialized successfully")
        return auth
        
    except Exception as e:
        error_msg = f"Failed to initialize Firebase Admin SDK: {str(e)}"
        logger.error(error_msg)
        raise Exception(error_msg) from e


def verify_id_token(id_token: str) -> dict:
    """Verify a Firebase ID token and return the decoded token.
    
    Args:
        id_token: Firebase ID token to verify
        
    Returns:
        dict: Decoded token containing user information (uid, email, etc.)
        
    Raises:
        auth.InvalidIdTokenError: If token is invalid
        auth.ExpiredIdTokenError: If token has expired
        Exception: For other verification errors
    """
    firebase_auth = get_firebase_admin()
    return firebase_auth.verify_id_token(id_token)
