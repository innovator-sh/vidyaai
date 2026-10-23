/**
 * Protected Route Component
 *
 * Wraps pages that require authentication. Redirects to /auth when signed out and,
 * because the API only accepts tokens of verified accounts, shows a verification
 * prompt for email/password users who have not confirmed their address yet.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const centered: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '100vh',
  fontFamily: 'Sora, sans-serif',
  padding: '16px',
};

function VerifyEmailPrompt() {
  const { user, resendVerificationEmail, refreshUser, signOut } = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, okMessage: string) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      setMessage(okMessage);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const btn: React.CSSProperties = {
    padding: '10px 16px',
    border: '2px solid #000',
    borderRadius: 8,
    background: '#fff',
    fontFamily: 'Sora, sans-serif',
    cursor: busy ? 'default' : 'pointer',
  };

  return (
    <div style={centered}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8 }}>Verify your email</h2>
        <p style={{ marginBottom: 16 }}>
          We sent a verification link to <strong>{user?.email}</strong>. Open it, then come back and continue.
        </p>
        {message && <p style={{ marginBottom: 12, fontSize: 14 }}>{message}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button style={btn} disabled={busy} onClick={() => run(refreshUser, 'Checked. If you verified, you will be let in shortly.')}>
            I have verified
          </button>
          <button style={btn} disabled={busy} onClick={() => run(resendVerificationEmail, 'Verification email sent.')}>
            Resend email
          </button>
          <button
            style={btn}
            disabled={busy}
            onClick={async () => {
              await signOut();
              router.replace('/auth');
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Only redirect once and only if not loading and no user
    if (!loading && !user && !hasRedirected.current) {
      hasRedirected.current = true;
      router.replace('/auth');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={centered}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  if (!user.emailVerified) return <VerifyEmailPrompt />;

  return <>{children}</>;
};
