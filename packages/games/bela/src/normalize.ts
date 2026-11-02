import { RANKS, SUITS, type Action, type Card, type Rank, type Seat, type Suit } from '@belot/shared-types';

const isSuit = (v: unknown): v is Suit => typeof v === 'string' && SUITS.includes(v as Suit);
const isRank = (v: unknown): v is Rank => typeof v === 'string' && RANKS.includes(v as Rank);

/**
 * Rebuild an action from a client message using only values the server names
 * itself.
 *
 * Validating in place is not enough: the engine stores what it is given, and a
 * `structuredClone` or a msgpack encode of an attacker-shaped object throws far
 * away from any handler that could catch it. Everything below is a fresh
 * literal built from checked primitives, so the client's object is dropped on
 * the floor whatever it contained.
 *
 * Legality is NOT checked here: the engine rejects an illegal action itself,
 * and under `renonsMode: 'punish'` an illegal card is a legitimate move.
 */
export function cleanAction(raw: unknown, seat: Seat): Action | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as Record<string, unknown>;
  // A client may only ever move its own seat.
  if (a.seat !== seat) return null;
  switch (a.type) {
    case 'BID_PASS':
    case 'DOUBLE_KONTRA':
    case 'DOUBLE_REKONTRA':
    case 'DOUBLE_PASS':
    case 'DECLARE_SKIP':
      return { type: a.type, seat };
    case 'DECLARE_ANNOUNCE': {
      // The marked cards must survive the rebuild, or the engine cannot check
      // the claim against the hand — and in blind mode a wrong marking would
      // then succeed online while failing offline. Rebuilt card by card like
      // any other, so nothing the client sent arrives by reference.
      if (a.cards === undefined) return { type: 'DECLARE_ANNOUNCE', seat };
      if (!Array.isArray(a.cards) || a.cards.length > 8) return null;
      const cards: Card[] = [];
      for (const raw of a.cards) {
        if (typeof raw !== 'object' || raw === null) return null;
        const { suit, rank } = raw as Record<string, unknown>;
        if (!isSuit(suit) || !isRank(rank)) return null;
        cards.push({ suit, rank });
      }
      return { type: 'DECLARE_ANNOUNCE', seat, cards };
    }
    case 'BID_CALL':
      return isSuit(a.suit) ? { type: 'BID_CALL', seat, suit: a.suit } : null;
    case 'PLAY_CARD': {
      const c = a.card;
      if (typeof c !== 'object' || c === null) return null;
      const { suit, rank } = c as Record<string, unknown>;
      if (!isSuit(suit) || !isRank(rank)) return null;
      const card: Card = { suit, rank };
      return a.announceBela === true
        ? { type: 'PLAY_CARD', seat, card, announceBela: true }
        : { type: 'PLAY_CARD', seat, card };
    }
    default:
      return null;
  }
}
