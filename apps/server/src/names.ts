/**
 * A player's nickname as the table shows it.
 *
 * Stripped of anything invisible or layout-breaking: control characters,
 * zero-width and bidi marks, runs of whitespace. And refused - empty, so the
 * seat falls back to "Igrač N" - when it contains a word a report showed to
 * be objectionable (docs/compliance-checklist.md, "Handling a report"). The
 * list holds words, never players: there are no accounts to hold anything
 * else, and nothing here is stored or logged.
 *
 * Pure: the mobile tests load it (apps/mobile/test/server-names.test.ts).
 */

/** Name parts reports showed to be objectionable. Both scripts, where it matters. */
export const BLOCKED_NAME_PARTS: readonly string[] = [];

/**
 * The Cyrillic letters that pass for Latin ones on a puck. Read as Latin, so
 * one borrowed letter cannot carry a word past the entry it matches: "budalа"
 * with a Cyrillic а folds exactly as "budala" does. The rest of Cyrillic is
 * left alone, so a Cyrillic word needs its own entry (both are listed above).
 */
const TWINS: Record<string, string> = {
  а: 'a', в: 'b', с: 'c', ԁ: 'd', е: 'e', ѕ: 's', і: 'i', ј: 'j', к: 'k',
  м: 'm', н: 'h', о: 'o', р: 'p', т: 't', у: 'y', х: 'x', ԛ: 'q', ԝ: 'w',
};

/**
 * A name reduced to what a filter should compare: no case, no accents, the
 * usual digit and symbol stand-ins read as letters ('@' is an a, as in
 * "p@ssword"), Cyrillic lookalikes read as Latin, no spaces or punctuation
 * between them, and a doubled letter counted once.
 */
export function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[авсԁеѕіјкмнортухԛԝ]/g, (c) => TWINS[c]!)
    .replace(/[^a-zЀ-ӿ]/g, '');
}

/** Runs of one letter read as one: "buddala" is "budala" with a stutter. */
const collapse = (s: string): string => s.replace(/(.)\1+/g, '$1');

/**
 * Does a name hold a listed word?
 *
 * The name is tried both as it folds and with its doubled letters collapsed,
 * so "buddala" cannot slip past an entry of "budala". The LISTED WORD is
 * never collapsed: folding it the way a name is folded would turn an entry
 * like "kkk" into "k" and blank every nickname holding that letter, for
 * everyone, on the next deploy. An entry means exactly what it says.
 */
export function isBlockedName(name: string, parts: readonly string[] = BLOCKED_NAME_PARTS): boolean {
  const f = foldName(name);
  const c = collapse(f);
  return parts.some((w) => {
    const x = foldName(w);
    return x !== '' && (f.includes(x) || c.includes(x));
  });
}

export function cleanName(raw: unknown, parts: readonly string[] = BLOCKED_NAME_PARTS): string {
  if (typeof raw !== 'string') return '';
  const out = raw
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
  return isBlockedName(out, parts) ? '' : out;
}
