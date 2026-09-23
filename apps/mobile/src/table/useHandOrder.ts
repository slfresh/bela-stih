import { useMemo, useRef, useState } from 'react';
import type { Card, Suit } from '@belot/engine';
import { cardId } from '@belot/engine';

/**
 * The order the player's cards are laid out in.
 *
 * Three modes:
 *  - `auto` — trump first, and within trump the TRUMP order (J 9 A 10 K Q 8 7)
 *    rather than the plain one. This is how a player actually holds a hand once
 *    trump is called, and the old fixed sort ignored trump entirely.
 *  - `suits` — a fixed suit order, so a card never moves for the whole match.
 *  - `manual` — whatever the player arranged, kept until the hand is played out.
 *
 * Arranging (a swap) makes the hand in front of you manual until its cards
 * are played out; the next deal comes back in the saved order. It used to
 * switch the saved setting to `manual` for good, so one swap quietly ended
 * trump-first sorting for every deal after it.
 *
 * Order is tracked by CARD ID, never by array identity: `view.hand` is a fresh
 * array on every director tick, so anything keyed on the array itself would be
 * rebuilt constantly and a manual arrangement would not survive one animation.
 */

export type HandSort = 'auto' | 'suits' | 'manual';

const SUIT_ORDER: Suit[] = ['clubs', 'spades', 'hearts', 'diamonds'];
const PLAIN_RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
/** Trump power, strongest last so the sort reads the same way as the plain one. */
const TRUMP_RANKS = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];

function comparator(trump: Suit | null) {
  return (a: Card, b: Card): number => {
    const suitRank = (s: Suit) => (s === trump ? -1 : SUIT_ORDER.indexOf(s));
    const s = suitRank(a.suit) - suitRank(b.suit);
    if (s !== 0) return s;
    const ranks = trump !== null && a.suit === trump ? TRUMP_RANKS : PLAIN_RANKS;
    return ranks.indexOf(a.rank) - ranks.indexOf(b.rank);
  };
}

export interface HandOrder {
  cards: Card[];
  mode: HandSort;
  /** Swap two cards: this hand keeps the arrangement until it is played out. */
  swap: (idA: string, idB: string) => void;
}

export function useHandOrder(
  hand: Card[],
  trump: Suit | null,
  mode: HandSort,
  /** Anything that changes with every deal (the dealer): a new deal is a new hand. */
  deal: unknown = null,
): HandOrder {
  // The arrangement, as card ids. Survives every re-render and every deal.
  const manual = useRef<string[]>([]);
  // This hand was arranged by the player: manual until its cards are gone.
  const arranged = useRef(false);
  const dealWas = useRef(deal);
  // A nonce, not just a re-render: `cards` is a useMemo, so bumping state
  // without touching its deps returns the cached array and the swap is
  // invisible. The first swap once only appeared because switching to
  // 'manual' changed a dep — and that switch was persisted, so the feature
  // bricked itself after one use.
  const [nonce, forceRender] = useState(0);

  const ids = hand.map(cardId).join(',');

  const cards = useMemo(() => {
    const byId = new Map(hand.map((c) => [cardId(c), c]));
    const sorted = [...hand].sort(comparator(trump));

    // A new hand - another deal, or none of the arranged cards left (a deal
    // cut short by a renons leaves some) - and the saved order is back.
    if (deal !== dealWas.current || (arranged.current && !manual.current.some((id) => byId.has(id)))) {
      dealWas.current = deal;
      arranged.current = false;
    }
    if (mode !== 'manual' && !arranged.current) {
      manual.current = [];
      return sorted;
    }

    // Reconcile: drop what has been played, and slot anything new (the talon's
    // two cards) into its sorted position rather than dangling it on the end.
    const kept = manual.current.filter((id) => byId.has(id));
    const missing = sorted.filter((c) => !kept.includes(cardId(c)));
    const order = [...kept];
    for (const card of missing) {
      const at = sorted.indexOf(card);
      const before = sorted
        .slice(0, at)
        .map(cardId)
        .filter((id) => order.includes(id));
      const idx = before.length === 0 ? 0 : order.indexOf(before[before.length - 1]!) + 1;
      order.splice(idx, 0, cardId(card));
    }
    manual.current = order;
    return order.map((id) => byId.get(id)!).filter(Boolean);
    // `ids` is the real dependency: re-sorting on every tick would fight the
    // director, and the hand only changes when a card leaves or arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, trump, mode, nonce, deal]);

  const swap = (idA: string, idB: string) => {
    const order = manual.current.length > 0 ? [...manual.current] : cards.map(cardId);
    const i = order.indexOf(idA);
    const j = order.indexOf(idB);
    if (i < 0 || j < 0 || i === j) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    manual.current = order;
    arranged.current = true;
    forceRender((n) => n + 1);
  };

  return { cards, mode: arranged.current ? 'manual' : mode, swap };
}
