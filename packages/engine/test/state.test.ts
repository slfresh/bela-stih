import { describe, expect, it } from 'vitest';
import {
  applyAction,
  cardId,
  createMatch,
  currentActor,
  legalActions,
  matchWinner,
  publicView,
  startDeal,
  teamOf,
  type Action,
  type Card,
  type GameState,
  type Seat,
} from '@belot/engine';

/** Deal with seat 0 on lead: the dealer sits at 3, so bidding opens at seat 0. */
function opened(seed = 7): GameState {
  return startDeal(createMatch({ dealer: 3, seed }));
}

function act(s: GameState, a: Action): GameState {
  return applyAction(s, a);
}

describe('dealing', () => {
  it('gives everyone six cards and holds eight back', () => {
    const s = opened();
    expect(s.phase).toBe('BID');
    expect(s.hands.map((h) => h.length)).toEqual([6, 6, 6, 6]);
    expect(s.stock).toHaveLength(8);
  });

  it('deals 32 distinct cards', () => {
    const s = opened();
    const all = [...s.hands.flat(), ...s.stock].map(cardId);
    expect(all).toHaveLength(32);
    expect(new Set(all).size).toBe(32);
  });

  it('opens the bidding to the dealers right (bela runs counter-clockwise)', () => {
    expect(opened().bidTurn).toBe(0);
    expect(startDeal(createMatch({ dealer: 0, seed: 7 })).bidTurn).toBe(1);
  });

  it('is reproducible from a seed and different across seeds', () => {
    const a = opened(42);
    const b = opened(42);
    const d = opened(43);
    expect(a.hands.map((h) => h.map(cardId))).toEqual(b.hands.map((h) => h.map(cardId)));
    expect(a.hands.map((h) => h.map(cardId))).not.toEqual(d.hands.map((h) => h.map(cardId)));
  });

  it('gives everyone eight cards once the contract is set', () => {
    const s = intoPlay();
    expect(s.phase).toBe('PLAY');
    expect(s.hands.map((h) => h.length)).toEqual([8, 8, 8, 8]);
    expect(s.stock).toHaveLength(0);
  });
});

describe('bidding', () => {
  it('rotates the turn on a pass', () => {
    let s = opened();
    s = act(s, { type: 'BID_PASS', seat: 0 });
    expect(s.bidTurn).toBe(1);
    expect(s.passCount).toBe(1);
  });

  it('forbids the dealer from passing out the deal (muss)', () => {
    let s = opened();
    s = act(s, { type: 'BID_PASS', seat: 0 });
    s = act(s, { type: 'BID_PASS', seat: 1 });
    s = act(s, { type: 'BID_PASS', seat: 2 });
    expect(s.bidTurn).toBe(3); // the dealer
    expect(legalActions(s).some((a) => a.type === 'BID_PASS')).toBe(false);
    expect(() => act(s, { type: 'BID_PASS', seat: 3 })).toThrow(/forced to call/);
  });

  it('redeals with a fresh dealer when muss is switched off and all four pass', () => {
    let s = startDeal(createMatch({ dealer: 3, seed: 5, config: { dealerMustCall: false } }));
    for (const seat of [0, 1, 2, 3] as Seat[]) s = act(s, { type: 'BID_PASS', seat });
    expect(s.phase).toBe('BID');
    expect(s.dealer).toBe(0); // rotated on from 3
    expect(s.bidTurn).toBe(1);
    expect(s.passCount).toBe(0);
  });

  it('records the caller and the trump suit', () => {
    const s = act(opened(), { type: 'BID_CALL', seat: 0, suit: 'hearts' });
    expect(s.callerSeat).toBe(0);
    expect(s.context).toEqual({ contractType: 'SUIT', trumpSuit: 'hearts' });
  });

  it('goes straight to play when the table does not use kontra', () => {
    const s = act(opened(), { type: 'BID_CALL', seat: 0, suit: 'hearts' });
    expect(s.phase).toBe('PLAY');
    expect(s.multiplier).toBe(1);
    expect(legalActions(s).every((a) => a.type === 'PLAY_CARD' || a.type.startsWith('DECLARE'))).toBe(
      true,
    );
  });

  it('rejects an action from the wrong seat', () => {
    const s = opened();
    expect(() => act(s, { type: 'BID_PASS', seat: 2 })).toThrow(/out of turn/);
  });
});

/** Both defenders must get a kontra chance, and both callers a rekontra chance. */
describe('kontra and rekontra (opt-in)', () => {
  const openedWithKontra = () =>
    startDeal(createMatch({ dealer: 3, seed: 7, config: { allowKontra: true } }));
  const called = () => act(openedWithKontra(), { type: 'BID_CALL', seat: 0, suit: 'spades' });

  it('offers the kontra to the first defender, then the second', () => {
    let s = called();
    expect(s.doubleTurn).toBe(1);
    s = act(s, { type: 'DOUBLE_PASS', seat: 1 });
    expect(s.doubleTurn).toBe(3);
    expect(s.phase).toBe('DOUBLE');
  });

  it('starts play at x1 once both defenders decline', () => {
    let s = called();
    s = act(s, { type: 'DOUBLE_PASS', seat: 1 });
    s = act(s, { type: 'DOUBLE_PASS', seat: 3 });
    expect(s.phase).toBe('PLAY');
    expect(s.multiplier).toBe(1);
  });

  it('lets the second defender kontra after the first passed', () => {
    let s = called();
    s = act(s, { type: 'DOUBLE_PASS', seat: 1 });
    s = act(s, { type: 'DOUBLE_KONTRA', seat: 3 });
    expect(s.multiplier).toBe(2);
    expect(s.doubleStage).toBe('REKONTRA');
    expect(s.doubleTurn).toBe(0); // back to the caller
  });

  it('offers the rekontra to the caller, then the callers partner', () => {
    let s = called();
    s = act(s, { type: 'DOUBLE_KONTRA', seat: 1 });
    expect(s.doubleTurn).toBe(0);
    s = act(s, { type: 'DOUBLE_PASS', seat: 0 });
    expect(s.doubleTurn).toBe(2);
    s = act(s, { type: 'DOUBLE_REKONTRA', seat: 2 });
    expect(s.multiplier).toBe(4);
    expect(s.phase).toBe('PLAY');
  });

  it('settles at x2 when the calling team declines the rekontra', () => {
    let s = called();
    s = act(s, { type: 'DOUBLE_KONTRA', seat: 1 });
    s = act(s, { type: 'DOUBLE_PASS', seat: 0 });
    s = act(s, { type: 'DOUBLE_PASS', seat: 2 });
    expect(s.phase).toBe('PLAY');
    expect(s.multiplier).toBe(2);
  });

  it('refuses a rekontra before any kontra', () => {
    const s = called();
    expect(() => act(s, { type: 'DOUBLE_REKONTRA', seat: 1 })).toThrow(/rekontra not available/);
  });
});

function intoPlay(seed = 7): GameState {
  let s = opened(seed);
  s = act(s, { type: 'BID_CALL', seat: 0, suit: 'spades' });
  while (s.phase === 'DOUBLE') s = act(s, { type: 'DOUBLE_PASS', seat: currentActor(s)! });
  return s;
}

/** Settle any trick-1 declaration the seat on turn still owes. */
function settle(s: GameState, announce = true): GameState {
  while (s.phase === 'PLAY' && legalActions(s)[0]!.type.startsWith('DECLARE')) {
    const seat = currentActor(s)!;
    s = act(s, { type: announce ? 'DECLARE_ANNOUNCE' : 'DECLARE_SKIP', seat });
  }
  return s;
}

describe('playing', () => {
  it('leads from the dealers right', () => {
    const s = intoPlay();
    expect(s.trickLeader).toBe(0);
    expect(s.turn).toBe(0);
  });

  it('rejects a card the player does not hold', () => {
    const s = settle(intoPlay());
    const notHeld = s.hands[1]![0]!;
    expect(() => act(s, { type: 'PLAY_CARD', seat: 0, card: notHeld })).toThrow(/not in hand/);
  });

  it('rejects a play that breaks the follow-suit rule', () => {
    let s = settle(intoPlay());
    const lead = s.hands[0]![0]!;
    s = act(s, { type: 'PLAY_CARD', seat: 0, card: lead });
    s = settle(s); // seat 1 may owe an announcement of its own

    const legal = legalActions(s).map((a) => cardId((a as { card: Card }).card));
    const illegal = s.hands[1]!.find((card) => !legal.includes(cardId(card)));
    if (illegal) {
      expect(() => act(s, { type: 'PLAY_CARD', seat: 1, card: illegal })).toThrow(/illegal play/);
    } else {
      expect(legal.length).toBe(s.hands[1]!.length); // every card was legal here
    }
  });

  it('awards the trick and puts the winner on lead', () => {
    let s = intoPlay();
    let guard = 0;
    // Take the first legal action throughout, which announces when offered.
    while (s.completedTricks.length === 0) {
      if (guard++ > 32) throw new Error('trick did not complete');
      s = act(s, legalActions(s)[0]!);
    }
    expect(s.completedTricks).toHaveLength(1);
    expect(s.currentTrick).toHaveLength(0);
    const winner = s.completedTricks[0]!.winnerSeat;
    expect(s.trickLeader).toBe(winner);
    expect(s.turn).toBe(winner);
  });
});

/** Nothing about another seat's cards may appear in what we hand a client. */
describe('hidden hands', () => {
  function collectCards(value: unknown, out: Card[] = []): Card[] {
    if (Array.isArray(value)) {
      for (const v of value) collectCards(v, out);
    } else if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>;
      if (typeof o.suit === 'string' && typeof o.rank === 'string') {
        out.push(o as unknown as Card);
      } else {
        for (const v of Object.values(o)) collectCards(v, out);
      }
    }
    return out;
  }

  it('reveals only the receiving seats own cards', () => {
    const s = intoPlay();
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const view = publicView(s, seat);
      const mine = new Set(s.hands[seat]!.map(cardId));
      const leaked = collectCards(view)
        .map(cardId)
        .filter((id) => !mine.has(id));
      expect(leaked).toEqual([]);
      expect(view.hand).toHaveLength(8);
    }
  });

  it('publishes hand sizes, which are public information', () => {
    expect(publicView(intoPlay(), 0).handCounts).toEqual([8, 8, 8, 8]);
  });

  it('offers legal actions only to the seat on turn', () => {
    const s = intoPlay();
    expect(publicView(s, 0).legalActions.length).toBeGreaterThan(0);
    for (const seat of [1, 2, 3] as Seat[]) {
      expect(publicView(s, seat).legalActions).toEqual([]);
    }
  });
});

describe('finishing a deal', () => {
  function playOutDeal(start: GameState): GameState {
    let s = start;
    let guard = 0;
    while (s.phase === 'PLAY') {
      if (guard++ > 128) throw new Error('deal did not terminate');
      s = act(s, legalActions(s)[0]!);
    }
    return s;
  }

  it('scores after exactly eight tricks and empties every hand', () => {
    const s = playOutDeal(intoPlay());
    expect(s.completedTricks).toHaveLength(8);
    expect(s.hands.every((h) => h.length === 0)).toBe(true);
    expect(s.lastDealResult).not.toBeNull();
    expect(s.turn).toBeNull();
    expect(['DEAL_OVER', 'MATCH_OVER']).toContain(s.phase);
  });

  it('adds the deal result to the match score and rotates the dealer', () => {
    const before = intoPlay();
    const s = playOutDeal(before);
    const r = s.lastDealResult!;
    expect(s.matchScores).toEqual(r.finalScore);
    expect(s.dealer).toBe((before.dealer + 1) % 4);
    expect(s.dealNumber).toBe(1);
  });

  it('conserves the full 162 points of the table', () => {
    const r = playOutDeal(intoPlay()).lastDealResult!;
    expect(r.cardPoints[0] + r.cardPoints[1]).toBe(152);
    expect(r.trickPoints[0] + r.trickPoints[1]).toBe(162);
  });

  it('plays every one of the 32 cards exactly once', () => {
    const s = playOutDeal(intoPlay());
    const played = s.completedTricks.flatMap((t) => t.cards).map(cardId);
    expect(played).toHaveLength(32);
    expect(new Set(played).size).toBe(32);
  });
});

describe('finishing a match', () => {
  it('keeps dealing until a team passes the target, then names the winner', () => {
    let s = createMatch({ dealer: 3, seed: 11, config: { matchTarget: 1001 } });
    s = startDeal(s);
    let steps = 0;

    while (s.phase !== 'MATCH_OVER') {
      if (steps++ > 50_000) throw new Error('match did not terminate');
      const seat = currentActor(s)!;
      const legal = legalActions(s);
      // Always take a contract, never double, then play the first legal card.
      const choice =
        legal.find((a) => a.type === 'BID_CALL') ??
        legal.find((a) => a.type === 'DOUBLE_PASS') ??
        legal[0]!;
      s = act(s, choice);
      if (s.phase === 'DEAL_OVER') s = startDeal(s);
    }

    const winner = matchWinner(s)!;
    expect([0, 1]).toContain(winner);
    const [a, b] = s.matchScores;
    expect(Math.max(a, b)).toBeGreaterThanOrEqual(1001);
    expect(winner === 0 ? a > b : b > a).toBe(true);
  });

  it('seats partners across the table', () => {
    expect([teamOf(0), teamOf(1), teamOf(2), teamOf(3)]).toEqual([0, 1, 0, 1]);
  });
});

describe('the live deal counter crosses the wire safely', () => {
  it('is identical in every seat view — it can leak nothing per seat', () => {
    let s = startDeal(createMatch({ dealer: 3, seed: 7 }));
    s = applyAction(s, { type: 'BID_CALL', seat: 0, suit: 'spades' });
    expect(s.phase).toBe('PLAY');

    const views = ([0, 1, 2, 3] as Seat[]).map((seat) => publicView(s, seat).dealProgress);
    for (const v of views) expect(v).toEqual(views[0]);
    expect(views[0]).not.toBeNull();
  });

  it('is null outside the play phase', () => {
    const bidding = startDeal(createMatch({ dealer: 3, seed: 7 }));
    expect(publicView(bidding, 0).dealProgress).toBeNull();
  });

  it('is provisional only until trick 1 has been settled', () => {
    let s = startDeal(createMatch({ dealer: 3, seed: 7 }));
    s = applyAction(s, { type: 'BID_CALL', seat: 0, suit: 'spades' });
    // Somebody still owes an announce-or-skip, so the target can still move.
    expect(publicView(s, 0).dealProgress!.provisional).toBe(true);

    // Auto mode settles every seat as the hand is dealt: nothing is pending.
    let auto = startDeal(createMatch({ dealer: 3, seed: 7, config: { declarationMode: 'auto' } }));
    auto = applyAction(auto, { type: 'BID_CALL', seat: 0, suit: 'spades' });
    expect(publicView(auto, 0).dealProgress!.provisional).toBe(false);
  });
});
