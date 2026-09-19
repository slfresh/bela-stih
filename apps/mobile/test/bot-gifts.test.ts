import { describe, expect, it } from 'vitest';
import type { Seat } from '@belot/engine';
import type { TableEvent } from '@belot/table';
import { BOT_GIFTS_START, botGiftStep, botThanks, type BotGiftState } from '../src/botGifts';

/** A seeded generator, so every rule below is checked on the same thousands of rolls. */
function rngOf(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const HUMAN = 0 as Seat;
const dealStarted = (n: number): TableEvent => ({ kind: 'dealStarted', dealNumber: n, dealer: (n % 4) as Seat });
const trick = (seat: Seat, points: number, last = false): TableEvent => ({
  kind: 'trickWon',
  seat,
  trickNumber: 1,
  points,
  isLastTrick: last,
});
const scored = (us: number, them: number): TableEvent =>
  ({ kind: 'dealScored', result: { finalScore: [us, them] }, matchScores: [0, 0] }) as unknown as TableEvent;

/** Play `deals` deals of a scripted table through the rules; return every gift and the deal it came in. */
function simulate(seed: number, deals: number) {
  const rng = rngOf(seed);
  let st: BotGiftState = BOT_GIFTS_START;
  const gifts: { deal: number; from: Seat; id: string; event: string }[] = [];
  const feed = (e: TableEvent) => {
    const r = botGiftStep(e, st, HUMAN, rng);
    st = r.state;
    if (r.gift) gifts.push({ deal: st.deal, from: r.gift.from, id: r.gift.id, event: e.kind });
  };
  for (let d = 1; d <= deals; d++) {
    feed(dealStarted(d));
    for (let t = 0; t < 8; t++) feed(trick(((t + d) % 4) as Seat, (t * 7 + d) % 40, t === 7));
    feed(scored(d % 3 === 0 ? 200 : 20, d % 3 === 0 ? 20 : 200));
  }
  return gifts;
}

describe('the bots and gifts', () => {
  it('give at most one gift a deal, and never two deals running', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const gifts = simulate(seed, 40);
      const deals = gifts.map((g) => g.deal);
      expect(new Set(deals).size, `seed ${seed}`).toBe(deals.length);
      for (let i = 1; i < deals.length; i++) expect(deals[i]! - deals[i - 1]!, `seed ${seed}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('coffee comes from the partner after my good trick; tissues from an opponent as the next deal starts', () => {
    let coffees = 0;
    let tissues = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const g of simulate(seed, 40)) {
        if (g.id === 'kava') {
          coffees++;
          expect(g.from).toBe(2);
          expect(g.event).toBe('trickWon');
        } else {
          tissues++;
          expect(g.id).toBe('maramice');
          expect(g.from % 2).toBe(1);
          expect(g.event).toBe('dealStarted');
        }
      }
    }
    // Both happen — the rules are not dead code — but neither floods the table.
    expect(coffees).toBeGreaterThan(50);
    expect(tissues).toBeGreaterThan(50);
  });

  it('never for a small trick, the last trick, an opponent\'s trick, or tissues after a won deal', () => {
    const always = () => 0;
    const s = { ...BOT_GIFTS_START, deal: 5 };
    expect(botGiftStep(trick(HUMAN, 19), s, HUMAN, always).gift).toBeUndefined();
    expect(botGiftStep(trick(HUMAN, 30, true), s, HUMAN, always).gift).toBeUndefined();
    expect(botGiftStep(trick(1 as Seat, 30), s, HUMAN, always).gift).toBeUndefined();
    expect(botGiftStep(trick(HUMAN, 30), s, HUMAN, always).gift?.id).toBe('kava');
    const won = botGiftStep(scored(120, 40), s, HUMAN, always).state;
    expect(botGiftStep(dealStarted(6), won, HUMAN, always).gift).toBeUndefined();
    const lost = botGiftStep(scored(40, 120), s, HUMAN, always).state;
    expect(botGiftStep(dealStarted(6), lost, HUMAN, always).gift?.id).toBe('maramice');
  });

  it('thank for a gift at most twice, never on my behalf', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = botThanks([0, 1, 2, 3] as Seat[], HUMAN, rngOf(seed));
      expect(r.length).toBeLessThanOrEqual(2);
      expect(r.every((t) => t.seat !== HUMAN)).toBe(true);
    }
    expect(botThanks([1, 2, 3] as Seat[], HUMAN, () => 0).length).toBe(2);
  });
});
