import { describe, expect, it } from 'vitest';
import {
  applyAction,
  cardId,
  createMatch,
  currentActor,
  legalActions,
  makeRng,
  parseCard,
  publicView,
  startDeal,
  type Action,
  type Card,
  type GameState,
  type PlayContext,
  type PublicView,
  type Seat,
  type TrickPlay,
} from '@belot/engine';
import { decideAction, type BotLevel } from '@belot/bots';

/**
 * The bot is one pure function over a hidden-hand-safe view. The same function
 * plays the offline opponents and fills a disconnected seat online, so "it only
 * ever produces legal actions" is a server-integrity property, not just polish.
 */

const LEVELS: BotLevel[] = ['easy', 'medium'];
const TRUMP: PlayContext = { contractType: 'SUIT', trumpSuit: 'spades' };
const c = parseCard;

function playMatches(level: BotLevel, matches: number, seed: number) {
  const rng = makeRng(seed);
  let played = 0;
  let deals = 0;

  for (let m = 0; m < matches; m++) {
    let s: GameState = startDeal(createMatch({ seed: seed + m, dealer: (m % 4) as Seat }));
    let steps = 0;

    while (s.phase !== 'MATCH_OVER') {
      if (steps++ > 50_000) throw new Error('bot match did not terminate');

      const actor = currentActor(s)!;
      const view = publicView(s, actor);

      // The bot sees only its own cards.
      expect(view.hand).toEqual(s.hands[actor]);
      expect(view.legalActions.length).toBeGreaterThan(0);

      const action = decideAction(view, rng, level);

      // Whatever it picks must be one of the engine's own legal actions.
      expect(action.seat).toBe(actor);
      expect(legalActions(s).map((a) => JSON.stringify(a))).toContain(JSON.stringify(action));

      s = applyAction(s, action);
      played++;

      if (s.phase === 'DEAL_OVER') {
        deals++;
        s = startDeal(s);
      } else if (s.phase === 'MATCH_OVER') {
        deals++;
      }
    }

    expect(Math.max(...s.matchScores)).toBeGreaterThanOrEqual(1001);
  }

  return { played, deals };
}

describe('bots play legally', () => {
  for (const level of LEVELS) {
    it(`completes full matches at the ${level} level without an illegal move`, () => {
      const { played, deals } = playMatches(level, 10, 4242);
      expect(deals).toBeGreaterThan(10);
      expect(played).toBeGreaterThan(1000);
    });
  }

  it('refuses to act when there is nothing to do', () => {
    const view = { legalActions: [] } as unknown as PublicView;
    expect(() => decideAction(view, Math.random, 'medium')).toThrow(/no legal actions/);
  });
});

// --- constructed positions ---------------------------------------------------

/** Build a view for `seat` holding `hand`, with `legal` as the playable subset. */
function viewOf(seat: Seat, hand: string[], trick: Array<[Seat, string]>, legal: string[]): PublicView {
  const currentTrick: TrickPlay[] = trick.map(([s, id]) => ({ seat: s, card: c(id) }));
  const actions: Action[] = legal.map((id) => ({ type: 'PLAY_CARD', seat, card: c(id) }));
  return {
    phase: 'PLAY',
    dealer: 3,
    seat,
    hand: hand.map(c),
    handCounts: [8, 8, 8, 8],
    context: TRUMP,
    callerSeat: 0,
    multiplier: 1,
    trickLeader: trick.length ? trick[0]![0] : seat,
    currentTrick,
    toAct: seat,
    matchScores: [0, 0],
    announcedDeclarations: [],
    myDeclarations: [],
    mustDeclare: false,
    canDeclare: false,
  declareTurn: null,
  revealedDeclarations: [],
    dealProgress: null,
    canAnnounceBela: false,
    belaAnnouncedBy: null,
    legalActions: actions,
  };
}

function chosen(view: PublicView): string {
  return cardId((decideAction(view, makeRng(1), 'medium') as { card: Card }).card);
}

describe('the medium bot plays sensibly', () => {
  it('feeds the most valuable card when its partner already holds the trick', () => {
    // Seat 3 acts; seat 1 (its partner) is winning with the ace of hearts.
    const view = viewOf(3, ['KH', '9H'], [[0, '10H'], [1, 'AH'], [2, '7H']], ['KH', '9H']);
    expect(chosen(view)).toBe('KH'); // 4 points to the partner, not the empty 9
  });

  it('sheds its cheapest card when it cannot take the trick', () => {
    // Seat 1 cannot beat the ace of hearts, so it should throw the 7, not the king.
    const view = viewOf(1, ['KH', '7H'], [[0, 'AH']], ['KH', '7H']);
    expect(chosen(view)).toBe('7H');
  });

  it('wins as cheaply as it can when an opponent is ahead', () => {
    // Both the ace and the ten beat the king; the ten is the cheaper way to win.
    const view = viewOf(1, ['AH', '10H'], [[0, 'KH']], ['AH', '10H']);
    expect(chosen(view)).toBe('10H');
  });

  it('cuts an opponents trick rather than discarding', () => {
    // Void in hearts with an opponent winning: the engine offers only trumps.
    const view = viewOf(1, ['7S', 'AD'], [[0, 'AH']], ['7S']);
    expect(chosen(view)).toBe('7S');
  });

  it('leads a plain-suit ace when it holds one', () => {
    const view = viewOf(0, ['7S', 'AH', '8D'], [], ['7S', 'AH', '8D']);
    expect(chosen(view)).toBe('AH');
  });

  it('leads its cheapest plain card when it holds no ace', () => {
    const view = viewOf(0, ['JS', 'KH', '7D'], [], ['JS', 'KH', '7D']);
    expect(chosen(view)).toBe('7D'); // hangs on to the trump jack
  });

  it('declines to double', () => {
    const view = {
      ...viewOf(1, ['AH'], [], []),
      legalActions: [
        { type: 'DOUBLE_KONTRA', seat: 1 },
        { type: 'DOUBLE_PASS', seat: 1 },
      ] as Action[],
    };
    expect(decideAction(view, makeRng(1), 'medium').type).toBe('DOUBLE_PASS');
  });

  it('passes a weak hand and calls a strong one', () => {
    const bidActions = (seat: Seat): Action[] => [
      { type: 'BID_PASS', seat },
      { type: 'BID_CALL', seat, suit: 'spades' },
      { type: 'BID_CALL', seat, suit: 'hearts' },
      { type: 'BID_CALL', seat, suit: 'diamonds' },
      { type: 'BID_CALL', seat, suit: 'clubs' },
    ];

    const weak = { ...viewOf(0, ['7S', '8H', '7D', '8C', '9C', '7H'], [], []), legalActions: bidActions(0) };
    expect(decideAction(weak, makeRng(1), 'medium').type).toBe('BID_PASS');

    const strong = { ...viewOf(0, ['JS', '9S', 'AS', '10S', 'KS', 'AH'], [], []), legalActions: bidActions(0) };
    const call = decideAction(strong, makeRng(1), 'medium');
    expect(call.type).toBe('BID_CALL');
    expect((call as { suit: string }).suit).toBe('spades');
  });
});

describe('bot determinism', () => {
  it('makes the same choice from the same view and seed', () => {
    const s = startDeal(createMatch({ dealer: 3, seed: 5 }));
    const view = publicView(s, currentActor(s)!);
    const a = decideAction(view, makeRng(1), 'easy');
    const b = decideAction(view, makeRng(1), 'easy');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('is never handed another seats cards', () => {
    const s = startDeal(createMatch({ dealer: 3, seed: 5 }));
    const view = publicView(s, 0);
    const mine = new Set(s.hands[0]!.map(cardId));
    for (const seat of [1, 2, 3] as Seat[]) {
      for (const card of s.hands[seat]!) {
        if (!mine.has(cardId(card))) {
          expect(JSON.stringify(view)).not.toContain(JSON.stringify(card));
        }
      }
    }
  });
});
