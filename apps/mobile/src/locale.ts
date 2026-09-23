/** The languages the app speaks (Settings.locale). */
export type AppLocale = 'hr' | 'sr-Cyrl' | 'en';

/**
 * The phone's language, as one of ours - read once, on the very first
 * launch. Croatian's neighbours read Croatian, Macedonian readers Cyrillic;
 * any other language gets English, and no answer at all the home market's.
 */
export function localeFor(tag: string | null | undefined): AppLocale {
  const lang = (tag ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
  if (lang === 'sr' || lang === 'mk') return 'sr-Cyrl';
  if (lang === 'hr' || lang === 'bs' || lang === 'sh' || lang === 'cnr' || lang === 'sl' || lang === '') return 'hr';
  return 'en';
}
