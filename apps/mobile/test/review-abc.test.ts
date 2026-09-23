import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Lang } from '@belot/i18n';
import { people, totals, UNNAMED, type MatchRecord } from '../src/net/history';

/**
 * What an independent review of phases A-C found, each held to its fix:
 * a lobby Retry that abandoned the table mid-reconnect, friends without a
 * name written down as bots, the same-network refusal read as a server
 * fault, a join still in flight seated after the player left, the shop's
 * "why not" off-screen and moving the grid, and the old app's Ručno.
 * (The hand's fade, the zvanja hold and Back after a reload are held in
 * phase-c.test.ts and phase-b.test.ts; 4300 in trouble.test.ts.)
 */

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

const rec = (id: string, partner: string, opponents: [string, string], won: boolean): MatchRecord => ({
  id,
  at: `2026-09-2${id}T20:00:00.000Z`,
  code: 'ABCDE',
  partner,
  opponents,
  target: 1001,
  hard: false,
  won,
  score: won ? [1010, 800] : [800, 1010],
  deals: null,
  best: null,
});

describe('a friend who never set a name', () => {
  it('is a person in the history: the match counts, nobody is merged into them', () => {
    const list = [rec('3', UNNAMED, [UNNAMED, 'Ivo'], true), rec('2', UNNAMED, [UNNAMED, UNNAMED], false), rec('1', 'Ana', ['', ''], true)];
    // All three matches count, the all-unnamed one included.
    expect(totals(list).played).toBe(3);
    // Only the named are people to list; the unnamed are never lumped together.
    expect(people(list).map((p) => p.name)).toEqual(['Ivo', 'Ana']);
  });

  it('is recorded as such by the online game, a bot from the start as nobody', () => {
    const o = src('src/net/OnlineGame.tsx');
    expect(o).toMatch(/if \(!partner && !opponents\[0\] && !opponents\[1\]\) return;/);
    expect(o).toMatch(/import \{ addRecord, UNNAMED \} from '\.\/history';/);
    // The marker cannot be a nickname: the server strips control characters.
    expect(UNNAMED).toBe('\u0001');
    expect(src('../server/src/names.ts')).toMatch(/\.replace\(\/\[\\p\{Cc\}\\p\{Cf\}\]\/gu, ''\)/);
  });

  it('reads as "igrač bez imena", never "bot"', () => {
    expect(src('src/screens/HistoryScreen.tsx')).toMatch(/const name = \(n: string\) => \(n === UNNAMED \? ui\.unnamedPlayer : n \|\| ui\.botWord\);/);
    expect(new Lang('hr').s.ui.unnamedPlayer).toBe('igrač bez imena');
    expect(new Lang('sr-Cyrl').s.ui.unnamedPlayer).toBe('играч без имена');
  });
});

describe('the lobby after a drop', () => {
  const n = src('src/net/useNetGame.ts');

  it('says it is reconnecting while the loop runs, and offers Retry only after it gives up', () => {
    const loop = n.slice(n.indexOf('const reconnect = useCallback('), n.indexOf('useEffect(() => {\n    reconnectRef.current'.replace('\n', n.includes('\r\n') ? '\r\n' : '\n')));
    expect(loop).toMatch(/reconnectingRef\.current = true;\s*(\/\/[^\n]*\n\s*)*setStatus\('connecting'\);/);
    expect(loop).toMatch(/reconnectTokenRef\.current = null;\s*setAtTable\(false\);\s*setStatus\('disconnected'\);/);
    // The table still reads the whole wait as reconnecting.
    expect(n).toMatch(/reconnecting: atTable && \(status === 'disconnected' \|\| status === 'connecting'\),/);
  });

  it('drops a join that lands after the player left, instead of seating nobody', () => {
    const connect = n.slice(n.indexOf('const connect = useCallback('), n.indexOf('const reconnect = useCallback('));
    expect(connect).toMatch(/leave\(\);\s*\/\/[^\n]*\n\s*const gen = connGenRef\.current;/);
    expect(connect).toMatch(/if \(gen !== connGenRef\.current\) \{\s*void room\.leave\(true\)\.catch\(\(\) => \{\}\);\s*return;\s*\}\s*attach\(room\);/);
    expect(connect).toMatch(/\} catch \(err\) \{\s*if \(gen !== connGenRef\.current\) return;/);
    // Leaving, and the screen going, both move the count on.
    const leave = n.slice(n.indexOf('const leave = useCallback('), n.indexOf('const leave = useCallback(') + 2000);
    expect(leave).toMatch(/reconnectTokenRef\.current = null;\s*connGenRef\.current \+= 1;/);
    expect((n.match(/connGenRef\.current \+= 1/g) ?? []).length).toBe(2);
  });
});

describe("the shop's why-not", () => {
  it('is a toast over the screen, never a line in the grid', () => {
    const s = src('src/screens/ShopScreen.tsx');
    expect(s).toMatch(/\) : why \? \(\s*(\/\/[^\n]*\n\s*)*<View style=\{styles\.whyToast\} pointerEvents="none">\s*<Text style=\{styles\.why\} role="alert">/);
    expect(s).not.toMatch(/\{why && \(/);
    expect(s).toMatch(/whyToast: \{\s*position: 'absolute',/);
  });
});

describe('the Ručno an older app set by itself', () => {
  it('goes back to the default once, for settings saved before arrangeTips existed', () => {
    const st = src('src/storage.ts');
    expect(st).toMatch(/if \(s\.handSort === 'manual' && !\(store\.getString\(KEY\.settings\) \?\? ''\)\.includes\('"arrangeTips"'\)\) \{\s*s = \{ \.\.\.s, handSort: 'auto' \};\s*write\(KEY\.settings, s\);/);
    // Saved again with arrangeTips in it, a Ručno chosen from now on stays.
    expect(st).toMatch(/arrangeTips: 0,/);
  });
});

describe('the English history line', () => {
  it('names the mode as the English settings do', () => {
    const en = new Lang('en').s;
    expect(en.ui.recordMeta(1001, true, null, null)).toContain(en.difficultyHard);
    expect(en.ui.recordMeta(1001, true, null, null)).not.toContain('Prava');
  });
});
