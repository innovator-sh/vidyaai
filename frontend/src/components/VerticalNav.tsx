import { useState } from 'react';
import { useRouter } from 'next/router';
import { House, SquaresFour, ChartBar, User, CaretLeft, CaretRight } from 'phosphor-react';

export default function VerticalNav() {
  const router = useRouter();
  const currentPath = router.pathname;
  const [isExpanded, setIsExpanded] = useState(false);

  const navItems = [
    { icon: House, path: '/', label: 'Home' },
    { icon: SquaresFour, path: '/screens/chat', label: 'Chat' },
    // { icon: ChartBar, path: '/screens/stats', label: 'Stats' },
    { icon: User, path: '/screens/account', label: 'Account' },
  ];

  return (
    <>
      {/* Toggle Button */}
      <button
        className="vertical-nav-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? 'Collapse navigation' : 'Expand navigation'}
      >
        {isExpanded ? <CaretRight size={16} weight="regular" /> : <CaretLeft size={16} weight="regular" />}
      </button>

      {/* Vertical Navigation */}
      <nav className={`vertical-nav ${isExpanded ? 'expanded' : ''}`}>
        <div className="vertical-nav-items">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.path;

            return (
              <button
                key={item.path}
                onClick={() => {
                  router.push(item.path);
                  setIsExpanded(false);
                }}
                className={`vertical-nav-item ${isActive ? 'active' : ''}`}
                aria-label={item.label}
              >
                <div className="vertical-nav-icon-wrapper">
                  <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
                </div>
                {isExpanded && <span className="vertical-nav-label">{item.label}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Overlay */}
      {isExpanded && (
        <div
          className="vertical-nav-overlay"
          onClick={() => setIsExpanded(false)}
        />
      )}
    </>
  );
}