"""User database manager — now handles SQLite auth (register/login/sessions).

Schema:
  users(id, user_id, email, password_hash, fullname, course, degree, college, location, created_at)
  sessions(session_token, user_id, created_at)
"""

import sqlite3
import os
import logging
import uuid
import hashlib
import hmac
from typing import Optional, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "db_data")
DB_PATH = os.path.join(DB_DIR, "users.db")

# Salt for password hashing — MVP only, not production-grade
_PASSWORD_SALT = "vidyaai_mvp_salt_2026"


def _hash_password(password: str) -> str:
    """Simple SHA-256 hash with salt — good enough for an MVP hackathon."""
    salted = (_PASSWORD_SALT + password).encode("utf-8")
    return hashlib.sha256(salted).hexdigest()


def _verify_password(password: str, password_hash: str) -> bool:
    return hmac.compare_digest(_hash_password(password), password_hash)


class UserManager:
    """Manages users and sessions entirely in SQLite — no Firebase."""

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._create_tables()

    # ── Internal helpers ───────────────────────────────────────────────────

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _create_tables(self):
        try:
            conn = self._conn()
            cur = conn.cursor()

            # Users table — stores credentials + profile
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id       TEXT UNIQUE NOT NULL,
                    student_id    TEXT UNIQUE NOT NULL,
                    email         TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    fullname      TEXT DEFAULT '',
                    course        TEXT DEFAULT '',
                    degree        TEXT DEFAULT '',
                    college       TEXT DEFAULT '',
                    location      TEXT DEFAULT '',
                    created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at    TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Check if this is an old schema missing the email column
            existing_cols_cur = conn.execute("PRAGMA table_info(users)")
            existing_cols = {row["name"] for row in existing_cols_cur.fetchall()}

            if "email" not in existing_cols:
                # Old schema: rename and recreate with the new schema
                cur.execute("ALTER TABLE users RENAME TO users_old")
                cur.execute("""
                    CREATE TABLE users (
                        id            INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id       TEXT UNIQUE NOT NULL,
                        student_id    TEXT UNIQUE NOT NULL,
                        email         TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL DEFAULT '',
                        fullname      TEXT DEFAULT '',
                        course        TEXT DEFAULT '',
                        degree        TEXT DEFAULT '',
                        college       TEXT DEFAULT '',
                        location      TEXT DEFAULT '',
                        created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at    TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                # Migrate old rows using student_id as a fake email so UNIQUE constraints pass
                try:
                    cur.execute("""
                        INSERT INTO users (user_id, student_id, email, password_hash, created_at)
                        SELECT
                            COALESCE(firebase_uid, student_id),
                            student_id,
                            student_id || '@legacy.vidyaai',
                            '',
                            created_at
                        FROM users_old
                    """)
                except Exception:
                    pass  # Ignore migration failures for old orphan rows
                cur.execute("DROP TABLE users_old")


            # Sessions table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_token TEXT PRIMARY KEY,
                    user_id       TEXT NOT NULL,
                    created_at    TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)

            cur.execute("CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_users_user_id  ON users(user_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id)")

            conn.commit()
        except sqlite3.Error as e:
            logger.error(f"Error creating tables: {e}")
            raise
        finally:
            conn.close()

    # ── Auth methods ───────────────────────────────────────────────────────

    def register(
        self,
        email: str,
        password: str,
        fullname: str = "",
        course: str = "",
        degree: str = "",
        college: str = "",
        location: str = "",
    ) -> Dict[str, Any]:
        """Create a new user. Returns user_id + session_token.
        Raises ValueError if email already taken.
        """
        user_id = f"user_{uuid.uuid4().hex}"
        student_id = f"student_{uuid.uuid4().hex[:12]}"
        password_hash = _hash_password(password)
        now = datetime.utcnow().isoformat()

        conn = self._conn()
        try:
            conn.execute("""
                INSERT INTO users
                    (user_id, student_id, email, password_hash, fullname, course, degree, college, location, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, student_id, email.lower(), password_hash, fullname, course, degree, college, location, now, now))
            conn.commit()
        except sqlite3.IntegrityError:
            raise ValueError(f"An account with email '{email}' already exists.")
        finally:
            conn.close()

        session_token = self._create_session(user_id)
        return {
            "user_id": user_id,
            "student_id": student_id,
            "session_token": session_token,
            "email": email.lower(),
            "fullname": fullname,
        }

    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Verify credentials and return user_id + session_token.
        Raises ValueError on bad credentials.
        """
        conn = self._conn()
        try:
            cur = conn.execute(
                "SELECT user_id, student_id, email, password_hash, fullname FROM users WHERE email = ?",
                (email.lower(),)
            )
            row = cur.fetchone()
        finally:
            conn.close()

        if not row or not _verify_password(password, row["password_hash"]):
            raise ValueError("Invalid email or password.")

        session_token = self._create_session(row["user_id"])
        return {
            "user_id": row["user_id"],
            "student_id": row["student_id"],
            "session_token": session_token,
            "email": row["email"],
            "fullname": row["fullname"],
        }

    def logout(self, session_token: str):
        """Destroy a session token."""
        conn = self._conn()
        try:
            conn.execute("DELETE FROM sessions WHERE session_token = ?", (session_token,))
            conn.commit()
        finally:
            conn.close()

    def get_user_by_session(self, session_token: str) -> Optional[Dict[str, Any]]:
        """Look up user info from a session token. Returns None if invalid."""
        conn = self._conn()
        try:
            cur = conn.execute("""
                SELECT u.user_id, u.student_id, u.email, u.fullname,
                       u.course, u.degree, u.college, u.location, u.created_at
                FROM sessions s
                JOIN users u ON u.user_id = s.user_id
                WHERE s.session_token = ?
            """, (session_token,))
            row = cur.fetchone()
            if row:
                return dict(row)
            return None
        finally:
            conn.close()

    def get_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get the full profile for a user_id."""
        conn = self._conn()
        try:
            cur = conn.execute("""
                SELECT user_id, student_id, email, fullname, course, degree, college, location, created_at
                FROM users WHERE user_id = ?
            """, (user_id,))
            row = cur.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    # ── Legacy compatibility (firebase_uid ≡ user_id now) ─────────────────

    def get_or_create_student_id(self, user_id: str) -> str:
        """Map user_id → student_id (creates a mapping row if missing).
        Kept for backward compatibility with history/RAG endpoints that
        previously accepted firebase_uid.
        """
        conn = self._conn()
        try:
            cur = conn.execute("SELECT student_id FROM users WHERE user_id = ?", (user_id,))
            row = cur.fetchone()
            if row:
                return row["student_id"]

            # Fallback: treat user_id as a legacy firebase_uid in the old schema
            cur2 = conn.execute("SELECT student_id FROM users WHERE student_id LIKE 'student_%' LIMIT 1")
            # If not found at all, create an orphan student record
            student_id = f"student_{uuid.uuid4().hex[:12]}"
            try:
                conn.execute(
                    "INSERT INTO users (user_id, student_id, email, password_hash) VALUES (?, ?, ?, ?)",
                    (user_id, student_id, f"{user_id}@legacy.vidyaai", "")
                )
                conn.commit()
            except sqlite3.IntegrityError:
                pass
            return student_id
        finally:
            conn.close()

    # ── Internal session helper ────────────────────────────────────────────

    def _create_session(self, user_id: str) -> str:
        token = uuid.uuid4().hex + uuid.uuid4().hex  # 64-char random token
        conn = self._conn()
        try:
            conn.execute(
                "INSERT INTO sessions (session_token, user_id) VALUES (?, ?)",
                (token, user_id)
            )
            conn.commit()
        finally:
            conn.close()
        return token
