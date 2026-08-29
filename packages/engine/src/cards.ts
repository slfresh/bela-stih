import type { Card, Rank, Suit } from '@belot/shared-types';
import { RANKS, SUITS } from '@belot/shared-types';

const SUIT_SYMBOL: Record<Suit, string> = {
  spades: 'S',
  hearts: 'H',
  diamonds: 'D',
  clubs: 'C',
};

const SYMBOL_SUIT: Record<string, Suit> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

/** Full 32-card Belot deck (4 suits x 8 ranks). */
export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Stable, human-readable id, e.g. "AS", "10H", "JD". */
export function cardId(c: Card): string {
  return `${c.rank}${SUIT_SYMBOL[c.suit]}`;
}

/** Parse a card id back into a Card. Throws on malformed input. */
export function parseCard(id: string): Card {
  const sym = id.slice(-1);
  const rank = id.slice(0, -1) as Rank;
  const suit = SYMBOL_SUIT[sym];
  if (!suit || !RANKS.includes(rank)) {
    throw new Error(`Invalid card id: ${id}`);
  }
  return { suit, rank };
}

export function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function hasCard(hand: Card[], c: Card): boolean {
  return hand.some((x) => cardEquals(x, c));
}

export function removeCard(hand: Card[], c: Card): Card[] {
  const i = hand.findIndex((x) => cardEquals(x, c));
  if (i < 0) throw new Error(`Card ${cardId(c)} not in hand`);
  return [...hand.slice(0, i), ...hand.slice(i + 1)];
}

// ---------------------------------------------------------------------------
// Deterministic RNG — injected so shuffles are reproducible in tests and so the
// server can seed with a CSPRNG. mulberry32 is tiny, fast, and good enough for
// shuffling (it is NOT cryptographic — the server must seed it from crypto).
// ---------------------------------------------------------------------------

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates using an injected RNG. Returns a new array; does not mutate. */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}
