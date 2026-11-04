import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'phosphor-react';
import { SUPPORTED_LANGUAGES, normalizeLanguage, setLanguage } from '@/i18n';

interface LanguageSwitcherProps {
  /** Shifts the control left on small screens when the page has its own top-right button. */
  avoidTopRight?: boolean;
}

export default function LanguageSwitcher({ avoidTopRight = false }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = normalizeLanguage(i18n.resolvedLanguage || i18n.language) ?? 'en';
  const activeLabel = SUPPORTED_LANGUAGES.find((l) => l.code === active)?.label ?? t('common.language');

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (code: string) => {
    void setLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`lang-switcher ${avoidTopRight ? 'lang-switcher--shifted' : ''}`}>
      <button
        type="button"
        className="lang-switcher-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('common.language')}
      >
        <Globe size={18} weight="bold" />
        <span>{activeLabel}</span>
      </button>

      {open && (
        <ul className="lang-switcher-menu" role="listbox" aria-label={t('common.language')}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <li key={lang.code} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={lang.code === active}
                lang={lang.code}
                className={`lang-switcher-option ${lang.code === active ? 'active' : ''}`}
                onClick={() => choose(lang.code)}
              >
                {lang.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
