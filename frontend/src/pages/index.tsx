import PillNav from '../components/PillNav';
import Link from 'next/link';
import { useEffect } from 'react';

export default function Home() {
  // Prevent any auth-related re-renders on home page
  useEffect(() => {
    // This page doesn't need auth, so we don't check it
  }, []);

  return (
    <div className="home-container">
      <PillNav />

      <div className="hero-grid">
        {/* Left Hero */}
        <div className="hero-left">

          <h1 className="hero-title">
            YOUR <span className="accent"></span><br />
            HONEST<br />
            STUDY<br />
            COMPANION
          </h1>

          <p className="hero-subtitle">
            VidyaAI remembers your struggles, tracks your patterns, and calls out your BS. 
            No sugar-coating. Just real progress.
          </p>

          <div className="hero-cta">
            {/* <Link href="/screens/chat" className="btn btn-primary">
              Start Learning
            </Link> */}
            
           <Link href="/screens/chat" className="btn btn-secondary">
              Start Learning
            </Link>
          </div>
        </div>

        {/* Right Memory */}
        <div className="hero-right">
          <div className="stat-card yellow">
            <div className="stat-num">12</div>
            <div className="stat-label">
              Day<br />Streak
            </div>
          </div>

          <div className="stat-card pink">
            <div className="stat-num">47</div>
            <div className="stat-label">
              Concepts<br />Mastered
            </div>
          </div>

          <div className="stat-card blue">
            <div className="stat-num">89%</div>
            <div className="stat-label">
              Overall<br />Progress
            </div>
          </div>
        </div>
      </div>

      {/* Problem Strip */}
      <div className="problem-strip">
        <div className="problem-card">
          <div className="problem-num">01</div>
          <div className="problem-title">Memory That Sticks</div>
          <div className="problem-desc">
            We remember every struggle, every breakthrough. Your learning history becomes your superpower.
          </div>
        </div>

        <div className="problem-card">
          <div className="problem-num">02</div>
          <div className="problem-title">Brutally Honest</div>
          <div className="problem-desc">
            No fake encouragement. We call out patterns, point out gaps, and push you to actually learn.
          </div>
        </div>

        <div className="problem-card">
          <div className="problem-num">03</div>
          <div className="problem-title">Exam Ready</div>
          <div className="problem-desc">
            Panic mode activated? We've got your weak spots mapped. Practice what matters, ace what counts.
          </div>
        </div>
      </div>
    </div>
  );
}
