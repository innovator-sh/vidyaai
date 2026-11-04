import { useState } from 'react';
import { Eye, EyeSlash, ArrowRight, ArrowLeft } from 'phosphor-react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

export default function Register() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signUp } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (currentStep === totalSteps) {
      // Final step - create the Firebase account; profile is saved to the API once the email is verified
      setLoading(true);
      try {
        await signUp(formData.email, formData.password, {
          fullname: formData.fullname,
          course: formData.course,
          degree: formData.degree,
          college: formData.college,
          location: formData.location,
        });

        // Redirect to chat on successful registration
        router.push('/screens/chat');
      } catch (err) {
        setError(err instanceof Error ? err.message : t('register.createFailed'));
      } finally {
        setLoading(false);
      }
    } else {
      handleNext();
    }
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
                <span className="register-progress-label">{t('register.stepPersonal')}</span>
              </div>
              <div className={`register-progress-line ${currentStep > 1 ? 'completed' : ''}`}></div>
              <div className={`register-progress-step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
                <div className="register-progress-circle">2</div>
                <span className="register-progress-label">{t('register.stepEducation')}</span>
              </div>
              <div className={`register-progress-line ${currentStep > 2 ? 'completed' : ''}`}></div>
              <div className={`register-progress-step ${currentStep >= 3 ? 'active' : ''}`}>
                <div className="register-progress-circle">3</div>
                <span className="register-progress-label">{t('register.stepDetails')}</span>
              </div>
            </div>
          </div>

          <h1 className="auth-title">
            {t(`register.title${currentStep}`)}
          </h1>
          <p className="auth-subtitle">
            {t(`register.subtitle${currentStep}`)}
          </p>

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
            {/* Step 1: Personal Information */}
            {currentStep === 1 && (
              <>
                <div className="auth-field">
                  <label className="auth-field-label">{t('register.fullName')}</label>
                  <input
                    type="text"
                    className="auth-field-input"
                    placeholder={t('register.fullNamePlaceholder')}
                    value={formData.fullname}
                    onChange={(e) => setFormData({ ...formData, fullname: e.target.value })}
                    required
                  />
                </div>

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
                  <label className="auth-field-label">{t('auth.passwordLbl')}</label>
                  <div className="auth-field-password">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="auth-field-input"
                      placeholder={t('register.passwordPlaceholder')}
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
              </>
            )}

            {/* Step 2: Education Details */}
            {currentStep === 2 && (
              <>
                <div className="auth-field">
                  <label className="auth-field-label">{t('register.course')}</label>
                  <input
                    type="text"
                    className="auth-field-input"
                    placeholder={t('register.coursePlaceholder')}
                    value={formData.course}
                    onChange={(e) => setFormData({ ...formData, course: e.target.value })}
                    required
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-field-label">{t('register.degreeLevel')}</label>
                  <select
                    className="auth-field-input"
                    value={formData.degree}
                    onChange={(e) => setFormData({ ...formData, degree: e.target.value })}
                    required
                  >
                    <option value="">{t('register.degreePlaceholder')}</option>
                    <option value="bachelors">{t('register.degreeBachelors')}</option>
                    <option value="masters">{t('register.degreeMasters')}</option>
                    <option value="phd">{t('register.degreePhd')}</option>
                    <option value="diploma">{t('register.degreeDiploma')}</option>
                    <option value="other">{t('register.degreeOther')}</option>
                  </select>
                </div>
              </>
            )}

            {/* Step 3: College & Location */}
            {currentStep === 3 && (
              <>
                <div className="auth-field">
                  <label className="auth-field-label">{t('register.college')}</label>
                  <input
                    type="text"
                    className="auth-field-input"
                    placeholder={t('register.collegePlaceholder')}
                    value={formData.college}
                    onChange={(e) => setFormData({ ...formData, college: e.target.value })}
                    required
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-field-label">{t('register.location')}</label>
                  <input
                    type="text"
                    className="auth-field-input"
                    placeholder={t('register.locationPlaceholder')}
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
                  <span>{t('register.back')}</span>
                </button>
              )}
              <button
                type="submit"
                className="auth-signin-btn"
                disabled={!isStepValid() || loading}
              >
                <span>{loading ? t('register.processing') : (currentStep === totalSteps ? t('register.complete') : t('register.next'))}</span>
                <ArrowRight size={18} weight="bold" />
              </button>
            </div>

          </form>

          <p className="auth-register-text">
            {t('register.haveAccount')} <Link href="/auth" className="auth-register-link">{t('register.loginLink')}</Link>
          </p>
        </div>
      </div>

      {/* Right Side - Welcome Section */}
      <div className="auth-right">
        <div className="auth-welcome-content">
          <h2 className="auth-welcome-title">{t('register.joinTitle')}</h2>
          <p className="auth-welcome-subtitle">{t('register.joinSub')}</p>

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
