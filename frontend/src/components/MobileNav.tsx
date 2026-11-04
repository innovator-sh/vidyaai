import { useRouter } from 'next/router';
import { House, SquaresFour, User, Books } from 'phosphor-react';
import { useTranslation } from 'react-i18next';

export default function MobileNav() {
  const { t } = useTranslation();
  const router = useRouter();
  const currentPath = router.pathname;

  const navItems = [
    { icon: House, path: '/', label: t('nav.home') },
    { icon: SquaresFour, path: '/screens/chat', label: t('nav.chat') },
    { icon: Books, path: '/screens/knowledge-base', label: t('nav.knowledge') },
    /* { icon: ChartBar, path: '/screens/stats', label: t('nav.stats') }, */
    { icon: User, path: '/screens/account', label: t('nav.account') },
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