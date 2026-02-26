import { useState } from 'react';
import { Eye, EyeSlash, ArrowRight, GoogleLogo, FacebookLogo } from 'phosphor-react';
import { useRouter } from 'next/router';

export default function Register() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    fullname: '',
    username: '',
    email: '',
    password: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Registration submitted:', formData);
    router.push('/screens/chat');
  };

  const handleSocialSignup = (provider: string) => {
    console.log(`Sign up with ${provider}`);
  };

  return (
    <div className="auth-split-container">
      {/* Left Side - Register Form */}
      <div className="auth-left">
        <div className="auth-form-container">

          <h1 className="auth-title">Register</h1>
          <p className="auth-subtitle">Please enter your details</p>

          <form onSubmit={handleSubmit} className="auth-form-split">
            <div className="auth-field">
              <label className="auth-field-label">Fullname</label>
              <input
                type="text"
                className="auth-field-input"
                placeholder="Full Name"
                value={formData.fullname}
                onChange={(e) => setFormData({ ...formData, fullname: e.target.value })}
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-field-label">Username</label>
              <input
                type="text"
                className="auth-field-input"
                placeholder="@username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-field-label">Email</label>
              <input
                type="email"
                className="auth-field-input"
                placeholder="mail@domain.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-field-label">Password</label>
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

            <button type="submit" className="auth-signin-btn">
              <span>Sign Up</span>
              <ArrowRight size={18} weight="bold" />
            </button>

            <div className="auth-divider-split">
              <span>Or</span>
            </div>

            <button
              type="button"
              className="auth-social-btn-split google"
              onClick={() => handleSocialSignup('google')}
            >
              <GoogleLogo size={20} weight="bold" />
              <span>Sign Up with Google</span>
            </button>

            <button
              type="button"
              className="auth-social-btn-split facebook"
              onClick={() => handleSocialSignup('facebook')}
            >
              <FacebookLogo size={20} weight="bold" />
              <span>Sign Up with Facebook</span>
            </button>
          </form>

          <p className="auth-register-text">
            Already have an account? <a href="/auth" className="auth-register-link">Login</a>
          </p>
        </div>
      </div>

      {/* Right Side - Welcome Section */}
      <div className="auth-right">
        <div className="auth-welcome-content">
          <h2 className="auth-welcome-title">Join our community!</h2>
          <p className="auth-welcome-subtitle">Create your account now.</p>

          {/* Placeholder for custom images/charts */}
          <div className="auth-visual-grid">
            <div className="auth-visual-card chart">
              <img src="/login-screen/pic-2w.jpg" alt="Sales Revenue Chart" className="auth-visual-image" />
            </div>

            <div className="auth-visual-card browser">
              <img src="/login-screen/pic-1.jpg" alt="Browser Stats" className="auth-visual-image" />
            </div>

            <div className="auth-visual-card map">
              <img src="/login-screen/pic-3.jpg" alt="Visitor by Country" className="auth-visual-image" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
