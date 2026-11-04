import PillNav from '../components/PillNav';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import Lines from '../components/Lines';

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="home-container">
      <PillNav />

      <div className="hero-grid">
        {/* Left Hero */}
        <div className="hero-left">

          <h1 className="hero-title">
            {t('home.title1')} <span className="accent"></span><br />
            {t('home.title2')}<br />
            {t('home.title3')}<br />
            {t('home.title4')}
          </h1>

          <p className="hero-subtitle">
            {t('home.subtitle')}
          </p>

          <div className="hero-cta">
            {/* <Link href="/screens/chat" className="btn btn-primary">
              Start Learning
            </Link> */}
            
           <Link href="/screens/chat" className="btn btn-secondary">
              {t('home.startLearning')}
            </Link>
          </div>
        </div>

        {/* Right Memory */}
        <div className="hero-right">
          <div className="stat-card yellow">
            <div className="stat-num">12</div>
            <div className="stat-label">
              <Lines text={t('home.dayStreak')} />
            </div>
          </div>

          <div className="stat-card pink">
            <div className="stat-num">47</div>
            <div className="stat-label">
              <Lines text={t('home.conceptsMastered')} />
            </div>
          </div>

          <div className="stat-card blue">
            <div className="stat-num">89%</div>
            <div className="stat-label">
              <Lines text={t('home.overallProgress')} />
            </div>
          </div>
        </div>
      </div>

      {/* Problem Strip */}
      <div className="problem-strip">
        <div className="problem-card">
          <div className="problem-num">01</div>
          <div className="problem-title">{t('home.problem1Title')}</div>
          <div className="problem-desc">
            {t('home.problem1Desc')}
          </div>
        </div>

        <div className="problem-card">
          <div className="problem-num">02</div>
          <div className="problem-title">{t('home.problem2Title')}</div>
          <div className="problem-desc">
            {t('home.problem2Desc')}
          </div>
        </div>

        <div className="problem-card">
          <div className="problem-num">03</div>
          <div className="problem-title">{t('home.problem3Title')}</div>
          <div className="problem-desc">
            {t('home.problem3Desc')}
          </div>
        </div>
      </div>
    </div>
  );
}
