import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Lang, LOCALE_IDS } from '@belot/i18n';
import { addRecord, HISTORY_KEEP, nameKey, people, recordDate, totals, type MatchRecord } from '../src/net/history';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string) => readFileSync(join(here, '..', f), 'utf8');

const rec = (over: Partial<MatchRecord> & { id: string; won: boolean }): MatchRecord => ({
  at: '2026-09-23T20:00:00.000Z',
  code: 'ABCDE',
  partner: 'Ivo',
  opponents: ['Marko', 'Petra'],
  target: 1001,
  hard: false,
  score: over.won ? [1010, 640] : [640, 1010],
  deals: [5, 3],
  best: 162,
  ...over,
});

describe('inviting friends', () => {
  it('copies the code itself, from the code or the chip beside it', () => {
    const o = src('src/net/OnlineGame.tsx');
    expect(o).toMatch(/void copyText\(code\)\.then\(\(ok\) => \{\s*if \(ok\) flashCopied\('code'\);/);
    expect(o).toMatch(/<PressScale\s*onPress=\{copyCode\}\s*accessibilityRole="button"\s*accessibilityLabel=\{ui\.copyCodeLabel\(net\.roomId\)\}/);
    expect(o).toMatch(/\{copied === 'code' \? ui\.codeCopied : ui\.inviteCopied\}/);
    // Through expo-clipboard, which the web build also carries.
    expect(src('src/net/clipboard.ts')).toMatch(/Clipboard\.setStringAsync\(text\)/);
    expect(src('package.json')).toMatch(/"expo-clipboard": "~57\.0\.\d+"/);
  });

  it('shares an invitation that carries the code as well as the link', () => {
    for (const id of LOCALE_IDS) {
      const t = new Lang(id).s.ui.inviteText('K7M2Q', 'https://belastih.com/join/K7M2Q');
      expect(t, id).toContain('K7M2Q\n');
      expect(t, id).toContain('https://belastih.com/join/K7M2Q');
    }
    expect(src('src/net/OnlineGame.tsx')).toMatch(/const text = ui\.inviteText\(net\.roomId \?\? '', link\);/);
  });
});

describe('the history of matches with friends', () => {
  it('keeps each match once, newest first, and at most HISTORY_KEEP', () => {
    let list: MatchRecord[] = [];
    list = addRecord(list, rec({ id: 'a', won: true }));
    list = addRecord(list, rec({ id: 'b', won: false }));
    list = addRecord(list, rec({ id: 'a', won: true }));
    expect(list.map((r) => r.id)).toEqual(['b', 'a']);
    for (let i = 0; i < HISTORY_KEEP + 5; i++) list = addRecord(list, rec({ id: `m${i}`, won: i % 2 === 0 }));
    expect(list).toHaveLength(HISTORY_KEEP);
    expect(list[0]!.id).toBe(`m${HISTORY_KEEP + 4}`);
  });

  it('adds up to won, lost, the rate and the runs', () => {
    // Newest first: W W L W W W L
    const list = [true, true, false, true, true, true, false].map((won, i) => rec({ id: `r${i}`, won }));
    const t = totals(list);
    expect(t).toMatchObject({ played: 7, won: 5, lost: 2, rate: 71 });
    expect(t.streak).toEqual({ won: true, n: 2 });
    expect(t.bestStreak).toBe(3);
    expect(totals([])).toMatchObject({ played: 0, rate: 0, streak: null, bestStreak: 0 });
  });

  it('counts each person with me and against me; bots are nobody', () => {
    const list = [
      rec({ id: '3', won: true, partner: 'Ivo', opponents: ['Marko', ''] }),
      rec({ id: '2', won: false, partner: 'marko ', opponents: ['Ivo', 'Petra'] }),
      rec({ id: '1', won: true, partner: '', opponents: ['Petra', 'IVO'] }),
    ];
    const byName = Object.fromEntries(people(list).map((p) => [nameKey(p.name), p]));
    expect(Object.keys(byName).sort()).toEqual(['ivo', 'marko', 'petra']);
    expect(byName.ivo).toMatchObject({ withPlayed: 1, withWon: 1, againstPlayed: 2, againstWon: 1 });
    expect(byName.marko).toMatchObject({ withPlayed: 1, withWon: 0, againstPlayed: 1, againstWon: 1 });
    // The latest spelling is the one shown.
    expect(byName.ivo!.name).toBe('Ivo');
    // Most played first.
    expect(nameKey(people(list)[0]!.name)).toBe('ivo');
  });

  it('dates a match on this device-s clock', () => {
    const d = new Date(2026, 8, 23, 21, 5);
    expect(recordDate(d.toISOString())).toBe('23.9.2026. 21:05');
    expect(recordDate('not a date')).toBe('');
  });

  it('is written for a private table with at least one other person, once, by the series id', () => {
    const o = src('src/net/OnlineGame.tsx');
    expect(o).toMatch(/if \(mine === null \|\| !net\.isPrivate \|\| !net\.matchOver \|\| net\.winnerTeam === null \|\| !net\.roomId\) return;/);
    expect(o).toMatch(/if \(!partner && !opponents\[0\] && !opponents\[1\]\) return;/);
    expect(o).toMatch(/return info && info\.name !== SERVER_FALLBACK\(s\) \? net\.realName\(s\) : '';/);
    expect(o).toMatch(/saveHistory\(\s*addRecord\(loadHistory\(\), \{\s*id: `\$\{isoDay\(new Date\(\)\)\}:\$\{net\.roomId\}:\$\{net\.matchNumber\}`,/);
    // A list, never merged over a default object.
    expect(src('src/storage.ts')).toMatch(/return Array\.isArray\(list\) \? \(list as MatchRecord\[\]\) : \[\];/);
  });

  it('opens from home and the profile, and says it stays on the device', () => {
    const app = src('App.tsx');
    expect(app).toMatch(/menu === 'history' \? \(\s*<HistoryScreen/);
    expect(app).toMatch(/const history = useMemo\(\(\) => \(menu === 'history' \? loadHistory\(\) : \[\]\), \[menu\]\);/);
    expect(src('src/HomeScreen.tsx')).toMatch(/<Button label=\{ui\.historyOpen\} tone="plain" onPress=\{onOpenHistory\} \/>/);
    expect(src('src/screens/ProfileScreen.tsx')).toMatch(/<Button label=\{ui\.historyOpen\} tone="plain" onPress=\{onOpenHistory\} \/>/);
    expect(src('src/screens/HistoryScreen.tsx')).toMatch(/<Text style=\{styles\.local\}>\{ui\.historyLocal\}<\/Text>/);
  });

  it('reads the same in every language, with no count to agree with', () => {
    for (const id of LOCALE_IDS) {
      const ui = new Lang(id).s.ui;
      expect(ui.recordMeta(501, true, [5, 3], 182), id).toMatch(/501.*5:3.*182/);
      expect(ui.recordMeta(1001, false, null, null), id).not.toContain('·');
      expect(ui.streakWon(3)).toMatch(/: 3$/);
      expect(ui.recordPeople('Ivo', ['Marko', 'Petra'])).toContain('Marko, Petra');
    }
    expect(new Lang('hr').s.ui.recordMeta(501, true, [5, 3], 182)).toBe('igra do 501 · Prava bela · dijeljenja 5:3 · najbolje 182');
  });
});
