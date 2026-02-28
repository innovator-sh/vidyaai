/**
 * Authentication Context — SQLite backend edition
 *
 * All auth goes through the Python backend (/auth/*).
 * Session token + user info are stored in localStorage.
 * No Firebase dependency.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const BACKEND = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SESSION_KEY = 'vidyaai_session_token';
const USER_KEY = 'vidyaai_user';

// ── Types ──────────────────────────────────────────────────────────────────

interface AppUser {
  uid: string;          // = user_id from backend
  email: string;
  displayName: string;  // = fullname
}

interface UserProfile {
  uid: string;
  email: string;
  fullname?: string;
  course?: string;
  degree?: string;
  college?: string;
  location?: string;
  createdAt?: string;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    profile: Omit<UserProfile, 'uid' | 'email' | 'createdAt'>
  ) => Promise<void>;
  /** Not supported in SQLite MVP — kept for API compatibility */
  signInWithGoogle: () => Promise<void>;
  /** Not supported in SQLite MVP — kept for API compatibility */
  signInWithFacebook: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  getUserProfile: () => Promise<UserProfile | null>;
}

// ── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

// ── Helper ─────────────────────────────────────────────────────────────────

async function backendCall(path: string, method: string, body?: object) {
  const res = await fetch(`${BACKEND}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

// ── Provider ───────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY);
    const cached = localStorage.getItem(USER_KEY);
    if (token && cached) {
      try {
        setUser(JSON.parse(cached));
      } catch { /* ignore corrupt cache */ }
    }
    // Validate token with backend
    if (token) {
      fetch(`${BACKEND}/auth/me?session_token=${token}`)
        .then(r => r.ok ? r.json() : null)
        .then(profile => {
          if (profile) {
            const u: AppUser = {
              uid: profile.user_id,
              email: profile.email,
              displayName: profile.fullname || '',
            };
            setUser(u);
            localStorage.setItem(USER_KEY, JSON.stringify(u));
          } else {
            // Token expired/invalid
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(USER_KEY);
            setUser(null);
          }
        })
        .catch(() => { /* offline — keep cached user */ })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await backendCall('/auth/login', 'POST', { email, password });
    const u: AppUser = { uid: data.user_id, email: data.email, displayName: data.fullname || '' };
    localStorage.setItem(SESSION_KEY, data.session_token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const signUp = useCallback(async (
    email: string,
    password: string,
    profile: Omit<UserProfile, 'uid' | 'email' | 'createdAt'>
  ) => {
    const data = await backendCall('/auth/register', 'POST', {
      email,
      password,
      fullname: profile.fullname || '',
      course: profile.course || '',
      degree: profile.degree || '',
      college: profile.college || '',
      location: profile.location || '',
    });
    const u: AppUser = { uid: data.user_id, email: data.email, displayName: data.fullname || '' };
    localStorage.setItem(SESSION_KEY, data.session_token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    throw new Error('Google login is not available in this version.');
  }, []);

  const signInWithFacebook = useCallback(async () => {
    throw new Error('Facebook login is not available in this version.');
  }, []);

  const signOut = useCallback(async () => {
    const token = localStorage.getItem(SESSION_KEY);
    if (token) {
      fetch(`${BACKEND}/auth/logout?session_token=${token}`, { method: 'POST' }).catch(() => { });
    }
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    return localStorage.getItem(SESSION_KEY);
  }, []);

  const getUserProfile = useCallback(async (): Promise<UserProfile | null> => {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) return null;
    try {
      const data = await fetch(`${BACKEND}/auth/me?session_token=${token}`).then(r => r.json());
      return {
        uid: data.user_id,
        email: data.email,
        fullname: data.fullname,
        course: data.course,
        degree: data.degree,
        college: data.college,
        location: data.location,
        createdAt: data.created_at,
      };
    } catch {
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading,
      signIn, signUp,
      signInWithGoogle, signInWithFacebook,
      signOut, getIdToken, getUserProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
