import { useRouter } from 'next/router';
import { House, SquaresFour, ChartBar, User, Books } from 'phosphor-react';

export default function MobileNav() {
  const router = useRouter();
  const currentPath = router.pathname;

  const navItems = [
    { icon: House, path: '/', label: 'Home' },
    { icon: SquaresFour, path: '/screens/chat', label: 'Chat' },
    { icon: Books, path: '/screens/knowledge-base', label: 'Knowledge' },
    { icon: ChartBar, path: '/screens/stats', label: 'Stats' },
    { icon: User, path: '/screens/account', label: 'Account' },
  ];

  return (
    <nav className="mobile-nav">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentPath === item.path;
        
        return (
          <button
            key={item.path}
            onClick={() => router.push(item.path)}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            aria-label={item.label}
          >
            <div className="mobile-nav-icon-wrapper">
              <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
            </div>
          </button>
        );
      })}
    </nav>
  );
}