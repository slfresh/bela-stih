import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Lang, LOCALE_IDS } from '@belot/i18n';
import { retryHelps, troubleOf } from '../src/net/trouble';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string) => readFileSync(join(here, '..', f), 'utf8');

describe('a failed way to a table, in the player-s words', () => {
  it('knows the causes by what Colyseus 0.16 actually says (measured on the server)', () => {
    expect(troubleOf({ name: 'MatchMakeError', code: 4212, message: 'room "ZZZZZ" not found' })).toBe('noSuchTable');
    expect(troubleOf({ name: 'MatchMakeError', code: 4212, message: 'room "7NMTP" is locked' })).toBe('tableClosed');
    expect(troubleOf({ name: 'ServerError', message: 'connect ECONNREFUSED 127.0.0.1:9' })).toBe('offline');
    expect(troubleOf(new TypeError('Failed to fetch'))).toBe('offline');
    expect(troubleOf(new TypeError('Network request failed'))).toBe('offline');
    expect(troubleOf({ code: 4216, message: 'application error' })).toBe('server');
    expect(troubleOf(null)).toBe('offline');
  });

  it('offers to try again only where that can help', () => {
    expect(retryHelps('offline')).toBe(true);
    expect(retryHelps('server')).toBe(true);
    expect(retryHelps('noSuchTable')).toBe(false);
    expect(retryHelps('tableClosed')).toBe(false);
    const o = src('src/net/OnlineGame.tsx');
    // ...and after a dropped lobby, which it never did.
    expect(o).toMatch(/const canRetry = \(net\.status === 'error' && retryHelps\(net\.trouble\)\) \|\| net\.status === 'disconnected';/);
  });

  it('never shows the server-s address or the library-s words', () => {
    const o = src('src/net/OnlineGame.tsx');
    expect(o).not.toMatch(/cannotConnect\(SERVER_URL\)/);
    expect(o).not.toMatch(/\{net\.error\}/);
    expect(o).toMatch(/\? ui\.troubleNoSuchTable/);
    // A failed or dropped table's code and invitation lead nowhere: gone.
    expect(o).toMatch(/net\.roomId && columnW > 0 && \(net\.status === 'waiting' \|\| net\.status === 'connecting'\) \?/);
    expect(src('src/net/useNetGame.ts')).toMatch(/setTrouble\(troubleOf\(err\)\);/);
  });

  it('in every language, each cause its own sentence', () => {
    for (const id of LOCALE_IDS) {
      const ui = new Lang(id).s.ui;
      const all = [ui.troubleNoSuchTable, ui.troubleTableClosed, ui.troubleOffline, ui.troubleServer, ui.troubleDropped];
      expect(new Set(all).size, id).toBe(5);
      for (const t of all) expect(t, id).not.toMatch(/wss?:\/\/|4212|locked|not found/);
    }
  });
});
