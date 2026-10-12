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

const LEVELS: BotLevel[] = ['easy', 'medium', 'hard'];
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

      // The memory a table hands over: the deal's tricks so far, public to all.
      const action = decideAction(view, rng, level, { completedTricks: s.completedTricks });

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

// --- the hard bot: a memory of the deal -------------------------------------

import { hardBidScore, hardBidThreshold, hardRulesPick } from '../src/hard';
import { bestByRollout, playOut, sampleHands } from '../src/rollout';
import type { DealTrick } from '@belot/engine';

/** A completed trick as the engine keeps it: the cards in play order, from the leader. */
const trickOf = (winnerSeat: Seat, cards: string[]): DealTrick => ({ winnerSeat, cards: cards.map(c) });

/** What the hard bot's reading of the deal says to play, before the look-ahead has its say. */
function hardChoice(view: PublicView, tricks: DealTrick[] | null): string {
  const memory = tricks ? { completedTricks: tricks } : undefined;
  return cardId(hardRulesPick(view, view.legalActions, memory).card);
}

describe('the hard bot plays to what it has seen', () => {
  // dealer 3 in viewOf: trick one is led by seat 0, and play goes 0, 1, 2, 3.

  it('cashes a ten once the ace above it has gone', () => {
    const view = viewOf(0, ['10H', '7D'], [], ['10H', '7D']);
    // Nobody is known void in hearts: the ten is master, and safe.
    expect(hardChoice(view, [trickOf(1, ['KH', 'AH', '8H', '9H'])])).toBe('10H');
    // Without the memory the ace may still be out: the ten stays home.
    expect(hardChoice(view, null)).toBe('7D');
  });

  it('gives its partner nothing when the opponent after it can still cut', () => {
    // Trick one: seat 2 and seat 3 both cut hearts, so both are void there; seat 3 won with the 8 of trumps.
    const seen = [trickOf(3, ['KH', 'QH', '7S', '8S'])];
    // Now seat 3 (my partner) leads the ace of hearts; seat 2, an opponent, plays after me and may hold a trump.
    const view = viewOf(1, ['10H', '9H', 'JD'], [[3, 'AH'], [0, '7H']], ['10H', '9H']);
    expect(hardChoice(view, seen)).toBe('9H');
    // Seen nothing, it feeds the ten like medium does.
    expect(hardChoice(view, null)).toBe('10H');
    expect(chosen(view)).toBe('10H');
  });

  it('does not lead a master into a known cut', () => {
    // Seat 1, to my left, cut hearts in trick one (and so may hold more trumps).
    const seen = [trickOf(1, ['KH', '7S', '8H', '9H'])];
    const view = viewOf(0, ['AH', '7D', '8D'], [], ['AH', '7D', '8D']);
    expect(hardChoice(view, seen)).toBe('7D');
    expect(hardChoice(view, null)).toBe('AH');
  });

  it('draws trumps with the master instead of cashing an ace', () => {
    const view = viewOf(0, ['JS', 'AH', '7D'], [], ['JS', 'AH', '7D']);
    expect(hardChoice(view, [])).toBe('JS');
    expect(chosen(view)).toBe('AH');
    // ...until the opponents are known to have none left: then the ace.
    const drawn = [trickOf(0, ['9S', '7S', '8S', 'QS']), trickOf(0, ['KS', 'AS', '10S', '7H'])];
    const later = viewOf(0, ['JS', 'AH', '7D'], [], ['JS', 'AH', '7D']);
    expect(hardChoice(later, drawn)).toBe('AH');
  });

  it('takes a trick only with a card the players still to come cannot beat', () => {
    // Seat 0 leads the king; I (seat 1) hold the ace and the ten; seats 2 and 3 follow.
    const view = viewOf(1, ['AH', '10H', '7D'], [[0, 'KH']], ['AH', '10H']);
    // Nothing seen: the ten may be beaten by the ace, which only I hold - so the ten is safe.
    expect(hardChoice(view, [])).toBe('10H');
    // The ace of hearts is mine; with a cut possible from seat 2, neither is safe: the thin trick is let go for the 10.
    const seen = [trickOf(2, ['QH', '8H', '7S', '9H'])];
    expect(hardChoice(viewOf(1, ['AH', '10H', '7D'], [[0, 'KH']], ['AH', '10H']), seen)).toBe('10H');
    // (it must follow suit; the ten is the cheaper of the two it has)
    expect(view.legalActions.length).toBe(2);
  });

  it('bids by position: a partner who passed makes an eleven-point hand a pass', () => {
    const bidActions = (seat: Seat): Action[] => [
      { type: 'BID_PASS', seat },
      { type: 'BID_CALL', seat, suit: 'spades' },
      { type: 'BID_CALL', seat, suit: 'hearts' },
      { type: 'BID_CALL', seat, suit: 'diamonds' },
      { type: 'BID_CALL', seat, suit: 'clubs' },
    ];
    const hand = ['JS', 'AS', '7D', '8D', '7C', '8C', '7H', '8H'];
    expect(hardBidScore(hand.map(c), 'spades')).toBe(11);
    // viewOf's dealer is 3: seat 0 speaks first, seat 1 after one opponent, seat 2 after an opponent and its partner.
    expect(hardBidThreshold(viewOf(0, hand, [], []))).toBe(11);
    expect(hardBidThreshold(viewOf(1, hand, [], []))).toBe(10);
    expect(hardBidThreshold(viewOf(2, hand, [], []))).toBe(12);
    const first = { ...viewOf(0, hand, [], []), legalActions: bidActions(0) };
    expect(decideAction(first, makeRng(1), 'hard').type).toBe('BID_CALL');
    const afterPartner = { ...viewOf(2, hand, [], []), legalActions: bidActions(2) };
    expect(decideAction(afterPartner, makeRng(1), 'hard').type).toBe('BID_PASS');
    // Length, a void and the king-queen pair count for more than medium's score.
    expect(hardBidScore(['JS', '9S', 'KS', 'QS', '7S', '8H', '9H', '10H'].map(c), 'spades')).toBeGreaterThan(
      hardBidScore(['JS', '9S', 'AD', '7D', '8D', '8H', '9H', '10H'].map(c), 'spades'),
    );
  });

  it('is deterministic, and never asks for cards it was not handed', () => {
    let s = startDeal(createMatch({ dealer: 3, seed: 5 }));
    // Into the play of trick two, so there is something to remember.
    const rng = makeRng(2);
    let guard = 0;
    while (s.completedTricks.length < 1 && guard++ < 200) {
      const actor = currentActor(s)!;
      s = applyAction(s, decideAction(publicView(s, actor), rng, 'medium'));
    }
    const actor = currentActor(s)!;
    const view = publicView(s, actor);
    const memory = { completedTricks: s.completedTricks };
    // The same seed: the look-ahead deals its sample hands from the rng it is given.
    const a = decideAction(view, makeRng(1), 'hard', memory);
    const b = decideAction(view, makeRng(1), 'hard', memory);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // The memory holds only cards that have been played.
    const played = new Set(s.completedTricks.flatMap((t) => t.cards).map(cardId));
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      for (const card of s.hands[seat]!) expect(played.has(cardId(card))).toBe(false);
    }
  });
});

describe('the easy bot is a beginner, not a coin', () => {
  const easyChoice = (view: PublicView) => cardId((decideAction(view, makeRng(1), 'easy') as { card: Card }).card);

  it('leads its fattest card and takes a trick with its biggest', () => {
    expect(easyChoice(viewOf(0, ['7S', 'AH', '8D'], [], ['7S', 'AH', '8D']))).toBe('AH');
    expect(easyChoice(viewOf(0, ['JS', 'KH', '7D'], [], ['JS', 'KH', '7D']))).toBe('KH'); // hoards the trump
    // Both the ace and the ten beat the king: the beginner spends the ace.
    expect(easyChoice(viewOf(1, ['AH', '10H'], [[0, 'KH']], ['AH', '10H']))).toBe('AH');
    // Nothing wins: the least.
    expect(easyChoice(viewOf(1, ['KH', '7H'], [[0, 'AH']], ['KH', '7H']))).toBe('7H');
  });

  it('calls only a clearly good hand', () => {
    const bidActions = (seat: Seat): Action[] => [
      { type: 'BID_PASS', seat },
      { type: 'BID_CALL', seat, suit: 'spades' },
    ];
    const twelve = { ...viewOf(0, ['JS', '9S', '7D', '8D', '7C', '8C', '7H', '8H'], [], []), legalActions: bidActions(0) };
    expect(decideAction(twelve, makeRng(1), 'easy').type).toBe('BID_PASS');
    expect(decideAction(twelve, makeRng(1), 'medium').type).toBe('BID_CALL');
    const strong = { ...viewOf(0, ['JS', '9S', 'AS', '10S', 'KS', 'AH'], [], []), legalActions: bidActions(0) };
    expect(decideAction(strong, makeRng(1), 'easy').type).toBe('BID_CALL');
  });
});

describe('the hard bot looks ahead', () => {
  const lastTrick = (hand: string[], legal: string[]) => ({
    ...viewOf(0, hand, [], legal),
    handCounts: [hand.length, 1, 1, 1] as [number, number, number, number],
  });

  it('deals the unseen cards to the other three within what the deal has shown', () => {
    const view = { ...viewOf(0, ['AH', '7D'], [], ['AH', '7D']), handCounts: [2, 2, 2, 2] as [number, number, number, number] };
    const unseen = ['KH', 'QH', '10H', '9H', '8S', '7S'].map(c);
    // Seat 1 holds no hearts; seat 2 nothing above the queen of hearts.
    const mayHold = (seat: Seat, card: Card) =>
      !(seat === 1 && card.suit === 'hearts') && !(seat === 2 && card.suit === 'hearts' && (card.rank === 'A' || card.rank === '10' || card.rank === 'K'));
    const rng = makeRng(3);
    for (let i = 0; i < 20; i++) {
      const hands = sampleHands(view, { unseen, mayHold }, rng);
      expect(hands[0]!.map(cardId)).toEqual(['AH', '7D']);
      expect([1, 2, 3].map((s) => hands[s]!.length)).toEqual([2, 2, 2]);
      expect(hands[1]!.every((x) => x.suit !== 'hearts')).toBe(true);
      expect(hands[2]!.every((x) => !(x.suit === 'hearts' && (x.rank === 'K' || x.rank === '10')))).toBe(true);
      // Every unseen card lands somewhere, once.
      const all = [1, 2, 3].flatMap((s) => hands[s]!.map(cardId)).sort();
      expect(all).toEqual(unseen.map(cardId).sort());
    }
  });

  it('settles a played-out deal with the contract: the caller behind loses the table', () => {
    // Last trick: I (seat 0, the caller) lead; the others hold one heart each, below my ace.
    const view = lastTrick(['AH'], ['AH']);
    const hands = [[c('AH')], [c('KH')], [c('QH')], [c('7H')]];
    // 11 + 4 + 3 + 0 for the trick, 10 for the last trick: mine, and I am ahead.
    expect(playOut(view, hands, c('AH'), makeRng(1))).toBe(28);
    // Leading a seven into a king instead: the trick and the last-trick bonus go the other way, and
    // as the caller with nothing I lose the lot.
    const lost = lastTrick(['7H'], ['7H']);
    expect(playOut(lost, [[c('7H')], [c('KH')], [c('QH')], [c('8H')]], c('7H'), makeRng(1))).toBe(-17);
  });

  it('prefers the card that wins the deal over the one the rules would play', () => {
    // Two hearts each, all hearts: cashing the ace first (the rules' pick) leaves the seven to lose
    // the last trick and its bonus - and me, the caller, the contract. The seven first loses a
    // worthless trick and keeps the ace for the last one.
    const view = { ...viewOf(0, ['AH', '7H'], [], ['AH', '7H']), handCounts: [2, 2, 2, 2] as [number, number, number, number] };
    const unseen = ['KH', 'QH', '10H', '9H', '8H', 'JH'].map(c);
    expect(cardId(hardRulesPick(view, view.legalActions, undefined).card)).toBe('AH');
    const k = { unseen, mayHold: () => true };
    let ace = 0;
    let seven = 0;
    const rng = makeRng(5);
    for (let i = 0; i < 16; i++) {
      const hands = sampleHands(view, k, rng);
      ace += playOut(view, hands, c('AH'), rng);
      seven += playOut(view, hands, c('7H'), rng);
    }
    expect(seven).toBeGreaterThan(ace);
    expect(cardId(bestByRollout(view, k, view.legalActions as never, makeRng(5)).card)).toBe('7H');
  });
});
