import { shuffle, type Rng } from '@belot/game-core';

/**
 * @belot/cards — the French 52-card deck the casino games share.
 *
 * Bela's own 32-card deck stays where it is (@belot/shared-types): its ranks,
 * suits and orderings are Bela's. These are the poker / baccarat / blackjack
 * ones. A card is suit + rank and an id; several decks shuffled together (a
 * shoe) give each copy its own id, so "the third ace of spades" is one card.
 */

export type Suit52 = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export const SUITS52: readonly Suit52[] = ['spades', 'hearts', 'diamonds', 'clubs'];

/** Ascending, deuce to ace. */
export type Rank52 = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export const RANKS52: readonly Rank52[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export interface Card52 {
  /** `As`, `Td`, `7h` — and `As.3` for the fourth deck's ace of spades in a shoe. */
  id: string;
  rank: Rank52;
  suit: Suit52;
}

const SUIT_LETTER: Record<Suit52, string> = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' };

export function makeDeck52(copy?: number): Card52[] {
  const out: Card52[] = [];
  for (const suit of SUITS52) {
    for (const rank of RANKS52) {
      out.push({ id: `${rank}${SUIT_LETTER[suit]}${copy === undefined ? '' : `.${copy}`}`, rank, suit });
    }
  }
  return out;
}

/** `decks` packs shuffled together, every copy with its own id. */
export function makeShoe(decks: number, rng: Rng): Card52[] {
  const all: Card52[] = [];
  for (let d = 0; d < decks; d++) all.push(...makeDeck52(d));
  return shuffle(all, rng);
}

/** 2 … 14 (ace high), for comparing ranks. */
export function rankValue(r: Rank52): number {
  return RANKS52.indexOf(r) + 2;
}

export const isRed = (c: Card52): boolean => c.suit === 'hearts' || c.suit === 'diamonds';

/** The card's own face, without a shoe copy number: `As.3` → `As`. */
export const faceId = (c: Card52): string => c.id.split('.')[0]!;

/** Matches every card id this package makes, for leak checks over a payload. */
export const CARD52_ID = /"([2-9TJQKA][shdc](?:\.\d+)?)"/g;
