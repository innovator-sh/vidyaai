"""User database manager for Firebase UID to student ID mapping.

This module manages the SQLite database that maps Firebase UIDs to internal
student IDs. It provides methods to create, retrieve, and manage user records.
"""

import sqlite3
import os
import logging
import uuid
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Database file path
DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "db_data")
DB_PATH = os.path.join(DB_DIR, "users.db")


class UserManager:
    """Manages user records and Firebase UID to student ID mapping.
    
    This class provides methods to create and query the users table in SQLite,
    which stores the mapping between Firebase UIDs and internal student IDs.
    """
    
    def __init__(self, db_path: str = DB_PATH):
        """Initialize UserManager with database path.
        
        Args:
            db_path: Path to SQLite database file (default: DB_PATH)
        """
        self.db_path = db_path
        self._ensure_db_directory()
        self._create_table()
    
    def _ensure_db_directory(self):
        """Ensure the database directory exists."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
    
    def _get_connection(self) -> sqlite3.Connection:
        """Get a database connection.
        
        Returns:
            sqlite3.Connection: Database connection
        """
        return sqlite3.connect(self.db_path)
    
    def _create_table(self):
        """Create the users table if it doesn't exist."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Create users table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    firebase_uid TEXT UNIQUE NOT NULL,
                    student_id TEXT UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Create indexes for faster lookups
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_firebase_uid 
                ON users(firebase_uid)
            """)
            
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_student_id 
                ON users(student_id)
            """)
            
            conn.commit()
            conn.close()
            logger.info("Users table and indexes created successfully")
            
        except sqlite3.Error as e:
            logger.error(f"Error creating users table: {e}")
            raise
    
    def get_or_create_student_id(self, firebase_uid: str) -> str:
        """Get existing student_id or create new mapping for Firebase UID.
        
        This method implements the core mapping logic. If a Firebase UID already
        has a student_id, it returns the existing one. Otherwise, it creates a
        new student_id and stores the mapping.
        
        Args:
            firebase_uid: Firebase UID to map
            
        Returns:
            str: Student ID (existing or newly created)
            
        Raises:
            sqlite3.Error: If database operation fails
        """
        # First, try to get existing student_id
        existing_student_id = self.get_student_id(firebase_uid)
        if existing_student_id:
            return existing_student_id
        
        # Create new student_id
        student_id = f"student_{uuid.uuid4().hex[:12]}"
        
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO users (firebase_uid, student_id, created_at, updated_at)
                VALUES (?, ?, ?, ?)
            """, (firebase_uid, student_id, datetime.now(), datetime.now()))
            
            conn.commit()
            conn.close()
            
            logger.info(f"Created new student_id mapping: {firebase_uid} -> {student_id}")
            return student_id
            
        except sqlite3.IntegrityError as e:
            # Handle race condition: another process may have created the mapping
            logger.warning(f"Integrity error creating mapping, fetching existing: {e}")
            existing_student_id = self.get_student_id(firebase_uid)
            if existing_student_id:
                return existing_student_id
            raise
        except sqlite3.Error as e:
            logger.error(f"Error creating student_id mapping: {e}")
            raise
    
    def get_student_id(self, firebase_uid: str) -> Optional[str]:
        """Retrieve student_id for given Firebase UID.
        
        Args:
            firebase_uid: Firebase UID to look up
            
        Returns:
            Optional[str]: Student ID if found, None otherwise
            
        Raises:
            sqlite3.Error: If database operation fails
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT student_id FROM users WHERE firebase_uid = ?
            """, (firebase_uid,))
            
            result = cursor.fetchone()
            conn.close()
            
            if result:
                return result[0]
            return None
            
        except sqlite3.Error as e:
            logger.error(f"Error retrieving student_id: {e}")
            raise
    
    def get_firebase_uid(self, student_id: str) -> Optional[str]:
        """Retrieve Firebase UID for given student_id (reverse lookup).
        
        Args:
            student_id: Student ID to look up
            
        Returns:
            Optional[str]: Firebase UID if found, None otherwise
            
        Raises:
            sqlite3.Error: If database operation fails
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT firebase_uid FROM users WHERE student_id = ?
            """, (student_id,))
            
            result = cursor.fetchone()
            conn.close()
            
            if result:
                return result[0]
            return None
            
        except sqlite3.Error as e:
            logger.error(f"Error retrieving firebase_uid: {e}")
            raise
    
    def user_exists(self, firebase_uid: str) -> bool:
        """Check if a user with given Firebase UID exists.
        
        Args:
            firebase_uid: Firebase UID to check
            
        Returns:
            bool: True if user exists, False otherwise
        """
        return self.get_student_id(firebase_uid) is not None
