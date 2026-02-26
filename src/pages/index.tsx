import StaggeredMenu from '../components/StaggeredMenu';
import Link from 'next/link';

export default function Home() {
  const menuItems = [
    { label: 'Home', ariaLabel: 'Go to home page', link: '../chat' },
    { label: 'Chat', ariaLabel: 'Chat with AI', link: '/screens/chat' },
    { label: 'Memory', ariaLabel: 'Statistics for Progress', link: '/Memory' },
    { label: 'Account', ariaLabel: 'Account Settings', link: '/account' }
  ];

  const socialItems = [
    { label: 'Twitter', link: 'https://twitter.com' },
    { label: 'GitHub', link: 'https://github.com' },
    { label: 'LinkedIn', link: 'https://linkedin.com' }
  ];

  return (
    <div className="home-container">
      <StaggeredMenu
        position="right"
        items={menuItems}
        socialItems={socialItems}
        displaySocials
        displayItemNumbering={true}
        menuButtonColor="#000000ff"
        openMenuButtonColor="#ffffffff"
        changeMenuColorOnOpen={false}
        colors={['#FF3D9A', '#0066FF']}
        logoUrl="/vidyaa-logo.svg"
        accentColor="#0066FF"
        onMenuOpen={() => console.log('Menu opened')}
        onMenuClose={() => console.log('Menu closed')}
        isFixed={true}
      />

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
