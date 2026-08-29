import { describe, expect, it } from 'vitest';
import { cardId, legalPlays, parseCard, type PlayContext, type Seat, type TrickPlay } from '@belot/engine';

const TRUMP: PlayContext = { contractType: 'SUIT', trumpSuit: 'spades' };
const c = parseCard;

/** Build a trick from [seat, cardId] pairs, in play order. */
function trick(...plays: Array<[Seat, string]>): TrickPlay[] {
  return plays.map(([seat, id]) => ({ seat, card: c(id) }));
}

function legal(hand: string[], t: TrickPlay[], mySeat: Seat, forced = false): string[] {
  return legalPlays({
    hand: hand.map(c),
    trick: t,
    mySeat,
    ctx: TRUMP,
    forcedOvertrumpOverPartner: forced,
  })
    .map(cardId)
    .sort();
}

describe('following suit', () => {
  it('lets the leader play anything', () => {
    const hand = ['AH', '7D', 'JS'];
    expect(legal(hand, [], 0)).toEqual(['7D', 'AH', 'JS'].sort());
  });

  it('forces following the led plain suit when able', () => {
    const hand = ['AH', '7H', 'JS', 'AD'];
    const t = trick([0, '10H']);
    expect(legal(hand, t, 1)).toEqual(['7H', 'AH'].sort());
  });

  it('does not force rising within a plain suit', () => {
    // 10H is winning; we hold both a higher and a lower heart and may play either.
    const hand = ['AH', '7H'];
    const t = trick([0, '10H']);
    expect(legal(hand, t, 1)).toEqual(['7H', 'AH'].sort());
  });
});

describe('when trump is led', () => {
  it('forces rising above the highest trump played', () => {
    const hand = ['JS', '7S', 'AH'];
    const t = trick([0, '10S']); // trump 10 leads
    // JS outranks 10S; 7S does not. Must play JS.
    expect(legal(hand, t, 1)).toEqual(['JS']);
  });

  it('allows any trump when none of ours can rise', () => {
    const hand = ['8S', '7S', 'AH'];
    const t = trick([0, 'JS']);
    expect(legal(hand, t, 1)).toEqual(['7S', '8S'].sort());
  });

  it('drops the rise obligation when our partner already holds the trick', () => {
    const hand = ['JS', '7S'];
    // We are seat 3; our partner is seat 1, who leads the trick with 10S.
    const t = trick([0, '8S'], [1, '10S'], [2, '7H']);
    expect(legal(hand, t, 3)).toEqual(['7S', 'JS'].sort());
  });

  it('keeps the rise obligation over a winning partner when configured to', () => {
    const hand = ['JS', '7S'];
    const t = trick([0, '8S'], [1, '10S'], [2, '7H']);
    expect(legal(hand, t, 3, true)).toEqual(['JS']);
  });
});

/**
 * The headline regional divergence ("ne piši po partneru"). Seat 3 is void in the
 * led suit and seat 1 — its partner — already holds the trick with the ace.
 */
describe('void in the led suit while our partner is winning', () => {
  const t = trick([0, '10H'], [1, 'AH'], [2, '7H']);
  const hand = ['JS', '7S', 'AC', '8D'];

  it('permits a free discard by default (ex-Yu)', () => {
    expect(legal(hand, t, 3, false)).toEqual(['7S', '8D', 'AC', 'JS'].sort());
  });

  it('forces the cut when forcedOvertrumpOverPartner is on', () => {
    expect(legal(hand, t, 3, true)).toEqual(['7S', 'JS'].sort());
  });
});

describe('void in the led suit while an opponent is winning', () => {
  it('forces a cut when the opponent leads with a plain card', () => {
    const t = trick([0, 'AH']);
    const hand = ['JS', '7S', 'AC', '8D'];
    expect(legal(hand, t, 1)).toEqual(['7S', 'JS'].sort());
  });

  it('allows anything when we hold no trump at all', () => {
    const t = trick([0, 'AH']);
    const hand = ['AC', '8D', 'KC'];
    expect(legal(hand, t, 1)).toEqual(['8D', 'AC', 'KC'].sort());
  });

  it('forces over-trumping when an opponent has already cut', () => {
    const t = trick([0, 'AH'], [1, '10S']);
    const hand = ['JS', '7S', 'AC'];
    expect(legal(hand, t, 2)).toEqual(['JS']);
  });

  it('permits a plain discard rather than a pointless undertrump', () => {
    const t = trick([0, 'AH'], [1, 'JS']);
    const hand = ['7S', '8S', 'AC', '9D'];
    expect(legal(hand, t, 2)).toEqual(['9D', 'AC'].sort());
  });

  it('forces the undertrump only when nothing but trumps remain', () => {
    const t = trick([0, 'AH'], [1, 'JS']);
    const hand = ['7S', '8S'];
    expect(legal(hand, t, 2)).toEqual(['7S', '8S'].sort());
  });
});

describe('trump led while we are void of trump', () => {
  it('is a free discard', () => {
    const t = trick([0, 'JS']);
    const hand = ['AH', '7D', 'KC'];
    expect(legal(hand, t, 1)).toEqual(['7D', 'AH', 'KC'].sort());
  });
});
