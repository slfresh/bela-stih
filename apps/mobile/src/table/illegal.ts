import type { Card, Suit, TrickPlay } from '@belot/engine';
import { cardId } from '@belot/engine';

/** Why a card cannot be played right now, in the words a player would use. */
export type IllegalReason =
  /** Holding the led suit: it must be followed. */
  | { kind: 'follow'; suit: Suit }
  /** None of the led suit, but trumps: one must go on. */
  | { kind: 'trump' }
  /** The right suit, but a card that beats the trick is held and must be played. */
  | { kind: 'beat' }
  | { kind: 'other' };

/**
 * Why `card` is not among the plays the engine offered - read off those
 * plays, so no rule is restated here: the engine's legal set says which cards
 * go, and this only says which of the three duties shaped it.
 *
 * Null when the card is legal, or when nothing may be played at all.
 */
export function illegalReason(
  card: Card,
  legal: readonly Card[],
  trick: readonly TrickPlay[],
  trump: Suit | null,
): IllegalReason | null {
  if (legal.length === 0) return null;
  const id = cardId(card);
  if (legal.some((c) => cardId(c) === id)) return null;
  const led = trick[0]?.card.suit ?? null;
  if (led !== null && card.suit !== led && legal.every((c) => c.suit === led)) return { kind: 'follow', suit: led };
  if (trump !== null && card.suit !== trump && legal.every((c) => c.suit === trump)) return { kind: 'trump' };
  if (legal.some((c) => c.suit === card.suit)) return { kind: 'beat' };
  return { kind: 'other' };
}
