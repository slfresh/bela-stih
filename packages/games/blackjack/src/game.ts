import { looksLikeAction, matchLegal, type BotLevel, type Cause, type GameDefinition, type Rng, type Secret } from '@belot/game-core';
import type { Card52 } from '@belot/cards';
import {
  actors,
  applyAction,
  cardValue,
  CHIPS,
  createMatch,
  DEFAULT_BLACKJACK_CONFIG,
  handValue,
  isOut,
  legalActions,
  startRound,
  winners,
  type BlackjackAction,
  type BlackjackConfig,
  type BlackjackEvent,
  type BlackjackPhase,
  type BlackjackState,
  type Hand,
} from './state';

// ---------------------------------------------------------------------------
// The view: the dealer's face-down card is the one hidden thing on the table.
// ---------------------------------------------------------------------------

export interface BlackjackView {
  seat: number;
  seats: number;
  phase: BlackjackPhase;
  roundNumber: number;
  rounds: number;
  stacks: number[];
  bets: number[];
  ready: boolean[];
  out: boolean[];
  hands: Hand[][];
  /** The dealer's cards, the face-down one as null until it is turned. */
  dealer: (Card52 | null)[];
  dealerTotal: number | null;
  turn: { seat: number; hand: number } | null;
  minBet: number;
  maxBet: number;
  chips: readonly number[];
  blackjackPays: [number, number];
  dealerHitsSoft17: boolean;
  /** Public: the Hi-Lo count of every card shown since the shuffle, and how much shoe is left. */
  runningCount: number;
  decksRemaining: number;
  legalActions: BlackjackAction[];
}

export function publicView(s: BlackjackState, seat: number): BlackjackView {
  const dealer = s.dealer.map((c, i) => (i === 1 && !s.holeShown ? null : { ...c }));
  return {
    seat,
    seats: s.seats,
    phase: s.phase,
    roundNumber: s.roundNumber,
    rounds: s.config.rounds,
    stacks: s.stacks.slice(),
    bets: s.bets.slice(),
    ready: s.ready.slice(),
    out: Array.from({ length: s.seats }, (_, i) => isOut(s, i)),
    hands: s.hands.map((hs) => hs.map((h) => ({ ...h, cards: h.cards.map((c) => ({ ...c })) }))),
    dealer,
    dealerTotal: s.dealer.length === 0 ? null : handValue(dealer.filter((c): c is Card52 => c !== null)).total,
    turn: s.turn ? { ...s.turn } : null,
    minBet: s.config.minBet,
    maxBet: s.config.maxBet,
    chips: CHIPS,
    blackjackPays: s.config.blackjackPays,
    dealerHitsSoft17: s.config.dealerHitsSoft17,
    runningCount: s.runningCount,
    decksRemaining: Math.max(0.5, s.shoe.length / 52),
    legalActions: legalActions(s, seat),
  };
}

export function deriveEvents(_before: BlackjackState, after: BlackjackState, cause: Cause<BlackjackAction>): BlackjackEvent[] {
  const out: BlackjackEvent[] = [];
  if (cause.kind === 'newMatch') out.push({ kind: 'matchStarted', matchNumber: cause.matchNumber });
  return [...out, ...after.log.map((e) => ({ ...e }))];
}

// ---------------------------------------------------------------------------
// Bots
//
//  - easy: bets the minimum, hits below 15, never doubles or splits;
//  - medium: plays perfect basic strategy for this table (six decks, the
//    dealer standing on soft 17, double after split) and bets flat;
//  - hard: basic strategy, and it counts: its bet follows the Hi-Lo true
//    count, the only edge a player can have over the house.
// ---------------------------------------------------------------------------

type Move = 'H' | 'S' | 'D' | 'P' | 'Ds';

/**
 * Basic strategy. `up` is the dealer's card value, 2..11 (11 = ace). With
 * `canSplit` false a pair is played as the total it makes. `h17` is the
 * table rule: the chart is the stands-on-soft-17 one unless the dealer hits
 * soft 17, which changes three cells (soft 19 v 6, soft 18 v 2, 11 v ace).
 */
export function basicStrategy(cards: Card52[], up: number, canSplit = true, h17 = false): Move {
  const { total, soft } = handValue(cards);
  if (canSplit && cards.length === 2 && cards[0]!.rank === cards[1]!.rank) {
    const v = cardValue(cards[0]!);
    if (v === 11 || v === 8) return 'P';
    if ((v === 2 || v === 3 || v === 7) && up <= 7) return 'P';
    if (v === 4 && (up === 5 || up === 6)) return 'P';
    if (v === 6 && up <= 6) return 'P';
    if (v === 9 && up !== 7 && up !== 10 && up !== 11) return 'P';
    // 5,5 and 10,10 are played as totals.
  }
  if (soft) {
    if (total >= 20) return 'S';
    if (total === 19) return h17 && up === 6 ? 'Ds' : 'S';
    if (total === 18) return up >= 3 && up <= 6 ? 'Ds' : up === 2 ? (h17 ? 'Ds' : 'S') : up <= 8 ? 'S' : 'H';
    if (total === 17) return up >= 3 && up <= 6 ? 'D' : 'H';
    if (total === 15 || total === 16) return up >= 4 && up <= 6 ? 'D' : 'H';
    return up === 5 || up === 6 ? 'D' : 'H';
  }
  if (total >= 17) return 'S';
  if (total >= 13) return up <= 6 ? 'S' : 'H';
  if (total === 12) return up >= 4 && up <= 6 ? 'S' : 'H';
  if (total === 11) return up === 11 && !h17 ? 'H' : 'D';
  if (total === 10) return up <= 9 ? 'D' : 'H';
  if (total === 9) return up >= 3 && up <= 6 ? 'D' : 'H';
  return 'H';
}

export function decideBlackjack(view: BlackjackView, rng: Rng, level: BotLevel): BlackjackAction {
  const legal = view.legalActions;
  if (legal.length === 0) throw new Error('bot asked to act with no legal actions');
  const seat = view.seat;
  const has = (type: BlackjackAction['type']) => legal.some((a) => a.type === type);

  if (view.phase === 'BETTING') {
    const ready: BlackjackAction = { type: 'READY', seat };
    let target = view.minBet;
    if (level === 'medium') target = view.minBet * 2;
    if (level === 'hard') {
      // Units of two minimums, raised one unit per point of true count above one.
      const trueCount = view.runningCount / view.decksRemaining;
      target = view.minBet * 2 * Math.max(1, Math.min(8, Math.floor(trueCount)));
    }
    if (level === 'easy' && rng() < 0.15 && view.bets[seat] === 0) return ready;
    const placed = view.bets[seat]!;
    if (placed >= target && has('READY')) return ready;
    const fits = view.chips.filter((c) => c <= target - placed && legal.some((a) => a.type === 'BET' && a.amount === c));
    if (fits.length > 0) return { type: 'BET', seat, amount: fits[fits.length - 1]! };
    // Cannot reach the target exactly: the smallest chip that keeps the bet legal, or done.
    if (has('READY')) return ready;
    const small = legal.find((a) => a.type === 'BET');
    return small ?? legal[0]!;
  }

  const turn = view.turn!;
  const hand = view.hands[seat]![turn.hand]!;
  if (level === 'easy') return handValue(hand.cards).total < 15 ? { type: 'HIT', seat } : { type: 'STAND', seat };
  const up = view.dealer[0] ? cardValue(view.dealer[0]) : 10;
  const m = basicStrategy(hand.cards, up, has('SPLIT'), view.dealerHitsSoft17);
  if (m === 'P') return { type: 'SPLIT', seat };
  if ((m === 'D' || m === 'Ds') && has('DOUBLE')) return { type: 'DOUBLE', seat };
  // A double the table does not allow here: "Ds" stands, "D" hits.
  if (m === 'Ds' || m === 'S') return { type: 'STAND', seat };
  return { type: 'HIT', seat };
}

// ---------------------------------------------------------------------------
// The definition
// ---------------------------------------------------------------------------

const TYPES = ['BET', 'CLEAR', 'READY', 'HIT', 'STAND', 'DOUBLE', 'SPLIT'] as const;

function normalize(s: BlackjackState, seat: number, raw: unknown): BlackjackAction | null {
  if (!looksLikeAction(raw, seat)) return null;
  const r = raw as Record<string, unknown>;
  if (!(TYPES as readonly string[]).includes(r.type as string)) return null;
  const rebuilt: BlackjackAction =
    r.type === 'BET' ? { type: 'BET', seat, amount: typeof r.amount === 'number' ? r.amount : NaN } : ({ type: r.type, seat } as BlackjackAction);
  return matchLegal(legalActions(s, seat), rebuilt);
}

export type BlackjackDefinition = GameDefinition<BlackjackState, BlackjackAction, BlackjackView, BlackjackEvent, BlackjackConfig>;

export const BLACKJACK: BlackjackDefinition = {
  meta: {
    id: 'blackjack',
    minPlayers: 1,
    maxPlayers: 5,
    teams: null,
    deck: 'french52-shoe',
    betting: true,
    casino: true,
    simultaneous: true,
    windowMs: 20_000,
    nextRoundMs: 6_000,
  },
  defaultConfig: DEFAULT_BLACKJACK_CONFIG,
  createMatch: (o) => createMatch(o),
  startRound,
  roundOver: (s) => s.phase === 'ROUND_OVER',
  matchOver: (s) => s.phase === 'MATCH_OVER',
  actors,
  seatStatus: (s, seat) => (isOut(s, seat) ? 'out' : 'active'),
  legalActions,
  normalize,
  // Out of time: no (more) bets in the window — or, a bet under the minimum, take it back; at the table, stand.
  defaultAction: (s, seat) => {
    const legal = legalActions(s, seat);
    return legal.find((a) => a.type === 'READY') ?? legal.find((a) => a.type === 'CLEAR') ?? legal.find((a) => a.type === 'STAND') ?? legal[0]!;
  },
  windowKey: (s) => (s.phase === 'BETTING' ? `round:${s.roundNumber}` : null),
  apply: applyAction,
  view: publicView,
  secrets(s): Secret[] {
    const out: Secret[] = [{ tokens: s.shoe.map((c) => c.id), visibleTo: [] }];
    if (s.dealer.length > 1 && !s.holeShown) out.push({ tokens: [s.dealer[1]!.id], visibleTo: [] });
    return out;
  },
  isEventPublic: () => true,
  deriveEvents,
  winners,
  settlement: (s) => (s.phase === 'MATCH_OVER' ? s.stacks.map((x, i) => x - s.startStacks[i]!) : null),
  bot: { decide: (view, rng, level) => decideBlackjack(view, rng, level) },
};
