import { describe, expect, it } from 'vitest';
import {
  CARD_POINTS_TOTAL,
  beats,
  cardId,
  detectDeclarations,
  isTrump,
  makeDeck,
  naturalOrder,
  parseCard,
  pointValue,
  rankPower,
  trickWinnerIndex,
  type PlayContext,
} from '@belot/engine';

const SPADE_TRUMP: PlayContext = { contractType: 'SUIT', trumpSuit: 'spades' };

const c = parseCard;

describe('deck', () => {
  it('has 32 unique cards', () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(32);
    expect(new Set(deck.map(cardId)).size).toBe(32);
  });

  it('carries exactly 152 card points in a suit deal', () => {
    const total = makeDeck().reduce((s, card) => s + pointValue(card, SPADE_TRUMP), 0);
    expect(total).toBe(CARD_POINTS_TOTAL);
    expect(total).toBe(152);
  });

  it('round-trips card ids, including the two-character rank', () => {
    for (const card of makeDeck()) {
      expect(parseCard(cardId(card))).toEqual(card);
    }
    expect(c('10H')).toEqual({ suit: 'hearts', rank: '10' });
  });
});

describe('the two value systems are context-derived', () => {
  it('values the same Jack at 20 in trump and 2 outside it', () => {
    expect(pointValue(c('JS'), SPADE_TRUMP)).toBe(20);
    expect(pointValue(c('JH'), SPADE_TRUMP)).toBe(2);
  });

  it('values the same Nine at 14 in trump and 0 outside it', () => {
    expect(pointValue(c('9S'), SPADE_TRUMP)).toBe(14);
    expect(pointValue(c('9H'), SPADE_TRUMP)).toBe(0);
  });

  it('orders trump J-9-A-10-K-Q-8-7', () => {
    const order = ['JS', '9S', 'AS', '10S', 'KS', 'QS', '8S', '7S'].map(c);
    for (let i = 1; i < order.length; i++) {
      expect(rankPower(order[i - 1]!, SPADE_TRUMP)).toBeGreaterThan(
        rankPower(order[i]!, SPADE_TRUMP),
      );
    }
  });

  it('orders plain suits A-10-K-Q-J-9-8-7', () => {
    const order = ['AH', '10H', 'KH', 'QH', 'JH', '9H', '8H', '7H'].map(c);
    for (let i = 1; i < order.length; i++) {
      expect(rankPower(order[i - 1]!, SPADE_TRUMP)).toBeGreaterThan(
        rankPower(order[i]!, SPADE_TRUMP),
      );
    }
  });

  it('treats every suit as trump under ALL_TRUMPS and none under NO_TRUMPS', () => {
    const all: PlayContext = { contractType: 'ALL_TRUMPS', trumpSuit: null };
    const none: PlayContext = { contractType: 'NO_TRUMPS', trumpSuit: null };
    expect(makeDeck().every((card) => isTrump(card, all))).toBe(true);
    expect(makeDeck().some((card) => isTrump(card, none))).toBe(false);
    expect(pointValue(c('JH'), all)).toBe(20);
    expect(pointValue(c('JH'), none)).toBe(2);
  });
});

/**
 * THE classic Belot engine bug: reusing the trick-winning comparator for
 * sequence detection (or vice-versa). These two orderings must stay independent.
 */
describe('trick order and sequence order never cross', () => {
  it('ranks trump J above A for tricks but below A naturally', () => {
    expect(rankPower(c('JS'), SPADE_TRUMP)).toBeGreaterThan(rankPower(c('AS'), SPADE_TRUMP));
    expect(naturalOrder('J')).toBeLessThan(naturalOrder('A'));
  });

  it('detects 9-10-J of trump as a terca even though their trump powers are not consecutive', () => {
    // Trump powers here are 9->7, 10->5, J->8: wildly non-consecutive.
    const powers = ['9S', '10S', 'JS'].map((id) => rankPower(c(id), SPADE_TRUMP));
    expect(powers).toEqual([7, 5, 8]);

    // Natural order 2,3,4 IS consecutive, so this is a terca worth 20.
    const hand = ['9S', '10S', 'JS', 'AH', '7D', '8C', 'KH', 'QD'].map(c);
    const decls = detectDeclarations(hand, 0);
    expect(decls).toHaveLength(1);
    expect(decls[0]!.kind).toBe('sequence');
    expect(decls[0]!.length).toBe(3);
    expect(decls[0]!.value).toBe(20);
    expect(decls[0]!.topRank).toBe('J');
  });

  it('does not treat the trump-power run J-9-A as a sequence', () => {
    const hand = ['JS', '9S', 'AS', '7H', '8D', '9C', 'KH', 'QD'].map(c);
    // Natural orders are 4, 2, 7 — no three consecutive, so no declaration.
    expect(detectDeclarations(hand, 0)).toHaveLength(0);
  });
});

describe('trick resolution', () => {
  it('lets any trump beat any plain card', () => {
    expect(beats(c('7S'), c('AH'), 'hearts', SPADE_TRUMP)).toBe(true);
    expect(beats(c('AH'), c('7S'), 'spades', SPADE_TRUMP)).toBe(false);
  });

  it('ignores off-suit discards that are neither trump nor the led suit', () => {
    const plays = ['AH', '7H', 'AD', 'AC'].map(c); // hearts led, two off-suit aces
    expect(trickWinnerIndex(plays, SPADE_TRUMP)).toBe(0);
  });

  it('awards the trick to the highest trump when several players cut', () => {
    const plays = ['AH', '7S', '10H', 'JS'].map(c);
    expect(trickWinnerIndex(plays, SPADE_TRUMP)).toBe(3); // JS is the top trump
  });

  it('keeps the earlier card when a later one cannot beat it', () => {
    const plays = ['10H', 'AH', 'KH'].map(c);
    expect(trickWinnerIndex(plays, SPADE_TRUMP)).toBe(1);
  });
});
