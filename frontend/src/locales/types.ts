import type { Translations } from './en';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

/** Non-English locales may omit keys; i18next falls back to English per key. */
export type PartialTranslations = DeepPartial<Translations>;
