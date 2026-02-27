import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { House, ChatCircle, ChartBar, User } from 'phosphor-react';
import gsap from 'gsap';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

export default function PillNav() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const navItemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const navItems: NavItem[] = [
    { label: 'Home', path: '/', icon: <House size={20} weight="bold" /> },
    { label: 'Chat', path: '/screens/chat', icon: <ChatCircle size={20} weight="bold" /> },
    { label: 'Stats', path: '/screens/stats', icon: <ChartBar size={20} weight="bold" /> },
    { label: 'Account', path: '/auth', icon: <User size={20} weight="bold" /> },
  ];

  // Initial entrance animation
  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        {
          y: -100,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'back.out(1.7)',
          delay: 0.2,
        }
      );
    }

    // Stagger animation for nav items
    navItemsRef.current.forEach((item, index) => {
      if (item) {
        gsap.fromTo(
          item,
          {
            scale: 0,
            opacity: 0,
          },
          {
            scale: 1,
            opacity: 1,
            duration: 0.5,
            ease: 'back.out(1.7)',
            delay: 0.4 + index * 0.1,
          }
        );
      }
    });

    // Animate indicator
    if (indicatorRef.current) {
      gsap.fromTo(
        indicatorRef.current,
        {
          scale: 0,
        },
        {
          scale: 1,
          duration: 0.6,
          ease: 'back.out(1.7)',
          delay: 0.8,
        }
      );
    }
  }, []);

  // Update active index based on current route
  useEffect(() => {
    const currentPath = router.pathname;
    const index = navItems.findIndex(item => item.path === currentPath);
    if (index !== -1) {
      setActiveIndex(index);
    }
  }, [router.pathname]);

  // Animate indicator with GSAP
  useEffect(() => {
    if (indicatorRef.current) {
      gsap.to(indicatorRef.current, {
        x: `${activeIndex * 100}%`,
        duration: 0.6,
        ease: 'power3.out',
      });
    }
  }, [activeIndex]);

  // Animate icon on hover
  const handleMouseEnter = (index: number) => {
    const icon = navItemsRef.current[index]?.querySelector('.pill-nav-icon');
    if (icon) {
      gsap.to(icon, {
        scale: 1.2,
        rotation: 5,
        duration: 0.3,
        ease: 'back.out(1.7)',
      });
    }
  };

  const handleMouseLeave = (index: number) => {
    const icon = navItemsRef.current[index]?.querySelector('.pill-nav-icon');
    if (icon) {
      gsap.to(icon, {
        scale: 1,
        rotation: 0,
        duration: 0.3,
        ease: 'power2.out',
      });
    }
  };

  const handleNavClick = (index: number, path: string) => {
    // Animate the clicked item
    const button = navItemsRef.current[index];
    if (button) {
      gsap.fromTo(
        button,
        { scale: 0.95 },
        {
          scale: 1,
          duration: 0.3,
          ease: 'back.out(1.7)',
        }
      );
    }

    setActiveIndex(index);
    router.push(path);
  };

  return (
    <nav className="pill-nav">
      <div ref={containerRef} className="pill-nav-container">
        {navItems.map((item, index) => (
          <button
            key={index}
            ref={(el) => (navItemsRef.current[index] = el)}
            className={`pill-nav-item ${activeIndex === index ? 'active' : ''}`}
            onClick={() => handleNavClick(index, item.path)}
            onMouseEnter={() => handleMouseEnter(index)}
            onMouseLeave={() => handleMouseLeave(index)}
          >
            <span className="pill-nav-icon">{item.icon}</span>
            <span className="pill-nav-label">{item.label}</span>
          </button>
        ))}
        <div
          ref={indicatorRef}
          className="pill-nav-indicator"
        />
      </div>
    </nav>
  );
}
