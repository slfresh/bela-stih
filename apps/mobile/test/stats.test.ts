import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Lang, LOCALE_IDS } from '@belot/i18n';
import { groupKey, recordMatch, seriesNames } from '../src/net/series';

/**
 * The table shows one thing, the statistics screen another: the sitting in
 * progress on the table (the server's count since these people sat down, the
 * screen's own offline), the long count between the same four across
 * evenings on "Statistika". Pinned in the source, because the mix-up was
 * exactly what used to happen: the stored book replaced tonight's tally in
 * the header chip and on the result sheet.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(join(here, '..', p), 'utf8');

describe('the table shows only this sitting', () => {
  it('online: the server-s series, never the stored book', () => {
    const o = src('src/net/OnlineGame.tsx');
    expect(o).toMatch(/series=\{net\.series\}/);
    expect(o).not.toMatch(/shownSeries|seriesEntry|setSeriesEntry/);
    // The book is still written, names and all, for the statistics screen.
    expect(o).toMatch(/saveSeries\(recordMatch\(loadSeries\(\), group, id, net\.winnerTeam === teamOf\(mine\), net\.matchDouble \? 2 : 1, names\)\);/);
  });

  it('offline: a tally kept above the keyed match, counted once per match', () => {
    const g = src('src/OfflineGame.tsx');
    expect(g).toMatch(/const \[sitting, setSitting\] = useState<\[number, number\]>\(\[0, 0\]\);/);
    // Above `key={matchId}`, like the gift stores, so a rematch keeps it.
    expect(g.indexOf('const [sitting, setSitting]')).toBeLessThan(g.indexOf('key={matchId}'));
    expect(g).toMatch(/series=\{sitting\}/);
    expect(g).toMatch(/onMatchOver\(winner, g\.table\.matchWins\(\)\);/);
    expect(g).toMatch(/if \(!matchOver \|\| counted\.current\) return;/);
    expect(g).toMatch(/series=\{series\}/);
  });
});

describe('the series book', () => {
  it('keeps the four-s names, and reads an older entry-s from its key', () => {
    const key = groupKey(['Ana', 'Ivo'], ['Marko', 'Petra']);
    const names = { us: ['Ana', 'Ivo'] as [string, string], them: ['Marko', 'Petra'] as [string, string] };
    const book = recordMatch({}, key, 'd1:ABCDE:0', true, 1, names);
    expect(book[key]).toMatchObject({ us: 1, them: 0, names });
    // Spelled differently next time: the latest spelling stays.
    const again = recordMatch(book, key, 'd1:ABCDE:1', false, 1, { us: ['ana', 'IVO'], them: ['Marko', 'Petra'] });
    expect(again[key]!.names!.us).toEqual(['ana', 'IVO']);
    expect(seriesNames(key, again[key]!)).toEqual(again[key]!.names);
    // An entry from before the names were kept: the key's lowercased pairs.
    expect(seriesNames(key, {})).toEqual({ us: ['ana', 'ivo'], them: ['marko', 'petra'] });
    // A name-less record keeps whatever names the entry already had.
    expect(recordMatch(again, key, 'd1:ABCDE:2', true)[key]!.names!.us).toEqual(['ana', 'IVO']);
  });
});

describe('the statistics screen', () => {
  it('is a menu screen of its own, opened from home, the profile and the history', () => {
    const app = src('App.tsx');
    expect(app).toMatch(/'history' \| 'stats'/);
    expect(app).toMatch(/menu === 'stats' \? \(\s*<StatsScreen/);
    expect(app).toMatch(/const seriesBook = useMemo\(\(\) => \(menu === 'stats' \? loadSeries\(\) : \{\}\), \[menu\]\);/);
    expect(app.match(/onOpenStats=\{\(\) => setMenu\('stats'\)\}/g)?.length).toBe(3);
    expect(src('src/HomeScreen.tsx')).toMatch(/<Button label=\{ui\.statsOpen\} tone="plain" onPress=\{onOpenStats\} \/>/);
    expect(src('src/screens/ProfileScreen.tsx')).toMatch(/<Button label=\{ui\.statsOpen\} tone="plain" onPress=\{onOpenStats\} \/>/);
    expect(src('src/screens/HistoryScreen.tsx')).toMatch(/<Button label=\{ui\.statsOpen\} tone="plain" onPress=\{onOpenStats\} \/>/);
  });

  it('holds the totals, the long count and the people; the history is the list alone', () => {
    const s = src('src/screens/StatsScreen.tsx');
    expect(s).toMatch(/import \{ people, totals, type MatchRecord \} from '\.\.\/net\/history';/);
    expect(s).toMatch(/import \{ seriesNames \} from '\.\.\/net\/series';/);
    expect(s).toMatch(/label=\{ui\.historyTotals\}/);
    expect(s).toMatch(/label=\{ui\.statsHeadToHead\}/);
    expect(s).toMatch(/label=\{ui\.peopleTitle\}/);
    expect(s).toMatch(/label=\{ui\.statsOverall\}/);
    expect(s).toMatch(/import \{ StatTile \} from '\.\.\/ui\/StatTile';/);
    const h = src('src/screens/HistoryScreen.tsx');
    expect(h).not.toMatch(/historyTotals|peopleTitle|totals\(|people\(/);
    expect(h).toMatch(/label=\{ui\.matchesTitle\}/);
    expect(h).toMatch(/ui\.doubleTag/);
  });

  it('reads in every language, the history no longer claiming the statistics', () => {
    for (const id of LOCALE_IDS) {
      const ui = new Lang(id).s.ui;
      expect(ui.statsTitle).not.toBe(ui.historyTitle);
      expect(ui.historyTitle).not.toMatch(/statisti|статисти/i);
      expect(ui.statsVs('Ivo', 'Marko', 'Petra')).toContain('Ivo');
      expect(ui.statsVs('Ivo', 'Marko', 'Petra')).toContain('Petra');
    }
  });
});
