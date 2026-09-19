/**
 * Reporting a player: an e-mail the reporter sends from their own mail app,
 * with the reported nickname, the table code, the time and the app version
 * filled in. Nothing about the reporter goes in, and nothing goes to the game
 * server, which keeps no data about anyone (docs/compliance-checklist.md).
 *
 * No React Native here, so the tests load it under node.
 */

/**
 * Where reports go. The player has not chosen the address yet: while this is
 * the placeholder, scripts/build-android.sh and scripts/build-web.sh refuse to
 * build a release (set ALLOW_UNSET_REPORT_ADDRESS=1 for a test build).
 */
export const REPORT_EMAIL = 'REPORT-ADDRESS-NOT-SET@belastih.invalid';

export interface ReportFacts {
  name: string;
  code: string;
  at: string;
  version: string;
}

export function reportMailto(
  ui: { reportSubject: string; reportBody: (p: ReportFacts) => string },
  f: ReportFacts,
): string {
  // Mail clients want CRLF line breaks in a mailto body.
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, '\r\n'));
  return `mailto:${REPORT_EMAIL}?subject=${enc(ui.reportSubject)}&body=${enc(ui.reportBody(f))}`;
}

/** "2026-09-19 14:38 UTC": when, without the reporter's time zone. */
export function reportStamp(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
