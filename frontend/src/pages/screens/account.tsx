import { useState, useEffect } from 'react';
import { User, MapPin, Calendar, ChatCircle, BookOpen, Clock, Fire, Moon, Bell, CreditCard, SignOut, PencilSimple, Image } from 'phosphor-react';
import PillNav from '../../components/PillNav';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/router';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/apiClient';
import { formatMinutes } from '../../lib/stats-view';
import { localeFor } from '../../i18n';

interface UserProfile {
  fullname?: string;
  course?: string;
  degree?: string;
  college?: string;
  location?: string;
  createdAt?: string;
}

function AccountPage() {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage || i18n.language);
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { user, signOut: firebaseSignOut, getUserProfile } = useAuth();
  const router = useRouter();

  const [emailUpdates, setEmailUpdates] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const [streakDays, setStreakDays] = useState<number | null>(null);
  const [topicsCount, setTopicsCount] = useState<number | null>(null);
  const [studyMinutes, setStudyMinutes] = useState<number | null>(null);

  // Load profile from the API
  useEffect(() => {
    getUserProfile().then((p) => {
      if (p) setProfile(p as UserProfile);
    });
  }, [getUserProfile]);

  // Load chat count and streak from the API
  useEffect(() => {
    if (!user?.uid) return;
    api
      .getStats()
      .then((st) => {
        setHistoryCount(st.chat_count);
        setStreakDays(st.streak_days);
        if (st.by_subject) setTopicsCount(st.by_subject.length);
        if (st.study_minutes_by_subject) {
          setStudyMinutes(st.study_minutes_by_subject.reduce((a, s) => a + (Number.isFinite(s.minutes) ? s.minutes : 0), 0));
        }
      })
      .catch(() => setHistoryCount(0));
  }, [user?.uid]);

  const handleDownloadData = async () => {
    try {
      const data = await api.exportMe();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vidyaai-data-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert(t('account.exportFailed'));
    }
  };

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
    t('account.student');

  const displayEmail = user?.email || '';

  const photoURL = user?.photoURL;

  // Parse join date from Firebase metadata
  const joinDateStr = (() => {
    const raw = profile?.createdAt || user?.creationTime;
    if (!raw) return t('account.joinedRecently');
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? t('account.joinedRecently') : d.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
  })();

  const bio = [profile?.course, profile?.degree, profile?.college]
    .filter(Boolean)
    .join(' · ') || t('account.student');

  const location = profile?.location || '';

  const totalChats = historyCount ?? '—';

  return (
    <div className="account-container">
      <PillNav />

      <div className="account-content">
        {/* Header */}
        <div className="account-header">
          <div className="account-breadcrumb">
            <span>{t('account.breadcrumbProfile')}</span>
            <span className="breadcrumb-separator">›</span>
            <span>{t('account.breadcrumbSettings')}</span>
          </div>
          <h1 className="account-page-title">{t('account.title')}</h1>
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
                <span>{t('account.proBadge')}</span>
              </div>
            </div>
            <div className="account-profile-info">
              <div className="account-profile-header">
                <h2 className="account-profile-name">{displayName}</h2>
                <span className="account-profile-badge">{t('account.proStudent')}</span>
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
                  <span>{t('account.joined', { date: joinDateStr })}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="account-profile-actions">
            <button className="account-btn primary">
              <PencilSimple size={18} weight="bold" />
              {t('account.editProfile')}
            </button>
            <button className="account-btn secondary" onClick={handleDownloadData}>{t('account.downloadData')}</button>
          </div>
        </div>

        {/* Academic Performance */}
        <div className="account-section">
          <div className="account-section-header">
            <h3 className="account-section-title">{t('account.academic')}</h3>
            <button className="account-link-btn" onClick={() => router.push('/screens/history')}>
              {t('account.viewReport')}
            </button>
          </div>

          <div className="account-stats-grid">
            <div className="account-stat-card">
              <div className="account-stat-icon chat">
                <ChatCircle size={24} weight="bold" />
              </div>
              <div className="account-stat-content">
                <div className="account-stat-label">{t('account.totalChats')}</div>
                <div className="account-stat-value">{totalChats}</div>
                <div className="account-stat-change positive">{t('account.allSessions')}</div>
              </div>
            </div>

            <div className="account-stat-card">
              <div className="account-stat-icon topics">
                <BookOpen size={24} weight="bold" />
              </div>
              <div className="account-stat-content">
                <div className="account-stat-label">{t('account.topics')}</div>
                <div className="account-stat-value">{topicsCount ?? '—'}</div>
                <div className="account-stat-change positive">{t('account.viewHistory')}</div>
              </div>
            </div>

            <div className="account-stat-card">
              <div className="account-stat-icon hours">
                <Clock size={24} weight="bold" />
              </div>
              <div className="account-stat-content">
                <div className="account-stat-label">{t('account.studyHours')}</div>
                <div className="account-stat-value">{studyMinutes && studyMinutes > 0 ? formatMinutes(t, studyMinutes) : '—'}</div>
                <div className="account-stat-change positive">{studyMinutes === null ? t('account.trackedSoon') : t('account.allSessions')}</div>
              </div>
            </div>

            <div className="account-stat-card">
              <div className="account-stat-icon streak">
                <Fire size={24} weight="bold" />
              </div>
              <div className="account-stat-content">
                <div className="account-stat-label">{t('account.streak')}</div>
                <div className="account-stat-value">{streakDays ?? '—'}</div>
                <div className="account-stat-change daily">{t('account.daily')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="account-two-column">
          {/* Subscription */}
          <div className="account-section">
            <h3 className="account-section-title">{t('account.subscription')}</h3>
            <div className="account-subscription-card">
              <div className="account-subscription-info">
                <p className="account-subscription-text">
                  {t('account.subscriptionText')}
                </p>
                <div className="account-subscription-price">
                  <span className="account-price">{t('account.free')}</span>
                  <span className="account-price-period">{t('account.beta')}</span>
                </div>
              </div>
              <div className="account-subscription-actions">
                <button className="account-btn-link primary">
                  <CreditCard size={18} weight="bold" />
                  {t('account.manageBilling')}
                </button>
                <button className="account-btn-link danger">{t('account.upgrade')}</button>
              </div>
            </div>
          </div>

          {/* Quick Settings */}
          <div className="account-section">
            <h3 className="account-section-title">{t('account.quickSettings')}</h3>
            <div className="account-settings-card">
              <div className="account-setting-item">
                <div className="account-setting-info">
                  <Moon size={20} weight="bold" />
                  <span className="account-setting-label">{t('account.darkAppearance')}</span>
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
                  <span className="account-setting-label">{t('account.emailUpdates')}</span>
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
                {t('account.logout')}
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
