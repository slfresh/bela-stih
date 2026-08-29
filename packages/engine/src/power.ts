import type { Card, PlayContext, Rank } from '@belot/shared-types';

/**
 * The two value/rank systems that make Belot tricky. Everything is *derived*
 * from the play context; a card never stores its own power or points.
 *
 * THREE separate orderings live here and must never be crossed:
 *   1. trick-winning power  (trump:  J 9 A 10 K Q 8 7  /  plain: A 10 K Q J 9 8 7)
 *   2. point values         (trump:  J20 9-14 ...      /  plain: A11 10-10 ...)
 *   3. natural order         (7<8<9<10<J<Q<K<A) — sequence detection only (see declarations.ts)
 */

export function isTrump(card: Card, ctx: PlayContext): boolean {
  switch (ctx.contractType) {
    case 'ALL_TRUMPS':
      return true;
    case 'NO_TRUMPS':
      return false;
    case 'SUIT':
      return card.suit === ctx.trumpSuit;
  }
}

// Trick-winning power. Higher beats lower (within the same trump-ness / led suit).
const TRUMP_POWER: Record<Rank, number> = { J: 8, '9': 7, A: 6, '10': 5, K: 4, Q: 3, '8': 2, '7': 1 };
const PLAIN_POWER: Record<Rank, number> = { A: 8, '10': 7, K: 6, Q: 5, J: 4, '9': 3, '8': 2, '7': 1 };

export function rankPower(card: Card, ctx: PlayContext): number {
  return isTrump(card, ctx) ? TRUMP_POWER[card.rank] : PLAIN_POWER[card.rank];
}

// Point values (sum to 152 across a 32-card SUIT deal; +10 last trick => 162).
const TRUMP_POINTS: Record<Rank, number> = { J: 20, '9': 14, A: 11, '10': 10, K: 4, Q: 3, '8': 0, '7': 0 };
const PLAIN_POINTS: Record<Rank, number> = { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0 };

export function pointValue(card: Card, ctx: PlayContext): number {
  return isTrump(card, ctx) ? TRUMP_POINTS[card.rank] : PLAIN_POINTS[card.rank];
}

// Natural order — ONLY for sequence detection. Index 0..7 ascending.
const NATURAL_ORDER: Record<Rank, number> = { '7': 0, '8': 1, '9': 2, '10': 3, J: 4, Q: 5, K: 6, A: 7 };

export function naturalOrder(rank: Rank): number {
  return NATURAL_ORDER[rank];
}

/** Total card points available in a single SUIT deal (excludes last-trick bonus). */
export const CARD_POINTS_TOTAL = 152;
