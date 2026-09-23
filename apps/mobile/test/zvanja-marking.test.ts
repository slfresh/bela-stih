import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectDeclarations, type Card } from '@belot/engine';
import { pickAnnouncement } from '../src/table/zvanja';

const here = dirname(fileURLToPath(import.meta.url));
const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });
const key = (cards: readonly Card[]) => cards.map((x) => `${x.suit}${x.rank}`).sort().join('|');

// The hand from the report: a terca to the ace in list (leaves) and a terca to
// the king in srce (hearts), plus two cards that make nothing.
const doKeca = [c('spades', 'Q'), c('spades', 'K'), c('spades', 'A')];
const doKralja = [c('hearts', 'J'), c('hearts', 'Q'), c('hearts', 'K')];
const hand = [...doKeca, ...doKralja, c('clubs', '7'), c('diamonds', '9')];
const held = detectDeclarations(hand, 0);

describe('marking zvanja', () => {
  it('the hand really holds two zvanja', () => {
    expect(held).toHaveLength(2);
  });

  it('accepts BOTH marked at once - the natural thing to do', () => {
    const pick = pickAnnouncement([...doKeca, ...doKralja], held, 0);
    expect(pick).not.toBeNull();
    // What goes to the engine must be exactly ONE held combination: that is
    // the only pick it accepts, and it announces the whole holding from it.
    expect(held.map((d) => key(d.cards))).toContain(key(pick!));
  });

  it('accepts either one on its own, as before', () => {
    expect(key(pickAnnouncement(doKeca, held, 0)!)).toBe(key(doKeca));
    expect(key(pickAnnouncement(doKralja, held, 0)!)).toBe(key(doKralja));
  });

  it('refuses a marking with a card that belongs to no zvanje', () => {
    expect(pickAnnouncement([...doKeca, c('clubs', '7')], held, 0)).toBeNull();
    expect(pickAnnouncement([...doKeca, ...doKralja, c('diamonds', '9')], held, 0)).toBeNull();
  });

  it('refuses a combination only partly marked', () => {
    expect(pickAnnouncement([...doKeca, doKralja[0]!, doKralja[1]!], held, 0)).toBeNull();
    expect(pickAnnouncement(doKeca.slice(0, 2), held, 0)).toBeNull();
    expect(pickAnnouncement([], held, 0)).toBeNull();
  });

  it('blind mode: the app knows nothing, but still sends one combination of what was marked', () => {
    // Blind mode refuses to spot zvanja for the player - but splitting the
    // player's OWN marking into its combinations reveals nothing they did not
    // mark, and it is what a real table does when both are shown at once.
    const pick = pickAnnouncement([...doKeca, ...doKralja], null, 0);
    expect(held.map((d) => key(d.cards))).toContain(key(pick!));
    // A marking that is not made of combinations goes as it is: the engine
    // judges it, and a miss is the honest outcome that mode exists for.
    const junk = [c('clubs', '7'), c('diamonds', '9'), c('spades', 'Q')];
    expect(key(pickAnnouncement(junk, null, 0)!)).toBe(key(junk));
  });

  it('the table uses it for the button, the hint and the announcement', () => {
    const t = readFileSync(join(here, '../src/TableScreen.tsx'), 'utf8');
    expect(t).toMatch(/pickAnnouncement\(/);
    // The old test - the marking must EQUAL one combination - is gone.
    expect(t).not.toMatch(/\.join\('\|'\) === markedKey/);
  });
});

describe('the series between the same four players', () => {
  it('sits between the pills, ours first, in both orientations, once a match is won', () => {
    const t = readFileSync(join(here, '../src/TableScreen.tsx'), 'utf8');
    const head = t.slice(t.indexOf('const TableHeader = memo('), t.indexOf('// The view hands over fresh arrays'));
    // Ordered by MY team, like the pills - never by index 0/1.
    expect(head).toMatch(/\{series!\[us\]\}:\{series!\[them\]\}/);
    expect(head).toMatch(/const seriesShown = series !== null && series\[0\] \+ series\[1\] > 0;/);
    // The memo compares it, or a won match would never redraw the strip.
    expect(t).toMatch(/\(a\.series\?\.\[0\] \?\? -1\) === \(b\.series\?\.\[0\] \?\? -1\)/);
    // Both headers get it: the portrait strip and the landscape rail.
    expect((t.match(/winner=\{matchOver \? winnerTeam : null\}\s*series=\{series\}/g) ?? []).length).toBe(2);
  });
});
