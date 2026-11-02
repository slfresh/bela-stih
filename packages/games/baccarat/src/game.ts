import { looksLikeAction, matchLegal, type BotLevel, type Cause, type GameDefinition, type Rng, type Secret } from '@belot/game-core';
import type { Card52 } from '@belot/cards';
import type { Coup, Outcome } from './tableau';
import {
  actors,
  applyAction,
  betTotal,
  CHIPS,
  createMatch,
  DEFAULT_BACCARAT_CONFIG,
  isOut,
  legalActions,
  SPOTS,
  startRound,
  winners,
  type BaccaratAction,
  type BaccaratConfig,
  type BaccaratPhase,
  type BaccaratState,
  type Bets,
  type Spot,
} from './state';

// ---------------------------------------------------------------------------
// The view: everything on a baccarat table is public but the shoe.
// ---------------------------------------------------------------------------

export interface BaccaratView {
  seat: number;
  seats: number;
  phase: BaccaratPhase;
  coupNumber: number;
  coups: number;
  stacks: number[];
  bets: Bets[];
  ready: boolean[];
  out: boolean[];
  lastCoup: Coup | null;
  lastNet: number[] | null;
  road: Outcome[];
  shoeRemaining: number;
  minBet: number;
  maxBet: number;
  chips: readonly number[];
  commissionPct: number;
  tiePays: number;
  legalActions: BaccaratAction[];
}

export function publicView(s: BaccaratState, seat: number): BaccaratView {
  return {
    seat,
    seats: s.seats,
    phase: s.phase,
    coupNumber: s.coupNumber,
    coups: s.config.coups,
    stacks: s.stacks.slice(),
    bets: s.bets.map((b) => ({ ...b })),
    ready: s.ready.slice(),
    out: Array.from({ length: s.seats }, (_, i) => isOut(s, i)),
    lastCoup: s.lastCoup ? { ...s.lastCoup, player: s.lastCoup.player.slice(), banker: s.lastCoup.banker.slice(), order: s.lastCoup.order.slice() } : null,
    lastNet: s.lastNet?.slice() ?? null,
    road: s.road.slice(),
    shoeRemaining: s.shoe.length,
    minBet: s.config.minBet,
    maxBet: s.config.maxBet,
    chips: CHIPS,
    commissionPct: s.config.commissionPct,
    tiePays: s.config.tiePays,
    legalActions: legalActions(s, seat),
  };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type BaccaratEvent =
  | { kind: 'matchStarted'; matchNumber: number }
  | { kind: 'coupStarted'; coupNumber: number; coups: number; shuffled: boolean }
  | { kind: 'betPlaced'; seat: number; spot: Spot; amount: number }
  | { kind: 'betsCleared'; seat: number }
  | { kind: 'ready'; seat: number }
  /** No more bets: the cards, in the order they came out of the shoe. */
  | { kind: 'dealt'; player: Card52[]; banker: Card52[]; order: ('player' | 'banker')[] }
  | { kind: 'coupResolved'; outcome: Outcome; playerTotal: number; bankerTotal: number; natural: boolean }
  | { kind: 'paid'; seat: number; net: number }
  | { kind: 'matchOver'; winners: number[]; stacks: number[] };

function resolutionEvents(after: BaccaratState): BaccaratEvent[] {
  const c = after.lastCoup;
  if (!c) return [];
  const out: BaccaratEvent[] = [
    { kind: 'dealt', player: c.player.slice(), banker: c.banker.slice(), order: c.order.slice() },
    { kind: 'coupResolved', outcome: c.outcome, playerTotal: c.playerTotal, bankerTotal: c.bankerTotal, natural: c.natural },
  ];
  after.lastNet?.forEach((net, seat) => {
    if (net !== 0) out.push({ kind: 'paid', seat, net });
  });
  if (after.phase === 'MATCH_OVER') out.push({ kind: 'matchOver', winners: winners(after)!, stacks: after.stacks.slice() });
  return out;
}

export function deriveEvents(before: BaccaratState, after: BaccaratState, cause: Cause<BaccaratAction>): BaccaratEvent[] {
  const out: BaccaratEvent[] = [];
  if (cause.kind === 'newMatch') out.push({ kind: 'matchStarted', matchNumber: cause.matchNumber });
  if (cause.kind === 'startRound' || cause.kind === 'newMatch') {
    out.push({ kind: 'coupStarted', coupNumber: after.coupNumber, coups: after.config.coups, shuffled: after.shuffled });
    // A table where nobody could bet dealt at once.
    if (after.phase !== 'BETTING') out.push(...resolutionEvents(after));
    return out;
  }
  if (cause.kind !== 'action') return out;
  const a = cause.action;
  if (a.type === 'BET') out.push({ kind: 'betPlaced', seat: a.seat, spot: a.spot, amount: a.amount });
  if (a.type === 'CLEAR') out.push({ kind: 'betsCleared', seat: a.seat });
  if (a.type === 'READY') {
    out.push({ kind: 'ready', seat: a.seat });
    if (before.phase === 'BETTING' && after.phase !== 'BETTING') out.push(...resolutionEvents(after));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bots. Every bet in baccarat loses to the house in the long run, so the
// levels differ in how they play rather than how well: easy is impulsive,
// medium flat-bets the banker (the best bet on the table), hard flat-bets
// the banker sized to its stack and never touches the tie.
// ---------------------------------------------------------------------------

/** The largest chip that fits `amount` and the stack, for building a bet chip by chip. */
function chipFor(view: BaccaratView, amount: number): number | null {
  const stack = view.stacks[view.seat]!;
  const fits = view.chips.filter((c) => c <= amount && c <= stack);
  return fits.length > 0 ? fits[fits.length - 1]! : null;
}

export function decideBaccarat(view: BaccaratView, rng: Rng, level: BotLevel): BaccaratAction {
  const legal = view.legalActions;
  if (legal.length === 0) throw new Error('bot asked to act with no legal actions');
  const ready: BaccaratAction = { type: 'READY', seat: view.seat };
  const placed = betTotal(view.bets[view.seat]!);
  const stack = view.stacks[view.seat]!;
  const bet = (spot: Spot, amount: number): BaccaratAction => {
    const a = legal.find((x) => x.type === 'BET' && x.spot === spot && x.amount === amount);
    return a ?? ready;
  };

  if (level === 'easy') {
    if (placed > 0) return ready;
    if (rng() < 0.2) return ready; // sits this one out
    const r = rng();
    const spot: Spot = r < 0.1 ? 'tie' : r < 0.55 ? 'player' : 'banker';
    const chip = view.chips[Math.floor(rng() * 2)]!;
    return chip <= stack ? bet(spot, chip) : ready;
  }

  // Medium: twice the minimum; hard: about 3% of the stack, never under the minimum.
  const target = level === 'medium' ? view.minBet * 2 : Math.max(view.minBet, Math.floor((stack + placed) * 0.03));
  if (placed >= target) return ready;
  const chip = chipFor(view, target - placed);
  return chip === null ? ready : bet('banker', chip);
}

// ---------------------------------------------------------------------------
// The definition
// ---------------------------------------------------------------------------

function normalize(s: BaccaratState, seat: number, raw: unknown): BaccaratAction | null {
  if (!looksLikeAction(raw, seat)) return null;
  const r = raw as Record<string, unknown>;
  let rebuilt: BaccaratAction;
  if (r.type === 'CLEAR' || r.type === 'READY') rebuilt = { type: r.type, seat };
  else if (r.type === 'BET' && SPOTS.includes(r.spot as Spot) && typeof r.amount === 'number') {
    rebuilt = { type: 'BET', seat, spot: r.spot as Spot, amount: r.amount };
  } else return null;
  return matchLegal(legalActions(s, seat), rebuilt);
}

export type BaccaratDefinition = GameDefinition<BaccaratState, BaccaratAction, BaccaratView, BaccaratEvent, BaccaratConfig>;

export const BACCARAT: BaccaratDefinition = {
  meta: {
    id: 'baccarat',
    minPlayers: 1,
    maxPlayers: 7,
    teams: null,
    deck: 'french52-shoe',
    betting: true,
    casino: true,
    simultaneous: true,
    windowMs: 20_000,
    nextRoundMs: 6_000,
  },
  defaultConfig: DEFAULT_BACCARAT_CONFIG,
  createMatch: (o) => createMatch(o),
  startRound,
  roundOver: (s) => s.phase === 'ROUND_OVER',
  matchOver: (s) => s.phase === 'MATCH_OVER',
  actors,
  seatStatus: (s, seat) => (isOut(s, seat) ? 'out' : 'active'),
  legalActions,
  normalize,
  // The window closed on you: no (more) bets.
  defaultAction: (_s, seat) => ({ type: 'READY', seat }),
  apply: applyAction,
  view: publicView,
  secrets: (s): Secret[] => [{ tokens: s.shoe.map((c) => c.id), visibleTo: [] }],
  isEventPublic: () => true,
  deriveEvents,
  winners,
  settlement: (s) => (s.phase === 'MATCH_OVER' ? s.stacks.map((x, i) => x - s.startStacks[i]!) : null),
  bot: { decide: (view, rng, level) => decideBaccarat(view, rng, level) },
};
