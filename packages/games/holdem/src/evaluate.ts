import { rankValue, type Card52 } from '@belot/cards';

/**
 * Poker hand evaluation: the best five of up to seven cards, as one number.
 *
 * The score is the category times 16^5 plus up to five tie-breaking ranks in
 * base 16, so any two hands compare with `>` and equal scores split the pot.
 * Direct, not by trying all 21 five-card subsets: counted ranks and suits,
 * a bitmask for straights — fast enough to run inside a bot's simulations.
 */

export type Category =
  | 'highCard'
  | 'pair'
  | 'twoPair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'quads'
  | 'straightFlush';

export const CATEGORIES: readonly Category[] = ['highCard', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush'];

const B = 16;
const score = (cat: number, ranks: number[]): number => {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * B + (ranks[i] ?? 0);
  return s;
};

/** The top of the best straight in a set of ranks (5 for the wheel), or 0. */
function straightTop(mask: number): number {
  // Ace plays low too.
  const m = mask | (mask & (1 << 14) ? 1 << 1 : 0);
  for (let top = 14; top >= 5; top--) {
    const run = 0b11111 << (top - 4);
    if ((m & run) === run) return top;
  }
  return 0;
}

export function evaluate(cards: Card52[]): number {
  const counts = new Array<number>(15).fill(0);
  const bySuit: Record<string, number[]> = { spades: [], hearts: [], diamonds: [], clubs: [] };
  let mask = 0;
  for (const c of cards) {
    const v = rankValue(c.rank);
    counts[v]! += 1;
    bySuit[c.suit]!.push(v);
    mask |= 1 << v;
  }

  // Flush and straight flush. (In seven cards a flush can never sit beside
  // quads or a full house: those spread over too many suits to leave five of
  // one, so a flush found here is the hand.)
  for (const vs of Object.values(bySuit)) {
    if (vs.length >= 5) {
      let fm = 0;
      for (const v of vs) fm |= 1 << v;
      const sf = straightTop(fm);
      if (sf) return score(8, [sf]);
      if (cards.length <= 7) return score(5, vs.sort((a, b) => b - a).slice(0, 5));
    }
  }

  const ranksBy = (n: number) => {
    const out: number[] = [];
    for (let v = 14; v >= 2; v--) if (counts[v] === n) out.push(v);
    return out;
  };
  const quads = ranksBy(4);
  const trips = ranksBy(3);
  const pairs = ranksBy(2);
  const singles = ranksBy(1);
  const kickers = (exclude: number[], k: number) => {
    const out: number[] = [];
    for (let v = 14; v >= 2 && out.length < k; v--) if (counts[v]! > 0 && !exclude.includes(v)) out.push(v);
    return out;
  };

  if (quads.length > 0) return score(7, [quads[0]!, ...kickers([quads[0]!], 1)]);
  if (trips.length > 0 && (trips.length >= 2 || pairs.length > 0)) {
    const t = trips[0]!;
    const p = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return score(6, [t, p]);
  }
  const st = straightTop(mask);
  if (st) return score(4, [st]);
  if (trips.length > 0) return score(3, [trips[0]!, ...kickers([trips[0]!], 2)]);
  if (pairs.length >= 2) return score(2, [pairs[0]!, pairs[1]!, ...kickers([pairs[0]!, pairs[1]!], 1)]);
  if (pairs.length === 1) return score(1, [pairs[0]!, ...kickers([pairs[0]!], 3)]);
  return score(0, singles.slice(0, 5));
}

export function categoryOf(scoreValue: number): Category {
  return CATEGORIES[Math.floor(scoreValue / B ** 5)]!;
}

/** The five cards that make the best hand, for showing at a showdown. */
export function bestFive(cards: Card52[]): Card52[] {
  if (cards.length <= 5) return cards.slice();
  const target = evaluate(cards);
  const pick = (from: number, chosen: Card52[]): Card52[] | null => {
    if (chosen.length === 5) return evaluate(chosen) === target ? chosen : null;
    for (let i = from; i < cards.length; i++) {
      const found = pick(i + 1, [...chosen, cards[i]!]);
      if (found) return found;
    }
    return null;
  };
  return pick(0, []) ?? cards.slice(0, 5);
}
