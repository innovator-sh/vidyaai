import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import i18n, {
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  applyDetectedLanguage,
  currentLanguage,
  detectLanguage,
  localeFor,
  normalizeLanguage,
  setLanguage,
} from '@/i18n';
import en from '@/locales/en';
import hi from '@/locales/hi';
import mr from '@/locales/mr';

function setNavigatorLanguages(langs: string[]) {
  Object.defineProperty(window.navigator, 'languages', { value: langs, configurable: true });
  Object.defineProperty(window.navigator, 'language', { value: langs[0], configurable: true });
}

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, key));
  }
  return out;
}

const placeholders = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();

beforeEach(async () => {
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  setNavigatorLanguages(['en-US', 'en']);
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('translation catalogues', () => {
  const enFlat = flatten(en);

  test.each([
    ['hi', hi],
    ['mr', mr],
  ])('%s has no keys that are missing from English', (_name, bundle) => {
    const extra = Object.keys(flatten(bundle as Record<string, unknown>)).filter((k) => !(k in enFlat));
    expect(extra).toEqual([]);
  });

  test.each([
    ['hi', hi],
    ['mr', mr],
  ])('%s keeps the same interpolation placeholders as English', (_name, bundle) => {
    const flat = flatten(bundle as Record<string, unknown>);
    for (const [key, value] of Object.entries(flat)) {
      expect(placeholders(value), key).toEqual(placeholders(enFlat[key]));
    }
  });

  test.each([
    ['hi', hi],
    ['mr', mr],
  ])('%s covers every English key (so nothing silently falls back)', (_name, bundle) => {
    const flat = flatten(bundle as Record<string, unknown>);
    // Plural suffixes are all provided too; the lists must match exactly.
    expect(Object.keys(enFlat).filter((k) => !(k in flat))).toEqual([]);
  });
});

describe('fallback to English per key', () => {
  test('a key missing in the active language renders the English string', async () => {
    i18n.addResource('en', 'translation', 'testOnly.key', 'English only');
    await setLanguage('hi');
    expect(i18n.t('testOnly.key')).toBe('English only');
    // ...while translated keys use the active language
    expect(i18n.t('home.startLearning')).toBe(hi.home?.startLearning);
  });

  test('unknown keys return the key itself rather than throwing', () => {
    expect(i18n.t('does.not.exist')).toBe('does.not.exist');
  });

  test('plurals and interpolation work per language', async () => {
    expect(i18n.t('kb.filesCount', { count: 1 })).toBe('1 file');
    expect(i18n.t('kb.filesCount', { count: 3 })).toBe('3 files');
    await setLanguage('mr');
    expect(i18n.t('kb.filesCount', { count: 3 })).toBe('3 फाइल्स');
  });
});

describe('language selection and persistence', () => {
  test('starts in English with synchronous initialisation (SSR-safe)', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(currentLanguage()).toBe('en');
  });

  test('setLanguage switches, persists to localStorage and updates <html lang>', async () => {
    const result = await setLanguage('hi');
    expect(result).toBe('hi');
    expect(currentLanguage()).toBe('hi');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('hi');
    expect(document.documentElement.lang).toBe('hi');
  });

  test('normalises regional codes and ignores unsupported languages', async () => {
    expect(normalizeLanguage('hi-IN')).toBe('hi');
    expect(normalizeLanguage('MR_in')).toBe('mr');
    expect(normalizeLanguage('fr')).toBeNull();
    expect(normalizeLanguage('')).toBeNull();

    await setLanguage('fr');
    expect(currentLanguage()).toBe('en');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  test('applyDetectedLanguage restores the saved choice after reload', async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'mr');
    const applied = await applyDetectedLanguage();
    expect(applied).toBe('mr');
    expect(currentLanguage()).toBe('mr');
    expect(document.documentElement.lang).toBe('mr');
  });

  test('a saved choice wins over the browser language', async () => {
    setNavigatorLanguages(['hi-IN', 'en']);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    expect(detectLanguage()).toBe('en');
  });

  test('falls back to the browser language when nothing is saved, skipping unsupported ones', async () => {
    setNavigatorLanguages(['fr-FR', 'hi-IN', 'en']);
    expect(detectLanguage()).toBe('hi');
    await applyDetectedLanguage();
    expect(currentLanguage()).toBe('hi');
    // detection alone must not persist a choice the user never made
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  test('ignores a corrupted stored value', async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, '<script>alert(1)</script>');
    setNavigatorLanguages(['mr-IN']);
    expect(detectLanguage()).toBe('mr');
  });

  test('still switches language when localStorage throws (private mode)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    await expect(setLanguage('hi')).resolves.toBe('hi');
    expect(currentLanguage()).toBe('hi');
    expect(document.documentElement.lang).toBe('hi');
  });

  test('detection survives localStorage reads throwing', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    setNavigatorLanguages(['hi']);
    expect(() => detectLanguage()).not.toThrow();
  });
});

describe('locale helpers', () => {
  test('every supported language has a distinct locale', () => {
    const locales = SUPPORTED_LANGUAGES.map((l) => l.locale);
    expect(new Set(locales).size).toBe(locales.length);
    expect(localeFor('hi')).toBe('hi-IN');
    expect(localeFor('xx')).toBe('en-US');
  });
});
