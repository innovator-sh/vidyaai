import { useState } from 'react';
import { User, MapPin, Calendar, ChatCircle, BookOpen, Clock, Fire, Moon, Bell, CreditCard, SignOut, PencilSimple } from 'phosphor-react';
import PillNav from '../../components/PillNav';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/router';
import { ProtectedRoute } from '../../components/ProtectedRoute';

function AccountPage() {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { signOut: firebaseSignOut } = useAuth();
  const router = useRouter();
  const [emailUpdates, setEmailUpdates] = useState(true);

  const handleLogout = async () => {
    try {
      await firebaseSignOut();
      router.push('/auth');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

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
              <User size={48} weight="bold" />
              <div className="account-avatar-badge">
                <span>PRO</span>
              </div>
            </div>
            <div className="account-profile-info">
              <div className="account-profile-header">
                <h2 className="account-profile-name">vedanth@vidyaai.com</h2>
                <span className="account-profile-badge">PRO STUDENT</span>
              </div>
              <p className="account-profile-bio">Computer Science Student at MIT ADT</p>
              <div className="account-profile-meta">
                <div className="account-meta-item">
                  <MapPin size={16} weight="bold" />
                  <span>Navi Mumbai, Maharashta</span>
                </div>
                <div className="account-meta-item">
                  <Calendar size={16} weight="bold" />
                  <span>Joined Feb 2026</span>
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
            <button className="account-link-btn">
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
                <div className="account-stat-value">128</div>
                <div className="account-stat-change positive">+12%</div>
              </div>
            </div>

            <div className="account-stat-card">
              <div className="account-stat-icon topics">
                <BookOpen size={24} weight="bold" />
              </div>
              <div className="account-stat-content">
                <div className="account-stat-label">Topics Covered</div>
                <div className="account-stat-value">12</div>
                <div className="account-stat-change positive">+2</div>
              </div>
            </div>

            <div className="account-stat-card">
              <div className="account-stat-icon hours">
                <Clock size={24} weight="bold" />
              </div>
              <div className="account-stat-content">
                <div className="account-stat-label">Study Hours</div>
                <div className="account-stat-value">45h</div>
                <div className="account-stat-change positive">+8h</div>
              </div>
            </div>

            <div className="account-stat-card">
              <div className="account-stat-icon streak">
                <Fire size={24} weight="bold" />
              </div>
              <div className="account-stat-content">
                <div className="account-stat-label">Day Streak</div>
                <div className="account-stat-value">7 Days</div>
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
                  Your subscription renews on <strong>November 12, 2024</strong>. Enjoy unlimited AI responses, offline notes, and priority processing.
                </p>
                <div className="account-subscription-price">
                  <span className="account-price">$9.99</span>
                  <span className="account-price-period">/per month</span>
                </div>
              </div>
              <div className="account-subscription-actions">
                <button className="account-btn-link primary">
                  <CreditCard size={18} weight="bold" />
                  Manage Billing
                </button>
                <button className="account-btn-link danger">Cancel Plan</button>
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
