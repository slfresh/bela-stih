import { describe, expect, it } from 'vitest';
import { cardId, legalPlays, parseCard, type PlayContext, type Seat, type TrickPlay } from '@belot/engine';

const TRUMP: PlayContext = { contractType: 'SUIT', trumpSuit: 'spades' };
const c = parseCard;

/** Build a trick from [seat, cardId] pairs, in play order. */
function trick(...plays: Array<[Seat, string]>): TrickPlay[] {
  return plays.map(([seat, id]) => ({ seat, card: c(id) }));
}

/**
 * `forced` mirrors config.forcedOvertrumpOverPartner and defaults to TRUE here
 * exactly as in DEFAULT_CONFIG — the native Croatian rule has no partner
 * exemption. Passing false exercises the French-lineage house rule.
 */
function legal(hand: string[], t: TrickPlay[], mySeat: Seat, forced = true): string[] {
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

describe('following suit — pravilo ibera', () => {
  it('lets the leader play anything', () => {
    const hand = ['AH', '7D', 'JS'];
    expect(legal(hand, [], 0)).toEqual(['7D', 'AH', 'JS'].sort());
  });

  it('forces beating the highest led-suit card when able (iber)', () => {
    // hr.wikipedia's own example: led 8, holding 7 and 10 you MUST play the 10.
    const hand = ['10H', '7H', 'JS', 'AD'];
    const t = trick([0, '8H']);
    expect(legal(hand, t, 1)).toEqual(['10H']);
  });

  it('beats the highest card of the trick so far, not just the lead', () => {
    // Led 8H, then QH: our JH no longer beats (plain order A 10 K Q J 9 8 7);
    // only the KH does.
    const hand = ['KH', 'JH', '7H'];
    const t = trick([0, '8H'], [1, 'QH']);
    expect(legal(hand, t, 2)).toEqual(['KH']);
  });

  it('allows any led-suit card when none of ours can beat', () => {
    const hand = ['9H', '7H', 'JS'];
    const t = trick([0, 'AH']);
    expect(legal(hand, t, 1)).toEqual(['7H', '9H'].sort());
  });

  it('suspends iber once the trick has been cut by a trump', () => {
    // hr.wikipedia: after a cut you must still follow the led suit, but any
    // card of it will do — you cannot win the trick anyway.
    const hand = ['AH', '7H'];
    const t = trick([0, '8H'], [1, '9S']); // seat 1 void, cuts with trump
    expect(legal(hand, t, 2)).toEqual(['7H', 'AH'].sort());
  });

  it('applies iber even when the partner leads (native rule)', () => {
    // Seat 2's partner is seat 0, currently winning with 10H. Iber still binds.
    const hand = ['AH', '7H'];
    const t = trick([0, '10H'], [1, '9H']);
    expect(legal(hand, t, 2)).toEqual(['AH']);
  });

  it('house rule: partner exemption lifts iber within the suit', () => {
    const hand = ['AH', '7H'];
    const t = trick([0, '10H'], [1, '9H']);
    expect(legal(hand, t, 2, false)).toEqual(['7H', 'AH'].sort());
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

  it('keeps the rise obligation over a winning partner (native rule)', () => {
    const hand = ['JS', '7S'];
    // We are seat 3; our partner is seat 1, who holds the trick with 10S.
    const t = trick([0, '8S'], [1, '10S'], [2, '7H']);
    expect(legal(hand, t, 3)).toEqual(['JS']);
  });

  it('house rule: partner exemption drops the rise obligation', () => {
    const hand = ['JS', '7S'];
    const t = trick([0, '8S'], [1, '10S'], [2, '7H']);
    expect(legal(hand, t, 3, false)).toEqual(['7S', 'JS'].sort());
  });
});

/**
 * Void in the led suit: "mora se rezati" — trumping is unconditional in the
 * native rules, even over a winning partner. The French exemption survives
 * only behind the house-rule knob.
 */
describe('void in the led suit while our partner is winning', () => {
  const t = trick([0, '10H'], [1, 'AH'], [2, '7H']);
  const hand = ['JS', '7S', 'AC', '8D'];

  it('forces the cut even over the partner (native rule)', () => {
    expect(legal(hand, t, 3)).toEqual(['7S', 'JS'].sort());
  });

  it('house rule: free discard over a winning partner', () => {
    expect(legal(hand, t, 3, false)).toEqual(['7S', '8D', 'AC', 'JS'].sort());
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

  it('forces the undertrump when unable to over-trump — no plain discard', () => {
    // A trump must hit the felt even when it cannot win ("podrezivanje").
    const t = trick([0, 'AH'], [1, 'JS']);
    const hand = ['7S', '8S', 'AC', '9D'];
    expect(legal(hand, t, 2)).toEqual(['7S', '8S'].sort());
  });
});
