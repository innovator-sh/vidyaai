import { useState } from 'react';
import { Eye, EyeSlash, ArrowRight, GoogleLogo, FacebookLogo } from 'phosphor-react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';

export default function Auth() {
  const router = useRouter();
  const { signIn, signInWithGoogle, signInWithFacebook } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
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
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: string) => {
    setError('');
    setLoading(true);
    
    try {
      if (provider === 'google') {
        await signInWithGoogle();
        router.push('/screens/chat');
      } else if (provider === 'facebook') {
        await signInWithFacebook();
        router.push('/screens/chat');
      }
    } catch (err: any) {
      console.error(`${provider} login error:`, err);
      setError(err.message || `Failed to sign in with ${provider}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-split-container">
      {/* Left Side - Login Form */}
      <div className="auth-left">
        <div className="auth-form-container">

          <h1 className="auth-title">Login</h1>
          <p className="auth-subtitle">Please enter your details</p>

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

          <form onSubmit={handleSubmit} className="auth-form-split">
            <div className="auth-field">
              <label className="auth-field-label">Username or Email</label>
              <input
                type="text"
                className="auth-field-input"
                placeholder="@username"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div className="auth-field">
              <div className="auth-field-header">
                <label className="auth-field-label">Password</label>
                <a href="#" className="auth-forgot-link-inline">Forgot password?</a>
              </div>
              <div className="auth-field-password">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="auth-field-input"
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle-inline"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-signin-btn" disabled={loading}>
              <span>{loading ? 'Signing in...' : 'Sign In'}</span>
              <ArrowRight size={18} weight="bold" />
            </button>

            <div className="auth-divider-split">
              <span>Or</span>
            </div>

            <button
              type="button"
              className="auth-social-btn-split google"
              onClick={() => handleSocialLogin('google')}
            >
              <GoogleLogo size={20} weight="bold" />
              <span>Sign in with Google</span>
            </button>

            <button
              type="button"
              className="auth-social-btn-split facebook"
              onClick={() => handleSocialLogin('facebook')}
            >
              <FacebookLogo size={20} weight="bold" />
              <span>Sign in with Facebook</span>
            </button>
          </form>

          <p className="auth-register-text">
            Don't have account? <a href="/register" className="auth-register-link">Register</a>
          </p>
        </div>
      </div>

      {/* Right Side - Welcome Section */}
      <div className="auth-right">
        <div className="auth-welcome-content">
          <h2 className="auth-welcome-title">Welcome Back!</h2>
          <p className="auth-welcome-subtitle">Please log in to continue your journey.</p>

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
