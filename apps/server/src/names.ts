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
 * A name reduced to what a filter should compare: no case, no accents, the
 * usual digit and symbol stand-ins read as letters, and no spaces or
 * punctuation between them. Cyrillic stays Cyrillic.
 */
export function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[^a-zЀ-ӿ]/g, '');
}

export function isBlockedName(name: string, parts: readonly string[] = BLOCKED_NAME_PARTS): boolean {
  const f = foldName(name);
  return parts.some((w) => {
    const x = foldName(w);
    return x !== '' && f.includes(x);
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
