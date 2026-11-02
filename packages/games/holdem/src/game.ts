import { type BotLevel, type Cause, type GameDefinition, type Rng, type Secret } from '@belot/game-core';
import { makeDeck52, rankValue, type Card52 } from '@belot/cards';
import { evaluate } from './evaluate';
import {
  actors,
  applyAction,
  createMatch,
  DEFAULT_HOLDEM_CONFIG,
  isLegal,
  legalActions,
  raiseRange,
  startRound,
  winners,
  type HandResult,
  type HoldemAction,
  type HoldemConfig,
  type HoldemEvent,
  type HoldemPhase,
  type HoldemState,
  type PlayerStatus,
} from './state';

// ---------------------------------------------------------------------------
// The view: my two cards, everyone's chips and bets, the board — and the
// others' cards only once they are shown down.
// ---------------------------------------------------------------------------

export interface SeatView {
  stack: number;
  status: PlayerStatus;
  bet: number;
  committed: number;
  /** My own two cards; another seat's only after it showed them down. */
  hole: Card52[];
}

export interface HoldemView {
  seat: number;
  seats: number;
  phase: HoldemPhase;
  handNumber: number;
  button: number;
  smallBlind: number;
  bigBlind: number;
  players: SeatView[];
  board: Card52[];
  toAct: number | null;
  currentBet: number;
  /** What I must put in to call. */
  toCall: number;
  /** Everything in the middle this hand, bets on this street included. */
  pot: number;
  /** Where my raise may go, when I may raise. */
  raiseTo: { min: number; max: number } | null;
  lastResult: HandResult | null;
  /** Hands until the blinds double (0: they never do). */
  blindsUpIn: number;
  legalActions: HoldemAction[];
}

export function publicView(s: HoldemState, seat: number): HoldemView {
  const over = s.phase === 'HAND_OVER' || s.phase === 'MATCH_OVER';
  const shown = new Set(over ? (s.lastResult?.shown.map((x) => x.seat) ?? []) : []);
  const me = s.players[seat]!;
  const r = raiseRange(s, seat);
  const every = s.config.blindsUpEvery;
  return {
    seat,
    seats: s.seats,
    phase: s.phase,
    handNumber: s.handNumber,
    button: s.button,
    smallBlind: s.smallBlind,
    bigBlind: s.bigBlind,
    players: s.players.map((p, i) => ({
      stack: p.stack,
      status: p.status,
      bet: p.bet,
      committed: p.committed,
      hole: i === seat || shown.has(i) ? p.hole.map((c) => ({ ...c })) : [],
    })),
    board: s.board.map((c) => ({ ...c })),
    toAct: s.toAct,
    currentBet: s.currentBet,
    toCall: Math.max(0, Math.min(s.currentBet - me.bet, me.stack)),
    pot: s.players.reduce((a, p) => a + p.committed, 0),
    raiseTo: s.toAct === seat && r ? { min: r[0], max: r[1] } : null,
    lastResult: s.lastResult
      ? { ...s.lastResult, pots: s.lastResult.pots.map((p) => ({ ...p })), returned: s.lastResult.returned.map((r) => ({ ...r })), shown: s.lastResult.shown.map((x) => ({ ...x, hole: x.hole.slice() })), net: s.lastResult.net.slice() }
      : null,
    blindsUpIn: every > 0 ? every - ((s.handNumber - 1) % every) : 0,
    legalActions: legalActions(s, seat),
  };
}

export function deriveEvents(_before: HoldemState, after: HoldemState, cause: Cause<HoldemAction>): HoldemEvent[] {
  const out: HoldemEvent[] = [];
  if (cause.kind === 'newMatch') out.push({ kind: 'matchStarted', matchNumber: cause.matchNumber });
  return [...out, ...after.log.map((e) => ({ ...e }))];
}

// ---------------------------------------------------------------------------
// Bots: an equity estimate by simulation — deal the unseen cards out many
// times and count how often my hand wins — set against the price of a call.
//
//  - easy: few simulations, calls too often, bets only a strong hand;
//  - medium: bets two thirds of the pot for value, calls when the equity
//    beats the pot odds, raises with a strong hand, bluffs now and then;
//  - hard: twice the simulations, plays the button a little looser, shoves
//    or folds when short-stacked, and semi-bluffs when checked to.
// ---------------------------------------------------------------------------

/**
 * A quick starting-hand score: high card, half the low card, a pair worth a
 * lot, suited and connected worth a little. Only used to say which hands an
 * opponent would plausibly be playing.
 */
export function startingScore(a: Card52, b: Card52): number {
  const ra = rankValue(a.rank);
  const rb = rankValue(b.rank);
  const hi = Math.max(ra, rb);
  const lo = Math.min(ra, rb);
  let s = hi + lo / 2;
  if (ra === rb) s += 10;
  if (a.suit === b.suit) s += 2;
  s -= Math.max(0, hi - lo - 1) * 0.5;
  return s;
}

/** The score a starting hand needs to be in the top `fraction` of all 1,326. */
const RANGE_CACHE = new Map<number, number>();
export function rangeFloor(fraction: number): number {
  const hit = RANGE_CACHE.get(fraction);
  if (hit !== undefined) return hit;
  const deck = makeDeck52();
  const scores: number[] = [];
  for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) scores.push(startingScore(deck[i]!, deck[j]!));
  scores.sort((x, y) => y - x);
  const floor = scores[Math.floor(scores.length * fraction)]!;
  RANGE_CACHE.set(fraction, floor);
  return floor;
}

/**
 * How often `hole` wins against `opponents`, the board completed at random.
 * Opponents hold random hands — or, given `floor`, hands at least that good
 * by `startingScore` (a player who bets big rarely holds junk).
 */
export function equity(hole: Card52[], board: Card52[], opponents: number, iterations: number, rng: Rng, floor = -Infinity): number {
  if (opponents <= 0) return 1;
  const known = new Set([...hole, ...board].map((c) => c.id));
  const pool = makeDeck52().filter((c) => !known.has(c.id));
  let score = 0;
  const opp: Card52[][] = Array.from({ length: opponents }, () => []);
  for (let it = 0; it < iterations; it++) {
    // A partial Fisher-Yates over the pool: only the cards this deal needs.
    let k = 0;
    const take = () => {
      const j = k + Math.floor(rng() * (pool.length - k));
      const t = pool[k]!;
      pool[k] = pool[j]!;
      pool[j] = t;
      return pool[k++]!;
    };
    for (let o = 0; o < opponents; o++) {
      for (let tries = 0; ; tries++) {
        const a = take();
        const b = take();
        if (startingScore(a, b) >= floor || tries >= 30) {
          opp[o] = [a, b];
          break;
        }
        // Not a hand they would play: put both back and deal again.
        k -= 2;
      }
    }
    const full = board.slice();
    while (full.length < 5) full.push(take());
    const mine = evaluate(hole.concat(full));
    let best = 0;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const theirs = evaluate(opp[o]!.concat(full));
      if (theirs > best) {
        best = theirs;
        ties = 0;
      }
      if (theirs === best) ties++;
    }
    if (mine > best) score += 1;
    else if (mine === best) score += 1 / (ties + 1);
  }
  return score / iterations;
}

export function decideHoldem(view: HoldemView, rng: Rng, level: BotLevel): HoldemAction {
  const legal = view.legalActions;
  if (legal.length === 0) throw new Error('bot asked to act with no legal actions');
  const seat = view.seat;
  const me = view.players[seat]!;
  const has = (t: HoldemAction['type']) => legal.some((a) => a.type === t);
  const check: HoldemAction | null = has('CHECK') ? { type: 'CHECK', seat } : null;
  const call: HoldemAction | null = has('CALL') ? { type: 'CALL', seat } : null;
  const fold: HoldemAction = has('FOLD') ? { type: 'FOLD', seat } : (check ?? legal[0]!);
  const raise = (to: number): HoldemAction => {
    if (!view.raiseTo) return call ?? check ?? fold;
    const clamped = Math.max(view.raiseTo.min, Math.min(view.raiseTo.max, Math.round(to)));
    return { type: 'RAISE', seat, to: clamped };
  };

  const opponents = view.players.filter((p, i) => i !== seat && (p.status === 'active' || p.status === 'allIn')).length;
  const iterations = level === 'easy' ? 60 : level === 'medium' ? 200 : 400;
  const toCall = view.toCall;
  // Hard reads the bet: facing one, the opponent's hand is from the top half;
  // facing a big one (two thirds of the pot or more), from the top third.
  const floor =
    level === 'hard' && toCall > view.bigBlind ? rangeFloor(toCall * 1.5 >= view.pot ? 0.33 : 0.5) : -Infinity;
  let eq = equity(me.hole, view.board, opponents, iterations, rng, floor);
  const potOdds = toCall / (view.pot + toCall);
  const bb = view.bigBlind;

  if (level === 'easy') {
    if (toCall === 0) return eq > 0.7 ? raise(view.currentBet + bb * 2) : (check ?? fold);
    return eq > 0.35 || toCall <= bb ? (call ?? fold) : fold;
  }

  if (level === 'hard') {
    if (seat === view.button) eq += 0.03;
    // Short-stacked: all in or out.
    if (me.stack + me.bet < bb * 10) {
      if (eq > 0.5 && view.raiseTo) return raise(view.raiseTo.max);
      if (eq > 0.5) return call ?? check ?? fold;
      return check ?? fold;
    }
  }

  const strong = 0.68;
  const valueBet = 0.58;
  if (toCall === 0) {
    if (eq > valueBet) return raise(view.currentBet + (view.pot * 2) / 3);
    if (rng() < 0.06) return raise(view.currentBet + view.pot / 2);
    return check ?? fold;
  }
  if (eq > strong) return raise(view.currentBet + view.pot);
  if (eq > potOdds + 0.05) return call ?? fold;
  return fold;
}

// ---------------------------------------------------------------------------
// The definition
// ---------------------------------------------------------------------------

function normalize(s: HoldemState, seat: number, raw: unknown): HoldemAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.seat !== seat) return null;
  let a: HoldemAction;
  if (r.type === 'FOLD' || r.type === 'CHECK' || r.type === 'CALL') a = { type: r.type, seat };
  else if (r.type === 'RAISE' && typeof r.to === 'number' && Number.isInteger(r.to)) a = { type: 'RAISE', seat, to: r.to };
  else return null;
  return isLegal(s, a) ? a : null;
}

export type HoldemDefinition = GameDefinition<HoldemState, HoldemAction, HoldemView, HoldemEvent, HoldemConfig>;

export const HOLDEM: HoldemDefinition = {
  meta: {
    id: 'holdem',
    minPlayers: 2,
    maxPlayers: 9,
    teams: null,
    deck: 'french52',
    betting: true,
    casino: true,
    simultaneous: false,
    windowMs: 25_000,
    nextRoundMs: 5_000,
  },
  defaultConfig: DEFAULT_HOLDEM_CONFIG,
  createMatch: (o) => createMatch(o),
  startRound,
  roundOver: (s) => s.phase === 'HAND_OVER',
  matchOver: (s) => s.phase === 'MATCH_OVER',
  actors,
  seatStatus: (s, seat) => (s.players[seat]!.status === 'out' ? 'out' : 'active'),
  legalActions,
  normalize,
  // Out of time: check if you can, fold if you cannot.
  defaultAction: (s, seat) => (legalActions(s, seat).some((a) => a.type === 'CHECK') ? { type: 'CHECK', seat } : { type: 'FOLD', seat }),
  apply: applyAction,
  view: publicView,
  secrets(s): Secret[] {
    const over = s.phase === 'HAND_OVER' || s.phase === 'MATCH_OVER';
    const shown = new Set(over ? (s.lastResult?.shown.map((x) => x.seat) ?? []) : []);
    const out: Secret[] = [{ tokens: s.deck.map((c) => c.id), visibleTo: [] }];
    s.players.forEach((p, seat) => {
      if (!shown.has(seat)) out.push({ tokens: p.hole.map((c) => c.id), visibleTo: [seat] });
    });
    return out;
  },
  isEventPublic: () => true,
  deriveEvents,
  winners,
  settlement: (s) => (s.phase === 'MATCH_OVER' ? s.players.map((p, i) => p.stack - s.startStacks[i]!) : null),
  bot: { decide: (view, rng, level) => decideHoldem(view, rng, level) },
};
