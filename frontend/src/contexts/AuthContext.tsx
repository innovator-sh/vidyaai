/**
 * Authentication context backed by Firebase Auth.
 *
 * Identity lives entirely in the Firebase SDK (its own persistence). We keep no
 * session tokens or user blobs in localStorage; API calls obtain a fresh ID token
 * through `getIdToken()` / `apiClient`.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, createGoogleProvider } from '@/lib/firebase';
import { api, ApiError } from '@/lib/apiClient';

// ── Types ──────────────────────────────────────────────────────────────────

interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  emailVerified: boolean;
  /** Firebase account creation time (ISO-ish string) */
  creationTime: string | null;
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

type ProfileInput = Omit<UserProfile, 'uid' | 'email' | 'createdAt'>;

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, profile: ProfileInput) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  getUserProfile: () => Promise<UserProfile | null>;
  updateUserProfile: (profile: ProfileInput) => Promise<UserProfile | null>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  /** Reloads the Firebase user and refreshes the ID token (call after the user verified their email). */
  refreshUser: () => Promise<void>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const PENDING_PROFILE_KEY = 'vidyaai_pending_profile'; // sessionStorage, non-secret profile fields only

function mapUser(u: FirebaseUser): AppUser {
  return {
    uid: u.uid,
    email: u.email ?? '',
    displayName: u.displayName ?? '',
    photoURL: u.photoURL,
    emailVerified: u.emailVerified,
    creationTime: u.metadata?.creationTime ?? null,
  };
}

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-not-found': 'Invalid email or password.',
  'auth/wrong-password': 'Invalid email or password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a bit and try again.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled.',
  'auth/popup-blocked': 'Your browser blocked the sign-in popup. Please allow popups and try again.',
  'auth/user-disabled': 'This account has been disabled.',
};

function friendlyAuthError(err: unknown): Error {
  const code = (err as { code?: string })?.code;
  if (code && AUTH_MESSAGES[code]) return new Error(AUTH_MESSAGES[code]);
  if (err instanceof Error && !code) return err;
  return new Error('Something went wrong. Please try again.');
}

function requireAuth() {
  if (!auth) {
    throw new Error('Authentication is not configured for this deployment.');
  }
  return auth;
}

function toProfileBody(profile: ProfileInput) {
  return {
    display_name: profile.fullname || undefined,
    course: profile.course || undefined,
    degree: profile.degree || undefined,
    college: profile.college || undefined,
    location: profile.location || undefined,
  };
}

function readPendingProfile(): ProfileInput | null {
  try {
    const raw = sessionStorage.getItem(PENDING_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as ProfileInput) : null;
  } catch {
    return null;
  }
}

function writePendingProfile(profile: ProfileInput | null) {
  try {
    if (profile) sessionStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(profile));
    else sessionStorage.removeItem(PENDING_PROFILE_KEY);
  } catch {
    /* storage unavailable */
  }
}

// ── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(auth));

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser ? mapUser(fbUser) : null);
      setLoading(false);
    });
  }, []);

  // Apply the profile collected at registration once the email is verified
  // (the API rejects tokens of unverified accounts).
  const verified = user?.emailVerified ?? false;
  useEffect(() => {
    if (!verified) return;
    const pending = readPendingProfile();
    if (!pending) return;
    api
      .updateMe(toProfileBody(pending))
      .then(() => writePendingProfile(null))
      .catch((err) => {
        // Keep it for the next load unless the server says it's invalid.
        if (err instanceof ApiError && err.status === 422) writePendingProfile(null);
      });
  }, [verified]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(requireAuth(), email.trim(), password);
    } catch (err) {
      throw friendlyAuthError(err);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, profile: ProfileInput) => {
    try {
      const a = requireAuth();
      const cred = await createUserWithEmailAndPassword(a, email.trim(), password);
      if (profile.fullname) {
        await updateProfile(cred.user, { displayName: profile.fullname });
      }
      writePendingProfile(profile);
      await sendEmailVerification(cred.user);
      setUser(mapUser(cred.user));
    } catch (err) {
      throw friendlyAuthError(err);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(requireAuth(), createGoogleProvider());
    } catch (err) {
      throw friendlyAuthError(err);
    }
  }, []);

  const signOut = useCallback(async () => {
    writePendingProfile(null);
    if (auth) await fbSignOut(auth);
  }, []);

  const getIdToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    const u = auth?.currentUser;
    return u ? u.getIdToken(forceRefresh) : null;
  }, []);

  const getUserProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (!auth?.currentUser?.emailVerified) return null;
    try {
      const me = await api.getMe();
      return {
        uid: me.id,
        email: me.email ?? '',
        fullname: me.display_name ?? undefined,
        course: me.course ?? undefined,
        degree: me.degree ?? undefined,
        college: me.college ?? undefined,
        location: me.location ?? undefined,
        createdAt: me.created_at,
      };
    } catch {
      return null;
    }
  }, []);

  const updateUserProfile = useCallback(async (profile: ProfileInput): Promise<UserProfile | null> => {
    await api.updateMe(toProfileBody(profile));
    return getUserProfile();
  }, [getUserProfile]);

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(requireAuth(), email.trim());
    } catch (err) {
      throw friendlyAuthError(err);
    }
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    try {
      const u = requireAuth().currentUser;
      if (!u) throw new Error('You are not signed in.');
      await sendEmailVerification(u);
    } catch (err) {
      throw friendlyAuthError(err);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const u = auth?.currentUser;
    if (!u) return;
    await u.reload();
    await u.getIdToken(true); // pick up the email_verified claim
    setUser(mapUser(u));
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      getIdToken,
      getUserProfile,
      updateUserProfile,
      sendPasswordReset,
      resendVerificationEmail,
      refreshUser,
    }),
    [user, loading, signIn, signUp, signInWithGoogle, signOut, getIdToken, getUserProfile, updateUserProfile, sendPasswordReset, resendVerificationEmail, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
