import { makeRng, type Rng } from '@belot/game-core';
import { makeShoe, type Card52 } from '@belot/cards';
import { playCoup, type Coup, type Outcome } from './tableau';

/**
 * Baccarat (punto banco) for a table of 1 to 7 against the house.
 *
 * Each coup is a betting window everyone answers at once — chips on the
 * player, the banker or the tie, then "no more bets" — and when the last seat
 * is ready the engine deals the coup by the tableau and pays it, in the same
 * move. Chips are play money: what a seat starts with, what it wins or loses,
 * nothing else; a match is a fixed number of coups.
 */

export type Spot = Outcome;
export const SPOTS: readonly Spot[] = ['player', 'banker', 'tie'];

export interface BaccaratConfig {
  decks: number;
  startingStack: number;
  minBet: number;
  /** Per spot, per coup. */
  maxBet: number;
  /** Coups in a match. */
  coups: number;
  /** The house's cut of a winning banker bet, in percent. */
  commissionPct: number;
  /** A winning tie bet pays this many to one. */
  tiePays: number;
  /** Fewer cards than this left in the shoe at a coup's start: a fresh shoe. */
  cutCard: number;
}

export const DEFAULT_BACCARAT_CONFIG: BaccaratConfig = {
  decks: 8,
  startingStack: 1000,
  minBet: 10,
  maxBet: 500,
  coups: 20,
  commissionPct: 5,
  tiePays: 8,
  cutCard: 16,
};

/** The chips a bet is made of. */
export const CHIPS: readonly number[] = [10, 25, 100, 500];

export type BaccaratPhase = 'IDLE' | 'BETTING' | 'ROUND_OVER' | 'MATCH_OVER';
export type Bets = Record<Spot, number>;
const noBets = (): Bets => ({ player: 0, banker: 0, tie: 0 });
export const betTotal = (b: Bets): number => b.player + b.banker + b.tie;

export interface BaccaratState {
  seats: number;
  config: BaccaratConfig;
  rng: Rng;
  phase: BaccaratPhase;
  /** Hidden from everyone: the order of the shoe. */
  shoe: Card52[];
  coupNumber: number;
  /** Chips in front of each seat, not counting what is on the table. */
  stacks: number[];
  /** Chips on the table this coup, per seat and spot. */
  bets: Bets[];
  ready: boolean[];
  lastCoup: Coup | null;
  /** Per seat: what the last coup won (+) or lost (−). */
  lastNet: number[] | null;
  /** The last outcomes, oldest first (the "bead road" every table shows). */
  road: Outcome[];
  /** This coup began with a fresh shoe. */
  shuffled: boolean;
  /** The house's running result: everything the seats lost, minus everything they won. */
  house: number;
  /** The stacks the match started with, for its settlement. */
  startStacks: number[];
  /**
   * Per seat, banker commission owed but not yet taken, in hundredths of a
   * chip. Chips are whole, so 5% of a 10 or 25 bet cannot be taken exactly;
   * the house takes a whole chip only once a whole chip is owed and carries
   * the rest to the seat's next banker win. Not chips: nothing here is on the
   * table, so it plays no part in the chip count.
   */
  commissionOwed: number[];
}

export type BaccaratAction =
  | { type: 'BET'; seat: number; spot: Spot; amount: number }
  | { type: 'CLEAR'; seat: number }
  | { type: 'READY'; seat: number };

export function createMatch(o: { seats: number; seed: number; rng?: Rng; config?: Partial<BaccaratConfig>; stacks?: number[] }): BaccaratState {
  if (!Number.isInteger(o.seats) || o.seats < 1 || o.seats > 7) throw new Error(`baccarat seats 1 to 7, not ${o.seats}`);
  const config = { ...DEFAULT_BACCARAT_CONFIG, ...o.config };
  const rng = o.rng ?? makeRng(o.seed);
  const stacks = o.stacks?.slice() ?? Array<number>(o.seats).fill(config.startingStack);
  return {
    seats: o.seats,
    config,
    rng,
    phase: 'IDLE',
    shoe: makeShoe(config.decks, rng),
    coupNumber: 0,
    stacks,
    bets: Array.from({ length: o.seats }, noBets),
    ready: Array<boolean>(o.seats).fill(false),
    lastCoup: null,
    lastNet: null,
    road: [],
    shuffled: true,
    house: 0,
    startStacks: stacks.slice(),
    commissionOwed: Array<number>(o.seats).fill(0),
  };
}

const clone = (s: BaccaratState): BaccaratState => ({
  ...s,
  shoe: s.shoe.slice(),
  stacks: s.stacks.slice(),
  bets: s.bets.map((b) => ({ ...b })),
  ready: s.ready.slice(),
  road: s.road.slice(),
  commissionOwed: s.commissionOwed.slice(),
});

/** A seat that cannot cover the smallest bet sits the coup out. */
export const isOut = (s: BaccaratState, seat: number): boolean => s.stacks[seat]! + betTotal(s.bets[seat]!) < s.config.minBet;

export function startRound(prev: BaccaratState): BaccaratState {
  if (prev.phase !== 'IDLE' && prev.phase !== 'ROUND_OVER') throw new Error(`cannot start a coup from ${prev.phase}`);
  const s = clone(prev);
  s.coupNumber += 1;
  s.bets = Array.from({ length: s.seats }, noBets);
  s.shuffled = s.coupNumber === 1;
  if (s.shoe.length < s.config.cutCard) {
    s.shoe = makeShoe(s.config.decks, s.rng);
    s.shuffled = true;
  }
  s.ready = Array.from({ length: s.seats }, (_, seat) => isOut(s, seat));
  s.lastCoup = null;
  s.lastNet = null;
  s.phase = 'BETTING';
  // A table where nobody can bet still deals its coup: the road goes on.
  return s.ready.every(Boolean) ? resolve(s) : s;
}

export function actors(s: BaccaratState): number[] {
  if (s.phase !== 'BETTING') return [];
  return s.ready.map((r, seat) => (r ? -1 : seat)).filter((x) => x >= 0);
}

export function legalActions(s: BaccaratState, seat: number): BaccaratAction[] {
  if (s.phase !== 'BETTING' || s.ready[seat]) return [];
  const out: BaccaratAction[] = [];
  const stack = s.stacks[seat]!;
  const bets = s.bets[seat]!;
  for (const spot of SPOTS) {
    for (const amount of CHIPS) {
      if (amount <= stack && bets[spot] + amount <= s.config.maxBet) out.push({ type: 'BET', seat, spot, amount });
    }
  }
  if (betTotal(bets) > 0) out.push({ type: 'CLEAR', seat });
  out.push({ type: 'READY', seat });
  return out;
}

export function applyAction(prev: BaccaratState, a: BaccaratAction): BaccaratState {
  const legal = legalActions(prev, a.seat);
  const same = (x: BaccaratAction) =>
    x.type === a.type && (x.type !== 'BET' || (a.type === 'BET' && x.spot === a.spot && x.amount === a.amount));
  if (!legal.some(same)) {
    if (prev.phase !== 'BETTING') throw new Error('no more bets');
    if (prev.ready[a.seat]) throw new Error(`seat ${a.seat} has already said no more bets`);
    if (a.type === 'BET') throw new Error(`a bet of ${a.amount} on ${a.spot} is not allowed now`);
    throw new Error(`${a.type} is not a legal move now`);
  }
  const s = clone(prev);
  const bets = s.bets[a.seat]!;
  if (a.type === 'BET') {
    s.stacks[a.seat] = s.stacks[a.seat]! - a.amount;
    bets[a.spot] += a.amount;
    return s;
  }
  if (a.type === 'CLEAR') {
    s.stacks[a.seat] = s.stacks[a.seat]! + betTotal(bets);
    s.bets[a.seat] = noBets();
    return s;
  }
  s.ready[a.seat] = true;
  return s.ready.every(Boolean) ? resolve(s) : s;
}

/** No more bets: deal the coup, pay it, and close it. */
function resolve(s: BaccaratState): BaccaratState {
  const coup = playCoup(s.shoe);
  const net: number[] = [];
  for (let seat = 0; seat < s.seats; seat++) {
    const b = s.bets[seat]!;
    let back = 0;
    if (coup.outcome === 'player') back += b.player * 2;
    if (coup.outcome === 'banker' && b.banker > 0) {
      // 1:1 less the commission, exact over the match rather than per bet:
      // flooring each payout took 10% of a 10 bet and 8% of a 25. What is
      // owed builds up in hundredths and only whole chips are taken, so the
      // house never takes a chip before it is owed; the fraction still owed
      // when the match ends (under one chip) is let go.
      const owed = s.commissionOwed[seat]! + b.banker * s.config.commissionPct;
      const taken = Math.floor(owed / 100);
      s.commissionOwed[seat] = owed - taken * 100;
      back += b.banker * 2 - taken;
    }
    if (coup.outcome === 'tie') back += b.player + b.banker + b.tie * (1 + s.config.tiePays);
    s.stacks[seat] = s.stacks[seat]! + back;
    net.push(back - betTotal(b));
    s.house -= back - betTotal(b);
  }
  s.bets = Array.from({ length: s.seats }, noBets);
  s.lastCoup = coup;
  s.lastNet = net;
  s.road = [...s.road, coup.outcome].slice(-60);
  const nobodyCanBet = s.stacks.every((x) => x < s.config.minBet);
  s.phase = s.coupNumber >= s.config.coups || nobodyCanBet ? 'MATCH_OVER' : 'ROUND_OVER';
  return s;
}

/** The seats with the most chips at the end. */
export function winners(s: BaccaratState): number[] | null {
  if (s.phase !== 'MATCH_OVER') return null;
  const best = Math.max(...s.stacks);
  return s.stacks.map((x, i) => (x === best ? i : -1)).filter((i) => i >= 0);
}
