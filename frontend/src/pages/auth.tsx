import { useState } from 'react';
import { Eye, EyeSlash, ArrowRight } from 'phosphor-react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

export default function Auth() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn, signInWithGoogle, sendPasswordReset } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(formData.email, formData.password);
      router.push('/screens/chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.signInFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await signInWithGoogle();
      router.push('/screens/chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.googleFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.MouseEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!formData.email) {
      setError(t('auth.enterEmailFirst'));
      return;
    }
    try {
      await sendPasswordReset(formData.email);
      setInfo(t('auth.resetSent'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.resetFailed'));
    }
  };


  return (
    <div className="auth-split-container">
      {/* Left Side - Login Form */}
      <div className="auth-left">
        <div className="auth-form-container">

          <h1 className="auth-title">{t('auth.login')}</h1>
          <p className="auth-subtitle">{t('auth.subtitle')}</p>

          {error && (
            <div style={{
              padding: '12px 16px',
              marginBottom: '16px',
              backgroundColor: '#fee',
              border: '2px solid #c00',
              borderRadius: '8px',
              color: '#c00',
              fontSize: '14px',
              fontFamily: 'Sora, sans-serif'
            }}>
              {error}
            </div>
          )}

          {info && (
            <div style={{
              padding: '12px 16px',
              marginBottom: '16px',
              backgroundColor: '#efe',
              border: '2px solid #060',
              borderRadius: '8px',
              color: '#060',
              fontSize: '14px',
              fontFamily: 'Sora, sans-serif'
            }}>
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form-split">
            <div className="auth-field">
              <label className="auth-field-label">{t('auth.emailLbl')}</label>
              <input
                type="email"
                className="auth-field-input"
                placeholder={t('auth.emailPlaceholder')}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div className="auth-field">
              <div className="auth-field-header">
                <label className="auth-field-label">{t('auth.passwordLbl')}</label>
                <a href="#" className="auth-forgot-link-inline" onClick={handleForgot}>{t('auth.forgotPwd')}</a>
              </div>
              <div className="auth-field-password">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="auth-field-input"
                  placeholder={t('auth.passwordLbl')}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle-inline"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-signin-btn" disabled={loading}>
              <span>{loading ? t('auth.signingIn') : t('auth.signIn')}</span>
              <ArrowRight size={18} weight="bold" />
            </button>

            <div className="auth-divider-split"><span>{t('auth.or')}</span></div>

            <button type="button" className="auth-social-btn-split google" onClick={handleGoogle} disabled={loading}>
              <span>{t('auth.continueGoogle')}</span>
            </button>
          </form>

          <p className="auth-register-text">
            {t('auth.noAccount')} <Link href="/register" className="auth-register-link">{t('auth.register')}</Link>
          </p>
        </div>
      </div>

      {/* Right Side - Welcome Section */}
      <div className="auth-right">
        <div className="auth-welcome-content">
          <h2 className="auth-welcome-title">{t('auth.welcomeBack')}</h2>
          <p className="auth-welcome-subtitle">{t('auth.welcomeSub')}</p>

          {/* Placeholder for custom images/charts */}
          <div className="auth-visual-grid">
            <div className="auth-visual-card chart">
              <img src="/login-screen/pic-2w.jpg" alt="Sales Revenue Chart" className="auth-visual-image" />
            </div>

            <div className="auth-visual-card browser">
              <img src="/login-screen/pic-1.jpg" alt="Sales Revenue Chart" className="auth-visual-image" />
            </div>

            <div className="auth-visual-card map">
              <img src="/login-screen/pic-3.jpg" alt="Sales Revenue Chart" className="auth-visual-image" />
            </div>

            <div className="auth-visual-card others">
              <div className="auth-visual-placeholder small">
                {/* Space for Others Stats */}
                <span className="auth-placeholder-text">Others 2.5%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
