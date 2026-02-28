import { useState, useEffect } from 'react';
import { User, MapPin, Calendar, ChatCircle, BookOpen, Clock, Fire, Moon, Bell, CreditCard, SignOut, PencilSimple, Image } from 'phosphor-react';
import PillNav from '../../components/PillNav';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/router';
import { ProtectedRoute } from '../../components/ProtectedRoute';

interface UserProfile {
  fullname?: string;
  course?: string;
  degree?: string;
  college?: string;
  location?: string;
  createdAt?: { toDate?: () => Date } | string | Date;
}

function AccountPage() {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { user, signOut: firebaseSignOut, getUserProfile } = useAuth();
  const router = useRouter();

  const [emailUpdates, setEmailUpdates] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [historyCount, setHistoryCount] = useState<number | null>(null);

  // Load Firestore profile
  useEffect(() => {
    getUserProfile().then((p) => {
      if (p) setProfile(p as UserProfile);
    });
  }, [getUserProfile]);

  // Load real chat count from backend history
  useEffect(() => {
    if (!user?.uid) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    fetch(`${apiBase}/rag/session/history?firebase_uid=${encodeURIComponent(user.uid)}&limit=500`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setHistoryCount(data.length);
        else if (data?.items) setHistoryCount(data.items.length);
      })
      .catch(() => setHistoryCount(0));
  }, [user?.uid]);

  const handleLogout = async () => {
    try {
      await firebaseSignOut();
      router.push('/auth');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // ── Derived display values ───────────────────────────────────────────────
  const displayName =
    profile?.fullname ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'Student';

  const displayEmail = user?.email || '';

  const photoURL = (user as any)?.photoURL;

  // Parse join date from Firebase metadata
  const joinDateStr = (() => {
    const raw = (user as any)?.metadata?.creationTime;
    if (!raw) return 'Recently';
    const d = new Date(raw);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  })();

  const bio = [profile?.course, profile?.degree, profile?.college]
    .filter(Boolean)
    .join(' · ') || 'Student';

  const location = profile?.location || '';

  const totalChats = historyCount ?? '—';

  return (
    <div className="account-container">
      <PillNav />

      <div className="account-content">
        {/* Header */}
        <div className="account-header">
          <div className="account-breadcrumb">
            <span>User Profile</span>
            <span className="breadcrumb-separator">›</span>
            <span>Settings</span>
          </div>
          <h1 className="account-page-title">Account Overview</h1>
        </div>

        {/* Profile Section */}
        <div className="account-profile-card">
          <div className="account-profile-main">
            <div className="account-avatar">
              {photoURL ? (
                <img
                  src={photoURL}
                  alt={displayName}
                  style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <User size={48} weight="bold" />
              )}
              <div className="account-avatar-badge">
                <span>PRO</span>
              </div>
            </div>
            <div className="account-profile-info">
              <div className="account-profile-header">
                <h2 className="account-profile-name">{displayName}</h2>
                <span className="account-profile-badge">PRO STUDENT</span>
              </div>
              {displayEmail && (
                <p className="account-profile-email" style={{ fontSize: 13, color: '#888', margin: '2px 0 4px', fontFamily: 'Sora, sans-serif' }}>
                  {displayEmail}
                </p>
              )}
              <p className="account-profile-bio">{bio}</p>
              <div className="account-profile-meta">
                {location && (
                  <div className="account-meta-item">
                    <MapPin size={16} weight="bold" />
                    <span>{location}</span>
                  </div>
                )}
                <div className="account-meta-item">
                  <Calendar size={16} weight="bold" />
                  <span>Joined {joinDateStr}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="account-profile-actions">
            <button className="account-btn primary">
              <PencilSimple size={18} weight="bold" />
              Edit Profile
            </button>
            <button className="account-btn secondary">Download Data</button>
          </div>
        </div>

        {/* Academic Performance */}
        <div className="account-section">
          <div className="account-section-header">
            <h3 className="account-section-title">Academic Performance</h3>
            <button className="account-link-btn" onClick={() => router.push('/screens/history')}>
              View Full Report →
            </button>
          </div>

          <div className="account-stats-grid">
            <div className="account-stat-card">
              <div className="account-stat-icon chat">
                <ChatCircle size={24} weight="bold" />
              </div>
              <div className="account-stat-content">
                <div className="account-stat-label">Total Chats</div>
                <div className="account-stat-value">{totalChats}</div>
                <div className="account-stat-change positive">All sessions</div>
              </div>
            </div>

            <div className="account-stat-card">
              <div className="account-stat-icon topics">
                <BookOpen size={24} weight="bold" />
              </div>
              <div className="account-stat-content">
                <div className="account-stat-label">Topics Covered</div>
                <div className="account-stat-value">—</div>
                <div className="account-stat-change positive">View history</div>
              </div>
            </div>

            <div className="account-stat-card">
              <div className="account-stat-icon hours">
                <Clock size={24} weight="bold" />
              </div>
              <div className="account-stat-content">
                <div className="account-stat-label">Study Hours</div>
                <div className="account-stat-value">—</div>
                <div className="account-stat-change positive">Tracked soon</div>
              </div>
            </div>

            <div className="account-stat-card">
              <div className="account-stat-icon streak">
                <Fire size={24} weight="bold" />
              </div>
              <div className="account-stat-content">
                <div className="account-stat-label">Day Streak</div>
                <div className="account-stat-value">—</div>
                <div className="account-stat-change daily">DAILY</div>
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="account-two-column">
          {/* Subscription */}
          <div className="account-section">
            <h3 className="account-section-title">Premium Student Subscription</h3>
            <div className="account-subscription-card">
              <div className="account-subscription-info">
                <p className="account-subscription-text">
                  Enjoy unlimited AI responses, personalized learning paths, Knowledge Base uploads, and priority processing.
                </p>
                <div className="account-subscription-price">
                  <span className="account-price">Free</span>
                  <span className="account-price-period">/ Beta</span>
                </div>
              </div>
              <div className="account-subscription-actions">
                <button className="account-btn-link primary">
                  <CreditCard size={18} weight="bold" />
                  Manage Billing
                </button>
                <button className="account-btn-link danger">Upgrade Plan</button>
              </div>
            </div>
          </div>

          {/* Quick Settings */}
          <div className="account-section">
            <h3 className="account-section-title">Quick Settings</h3>
            <div className="account-settings-card">
              <div className="account-setting-item">
                <div className="account-setting-info">
                  <Moon size={20} weight="bold" />
                  <span className="account-setting-label">Dark Appearance</span>
                </div>
                <label className="account-toggle">
                  <input
                    type="checkbox"
                    checked={isDarkMode}
                    onChange={toggleDarkMode}
                  />
                  <span className="account-toggle-slider"></span>
                </label>
              </div>

              <div className="account-setting-item">
                <div className="account-setting-info">
                  <Bell size={20} weight="bold" />
                  <span className="account-setting-label">Email Updates</span>
                </div>
                <label className="account-toggle">
                  <input
                    type="checkbox"
                    checked={emailUpdates}
                    onChange={(e) => setEmailUpdates(e.target.checked)}
                  />
                  <span className="account-toggle-slider"></span>
                </label>
              </div>

              <button className="account-logout-btn" onClick={handleLogout}>
                <SignOut size={20} weight="bold" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Account() {
  return (
    <ProtectedRoute>
      <AccountPage />
    </ProtectedRoute>
  );
}
