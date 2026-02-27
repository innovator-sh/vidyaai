import { useState } from 'react';
import { Eye, EyeSlash, ArrowRight, GoogleLogo, FacebookLogo, ArrowLeft } from 'phosphor-react';
import { useRouter } from 'next/router';

export default function Register() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    fullname: '',
    email: '',
    password: '',
    course: '',
    degree: '',
    college: '',
    location: '',
  });

  const totalSteps = 3;

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep === totalSteps) {
      console.log('Registration submitted:', formData);
      router.push('/screens/chat');
    } else {
      handleNext();
    }
  };

  const handleSocialSignup = (provider: string) => {
    console.log(`Sign up with ${provider}`);
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.fullname && formData.email && formData.password;
      case 2:
        return formData.course && formData.degree;
      case 3:
        return formData.college && formData.location;
      default:
        return false;
    }
  };

  return (
    <div className="auth-split-container">
      {/* Left Side - Register Form */}
      <div className="auth-left">
        <div className="auth-form-container">

          {/* Progress Indicator */}
          <div className="register-progress">
            <div className="register-progress-steps">
              <div className={`register-progress-step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
                <div className="register-progress-circle">1</div>
                <span className="register-progress-label">Personal</span>
              </div>
              <div className={`register-progress-line ${currentStep > 1 ? 'completed' : ''}`}></div>
              <div className={`register-progress-step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
                <div className="register-progress-circle">2</div>
                <span className="register-progress-label">Education</span>
              </div>
              <div className={`register-progress-line ${currentStep > 2 ? 'completed' : ''}`}></div>
              <div className={`register-progress-step ${currentStep >= 3 ? 'active' : ''}`}>
                <div className="register-progress-circle">3</div>
                <span className="register-progress-label">Details</span>
              </div>
            </div>
          </div>

          <h1 className="auth-title">
            {currentStep === 1 && 'Personal Information'}
            {currentStep === 2 && 'Education Details'}
            {currentStep === 3 && 'College & Location'}
          </h1>
          <p className="auth-subtitle">
            {currentStep === 1 && 'Please enter your basic details'}
            {currentStep === 2 && 'Tell us about your education'}
            {currentStep === 3 && 'Where do you study?'}
          </p>

          <form onSubmit={handleSubmit} className="auth-form-split">
            {/* Step 1: Personal Information */}
            {currentStep === 1 && (
              <>
                <div className="auth-field">
                  <label className="auth-field-label">Full Name</label>
                  <input
                    type="text"
                    className="auth-field-input"
                    placeholder="Enter your full name"
                    value={formData.fullname}
                    onChange={(e) => setFormData({ ...formData, fullname: e.target.value })}
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
                      placeholder="Create a password"
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
              </>
            )}

            {/* Step 2: Education Details */}
            {currentStep === 2 && (
              <>
                <div className="auth-field">
                  <label className="auth-field-label">Course</label>
                  <input
                    type="text"
                    className="auth-field-input"
                    placeholder="e.g., Computer Science"
                    value={formData.course}
                    onChange={(e) => setFormData({ ...formData, course: e.target.value })}
                    required
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-field-label">Degree Level</label>
                  <select
                    className="auth-field-input"
                    value={formData.degree}
                    onChange={(e) => setFormData({ ...formData, degree: e.target.value })}
                    required
                  >
                    <option value="">Select degree level</option>
                    <option value="bachelors">Bachelor's Degree</option>
                    <option value="masters">Master's Degree</option>
                    <option value="phd">PhD</option>
                    <option value="diploma">Diploma</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </>
            )}

            {/* Step 3: College & Location */}
            {currentStep === 3 && (
              <>
                <div className="auth-field">
                  <label className="auth-field-label">College Name</label>
                  <input
                    type="text"
                    className="auth-field-input"
                    placeholder="Enter your college name"
                    value={formData.college}
                    onChange={(e) => setFormData({ ...formData, college: e.target.value })}
                    required
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-field-label">Location</label>
                  <input
                    type="text"
                    className="auth-field-input"
                    placeholder="City, Country"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    required
                  />
                </div>
              </>
            )}

            <div className="register-button-group">
              {currentStep > 1 && (
                <button type="button" className="auth-back-btn" onClick={handleBack}>
                  <ArrowLeft size={18} weight="bold" />
                  <span>Back</span>
                </button>
              )}
              <button 
                type="submit" 
                className="auth-signin-btn"
                disabled={!isStepValid()}
              >
                <span>{currentStep === totalSteps ? 'Complete' : 'Next'}</span>
                <ArrowRight size={18} weight="bold" />
              </button>
            </div>

            {currentStep === 1 && (
              <>
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
              </>
            )}
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
