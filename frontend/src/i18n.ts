/**
 * i18n setup (i18next + react-i18next).
 *
 * SSR / hydration: i18next is always initialised synchronously with the default
 * language (English), so the server HTML and the first client render are identical.
 * The user's saved / browser language is applied *after mount* by `<LanguageSync />`
 * (see components/LanguageSync.tsx) via `applyDetectedLanguage()`. There is no
 * blank "mounted" gate; content renders immediately and swaps language in place.
 *
 * Missing keys in `hi` / `mr` fall back to English per key.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en';
import hi from './locales/hi';
import mr from './locales/mr';

export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_STORAGE_KEY = 'vidyaai_lang';

export interface LanguageOption {
  code: string;
  /** Native name, shown in the switcher. */
  label: string;
  /** BCP-47 locale for Intl / speech recognition. */
  locale: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'hi', label: 'हिंदी', locale: 'hi-IN' },
  { code: 'mr', label: 'मराठी', locale: 'mr-IN' },
];

const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

/** "hi-IN" / "HI" -> "hi" when supported, otherwise null. */
export function normalizeLanguage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const base = raw.trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_CODES.includes(base) ? base : null;
}

/** The base language code currently in use (always a supported code). */
export function currentLanguage(): string {
  return normalizeLanguage(i18n.resolvedLanguage || i18n.language) ?? DEFAULT_LANGUAGE;
}

export function localeFor(code: string | null | undefined): string {
  const base = normalizeLanguage(code) ?? DEFAULT_LANGUAGE;
  return SUPPORTED_LANGUAGES.find((l) => l.code === base)?.locale ?? 'en-US';
}

function makeDetector(): LanguageDetector {
  // The detector only returns the full candidate list (not just the first hit) when the services object
  // exposes `languageUtils.getBestMatchFromCodes`; we pick the first *supported* candidate ourselves.
  const services = { languageUtils: { getBestMatchFromCodes: () => undefined } } as unknown as ConstructorParameters<
    typeof LanguageDetector
  >[0];
  return new LanguageDetector(services, {
    order: ['localStorage', 'navigator'],
    lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    caches: ['localStorage'],
  });
}

/** Saved choice first, then the browser's language list. Browser only; returns null on the server. */
export function detectLanguage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const found = makeDetector().detect();
    const list = Array.isArray(found) ? found : found ? [found] : [];
    for (const candidate of list) {
      const code = normalizeLanguage(candidate);
      if (code) return code;
    }
  } catch {
    /* storage / navigator unavailable */
  }
  return null;
}

function persistLanguage(code: string) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    /* private mode / storage disabled: language still applies for this session */
  }
}

function reflectOnDocument(code: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = code;
}

/** Switches language, saves the choice and updates <html lang>. Unsupported codes are ignored. */
export async function setLanguage(raw: string): Promise<string> {
  const code = normalizeLanguage(raw);
  if (!code) return currentLanguage();
  await i18n.changeLanguage(code);
  persistLanguage(code);
  reflectOnDocument(code);
  return code;
}

/** Applies the stored / browser language without persisting it (it was not chosen explicitly). */
export async function applyDetectedLanguage(): Promise<string> {
  const code = detectLanguage();
  if (code && code !== currentLanguage()) await i18n.changeLanguage(code);
  const active = currentLanguage();
  reflectOnDocument(active);
  return active;
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      mr: { translation: mr },
    },
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_CODES,
    nonExplicitSupportedLngs: true,
    initAsync: false,
    interpolation: { escapeValue: false }, // React already escapes
    react: { useSuspense: false },
  });
}

export default i18n;
