import { useEffect } from 'react';
import { applyDetectedLanguage } from '@/i18n';

/**
 * Applies the saved / browser language after hydration. The first render always uses the
 * default language so server and client markup match; this swaps language in place afterwards.
 */
export default function LanguageSync() {
  useEffect(() => {
    void applyDetectedLanguage();
  }, []);
  return null;
}
