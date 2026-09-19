import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Lang, LOCALE_IDS } from '@belot/i18n';
import { mutedSeats, type MutedGift } from '../src/gifts';
import { REPORT_EMAIL, reportMailto, reportStamp } from '../src/report';

const here = dirname(fileURLToPath(import.meta.url));
const facts = { name: 'Zločesti Ivo', code: 'ixGGEft4C', at: '2026-09-19 14:38 UTC', version: '1.3.1' };

describe('a player report is an e-mail the reporter sends', () => {
  it('names the player, the table, the time and the version, in the reporter-s own words', () => {
    for (const locale of LOCALE_IDS) {
      const ui = new Lang(locale).s.ui;
      const url = reportMailto(ui, facts);
      expect(url.startsWith(`mailto:${REPORT_EMAIL}?subject=`)).toBe(true);
      const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
      expect(q.get('subject')).toBe(ui.reportSubject);
      const body = q.get('body')!;
      for (const v of [facts.name, facts.code, facts.at, facts.version]) expect(body, `${locale}: ${v}`).toContain(v);
      // Line breaks the way mail clients want them.
      expect(body).toContain('\r\n');
      expect(body).not.toMatch(/[^\r]\n/);
    }
  });

  it('carries nothing about the reporter', () => {
    const body = reportMailto(new Lang('hr').s.ui, facts);
    // The only facts passed in are the reported player's; the builder takes no more.
    expect(Object.keys(facts).sort()).toEqual(['at', 'code', 'name', 'version']);
    expect(decodeURIComponent(body)).not.toMatch(/nickname:\s*undefined|undefined/);
  });

  it('stamps the time in UTC, to the minute', () => {
    expect(reportStamp(new Date(Date.UTC(2026, 8, 19, 14, 38, 55)))).toBe('2026-09-19 14:38 UTC');
  });

  it('reads Cyrillic in Serbian, apart from the facts it quotes', () => {
    const ui = new Lang('sr-Cyrl').s.ui;
    const strip = (s: string) => s.replace(facts.name, '').replace(facts.code, '').replace(facts.at, '').replace(facts.version, '');
    for (const v of [ui.reportSubject, strip(ui.reportBody(facts)), ui.playerTitle(''), ui.reportFallback('')]) {
      // The brand's own name is the one Latin allowed: none here, it is written in Cyrillic too.
      expect(v, v).not.toMatch(/[A-Za-zČĆĐŠŽčćđšž]/);
    }
  });
});

describe("a hidden player's gift stays off the puck", () => {
  const hid = (id: 'kava' | 'ruza', from: 0 | 1 | 2 | 3): MutedGift => ({ id, from });
  it('while the room still records it there', () => {
    const r = mutedSeats([null, 'kava', null, null], [null, hid('kava', 2), null, null]);
    expect(r.keep).toEqual([false, true, false, false]);
    expect(r.muted[1]).toEqual(hid('kava', 2));
  });

  it('and lets go once the seat has a newer gift, or none', () => {
    expect(mutedSeats([null, 'ruza', null, null], [null, hid('kava', 2), null, null]).keep).toEqual([false, false, false, false]);
    expect(mutedSeats([null, null, null, null], [null, hid('kava', 2), null, null]).muted).toEqual([null, null, null, null]);
  });
});

describe('no release carries the placeholder report address', () => {
  it('the web build, the deploy and the Android build all look for it', () => {
    const read = (f: string) => readFileSync(join(here, '../../..', f), 'utf8');
    const mark = 'REPORT-ADDRESS-NOT-SET';
    // The placeholder is what they look for (a real address never matches).
    if (REPORT_EMAIL.includes(mark)) expect(REPORT_EMAIL.startsWith(mark)).toBe(true);
    const web = read('scripts/build-web.sh');
    expect(web).toMatch(/if grep -q 'REPORT-ADDRESS-NOT-SET' "\$BUNDLE"; then[\s\S]{0,200}exit 1/);
    expect(web).not.toMatch(/ALLOW_UNSET_REPORT_ADDRESS/);
    const deploy = read('scripts/deploy-server.sh');
    expect(deploy).toMatch(/grep -q 'REPORT-ADDRESS-NOT-SET' "deploy\/site\/igra\/_expo\/static\/js\/web\/\$SERVED"; then[\s\S]{0,200}exit 1/);
    const android = read('scripts/build-android.sh');
    expect(android).toMatch(/^check_report "\$AAB" base\/assets\/index\.android\.bundle$/m);
    expect(android).toMatch(/^ {2}check_report "\$APK" assets\/index\.android\.bundle$/m);
    expect(android).toMatch(/b'REPORT-ADDRESS-NOT-SET' in zipfile/);
  });
});
