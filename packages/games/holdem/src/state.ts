import { makeRng, shuffle, type Rng } from '@belot/game-core';
import { makeDeck52, type Card52 } from '@belot/cards';
import { categoryOf, evaluate, type Category } from './evaluate';

/**
 * No-limit Texas Hold'em, as a sit-and-go for 2 to 9: everyone starts with the
 * same stack, the blinds go up every few hands, and the match ends when one
 * player has every chip.
 *
 * The rules a home game gets wrong are the ones kept exactly here: the
 * heads-up blinds (the button posts the small blind and acts first before the
 * flop), the minimum raise (at least the size of the last full raise), a
 * short all-in that does not reopen the betting for whoever already acted,
 * the big blind's option, side pots built from what each player committed,
 * and odd chips to the first winner left of the button.
 *
 * Like Blackjack, the engine writes what each move did into `log` as it
 * applies it; hole cards appear there only when shown down.
 */

export interface HoldemConfig {
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  /** The blinds double every this many hands; 0 keeps them fixed. */
  blindsUpEvery: number;
  /** Stop after this many hands even if several players are left (0: play to the end). */
  maxHands: number;
}

export const DEFAULT_HOLDEM_CONFIG: HoldemConfig = {
  startingStack: 1500,
  smallBlind: 10,
  bigBlind: 20,
  blindsUpEvery: 8,
  maxHands: 0,
};

export type Street = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER';
export type HoldemPhase = 'IDLE' | Street | 'HAND_OVER' | 'MATCH_OVER';
export type PlayerStatus = 'active' | 'folded' | 'allIn' | 'out';

export interface Player {
  stack: number;
  status: PlayerStatus;
  /** Put in on this street. */
  bet: number;
  /** Put in this hand, all streets (what side pots are built from). */
  committed: number;
  /** Hidden: only its owner sees it until a showdown. */
  hole: Card52[];
}

export interface PotResult {
  amount: number;
  winners: number[];
  eligible: number[];
}

export interface Shown {
  seat: number;
  hole: Card52[];
  category: Category;
  score: number;
}

export interface HandResult {
  pots: PotResult[];
  /** Hands shown at a showdown; empty when everyone else folded. */
  shown: Shown[];
  /** Per seat, chips won minus chips put in this hand. */
  net: number[];
}

export type HoldemEvent =
  | { kind: 'matchStarted'; matchNumber: number }
  | { kind: 'handStarted'; handNumber: number; button: number; smallBlind: number; bigBlind: number }
  | { kind: 'blindsUp'; smallBlind: number; bigBlind: number }
  | { kind: 'blind'; seat: number; amount: number; big: boolean }
  /** Two cards to each seat in the hand — face down: which cards is never on the stream. */
  | { kind: 'holeDealt'; seats: number[] }
  | { kind: 'acted'; seat: number; action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn'; to: number; amount: number }
  | { kind: 'street'; street: Street; cards: Card52[] }
  | { kind: 'showdown'; shown: Shown[] }
  | { kind: 'potWon'; amount: number; winners: number[]; uncontested: boolean }
  | { kind: 'eliminated'; seat: number }
  | { kind: 'matchOver'; winners: number[]; stacks: number[] };

export interface HoldemState {
  seats: number;
  config: HoldemConfig;
  rng: Rng;
  phase: HoldemPhase;
  /** Hidden from everyone. */
  deck: Card52[];
  board: Card52[];
  button: number;
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  players: Player[];
  toAct: number | null;
  /** The bet to call on this street. */
  currentBet: number;
  /** The size of the last full raise on this street (the big blind to begin with). */
  minRaise: number;
  /** Seats that still owe an answer on this street. */
  pending: boolean[];
  /** Seats that may only call or fold: a short all-in did not reopen the betting for them. */
  raiseClosed: boolean[];
  lastResult: HandResult | null;
  startStacks: number[];
  log: HoldemEvent[];
}

export type HoldemAction =
  | { type: 'FOLD'; seat: number }
  | { type: 'CHECK'; seat: number }
  | { type: 'CALL'; seat: number }
  /** Bet or raise TO this many chips on the street (a bet when nothing has been bet yet). */
  | { type: 'RAISE'; seat: number; to: number };

// ---------------------------------------------------------------------------

export function createMatch(o: { seats: number; seed: number; rng?: Rng; config?: Partial<HoldemConfig>; dealer?: number; stacks?: number[] }): HoldemState {
  if (!Number.isInteger(o.seats) || o.seats < 2 || o.seats > 9) throw new Error(`hold'em seats 2 to 9, not ${o.seats}`);
  const config = { ...DEFAULT_HOLDEM_CONFIG, ...o.config };
  const stacks = o.stacks?.slice() ?? Array<number>(o.seats).fill(config.startingStack);
  return {
    seats: o.seats,
    config,
    rng: o.rng ?? makeRng(o.seed),
    phase: 'IDLE',
    deck: [],
    board: [],
    // The first hand moves the button on by one, so it starts on `dealer`.
    button: ((o.dealer ?? 0) - 1 + o.seats) % o.seats,
    handNumber: 0,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    players: stacks.map((stack) => ({ stack, status: stack > 0 ? 'active' : 'out', bet: 0, committed: 0, hole: [] })),
    toAct: null,
    currentBet: 0,
    minRaise: config.bigBlind,
    pending: Array<boolean>(o.seats).fill(false),
    raiseClosed: Array<boolean>(o.seats).fill(false),
    lastResult: null,
    startStacks: stacks.slice(),
    log: [],
  };
}

const clone = (s: HoldemState): HoldemState => ({
  ...s,
  deck: s.deck.slice(),
  board: s.board.slice(),
  players: s.players.map((p) => ({ ...p, hole: p.hole.slice() })),
  pending: s.pending.slice(),
  raiseClosed: s.raiseClosed.slice(),
  log: [],
});

/** The next seat after `from` (clockwise) that satisfies `ok`. */
function nextSeat(s: HoldemState, from: number, ok: (p: Player, seat: number) => boolean): number | null {
  for (let i = 1; i <= s.seats; i++) {
    const seat = (from + i) % s.seats;
    if (ok(s.players[seat]!, seat)) return seat;
  }
  return null;
}

const inHand = (p: Player) => p.status === 'active' || p.status === 'allIn';
const canAct = (p: Player) => p.status === 'active';

/** Put chips from a stack onto this street's bet; all-in when it runs out. */
function put(s: HoldemState, seat: number, chips: number): number {
  const p = s.players[seat]!;
  const amount = Math.min(chips, p.stack);
  p.stack -= amount;
  p.bet += amount;
  p.committed += amount;
  if (p.stack === 0) p.status = 'allIn';
  return amount;
}

export function startRound(prev: HoldemState): HoldemState {
  if (prev.phase !== 'IDLE' && prev.phase !== 'HAND_OVER') throw new Error(`cannot deal from ${prev.phase}`);
  const s = clone(prev);
  s.handNumber += 1;
  if (s.config.blindsUpEvery > 0 && s.handNumber > 1 && (s.handNumber - 1) % s.config.blindsUpEvery === 0) {
    s.smallBlind *= 2;
    s.bigBlind *= 2;
    s.log.push({ kind: 'blindsUp', smallBlind: s.smallBlind, bigBlind: s.bigBlind });
  }
  for (const p of s.players) {
    p.bet = 0;
    p.committed = 0;
    p.hole = [];
    p.status = p.stack > 0 ? 'active' : 'out';
  }
  s.board = [];
  s.lastResult = null;
  s.deck = shuffle(makeDeck52(), s.rng);
  s.button = nextSeat(s, s.button, (p) => p.status !== 'out')!;
  const live = s.players.filter((p) => p.status !== 'out').length;
  // Heads up the button is the small blind; otherwise the next two seats post.
  const sb = live === 2 ? s.button : nextSeat(s, s.button, (p) => p.status !== 'out')!;
  const bb = nextSeat(s, sb, (p) => p.status !== 'out')!;
  s.log.push({ kind: 'handStarted', handNumber: s.handNumber, button: s.button, smallBlind: s.smallBlind, bigBlind: s.bigBlind });
  s.log.push({ kind: 'blind', seat: sb, amount: put(s, sb, s.smallBlind), big: false });
  s.log.push({ kind: 'blind', seat: bb, amount: put(s, bb, s.bigBlind), big: true });
  const dealt: number[] = [];
  for (let round = 0; round < 2; round++) {
    for (let i = 1; i <= s.seats; i++) {
      const seat = (s.button + i) % s.seats;
      if (s.players[seat]!.status === 'out') continue;
      s.players[seat]!.hole.push(s.deck.pop()!);
      if (round === 0) dealt.push(seat);
    }
  }
  s.log.push({ kind: 'holeDealt', seats: dealt });
  s.phase = 'PREFLOP';
  s.currentBet = s.bigBlind;
  s.minRaise = s.bigBlind;
  s.pending = s.players.map(canAct);
  s.raiseClosed = Array<boolean>(s.seats).fill(false);
  // First to act: after the big blind (heads up, that is the button).
  s.toAct = nextSeat(s, bb, (p, seat) => canAct(p) && s.pending[seat]!);
  if (s.toAct === null || everyoneButOneIsAllIn(s)) closeStreet(s);
  return s;
}

export function actors(s: HoldemState): number[] {
  return s.toAct === null || !['PREFLOP', 'FLOP', 'TURN', 'RIVER'].includes(s.phase) ? [] : [s.toAct];
}

/** The range a raise may go TO: [min, max]; null when this seat may not raise. */
export function raiseRange(s: HoldemState, seat: number): [number, number] | null {
  const p = s.players[seat]!;
  if (!canAct(p) || s.raiseClosed[seat]) return null;
  const max = p.bet + p.stack;
  if (max <= s.currentBet) return null; // can only call (all-in or not)
  // Nobody left to raise against: everyone else is all in or folded.
  const others = s.players.filter((q, i) => i !== seat && canAct(q)).length;
  if (others === 0) return null;
  const min = Math.min(max, s.currentBet + s.minRaise);
  return [min, max];
}

export function legalActions(s: HoldemState, seat: number): HoldemAction[] {
  if (s.toAct !== seat) return [];
  const p = s.players[seat]!;
  const out: HoldemAction[] = [];
  if (p.bet < s.currentBet) {
    out.push({ type: 'FOLD', seat }, { type: 'CALL', seat });
  } else {
    out.push({ type: 'CHECK', seat });
  }
  const r = raiseRange(s, seat);
  if (r) {
    out.push({ type: 'RAISE', seat, to: r[0] });
    if (r[1] > r[0]) out.push({ type: 'RAISE', seat, to: r[1] });
  }
  return out;
}

/** Is this action legal? Raises are legal anywhere in their range, not only at its ends. */
export function isLegal(s: HoldemState, a: HoldemAction): boolean {
  if (s.toAct !== a.seat) return false;
  if (a.type === 'RAISE') {
    const r = raiseRange(s, a.seat);
    return r !== null && Number.isInteger(a.to) && a.to >= r[0] && a.to <= r[1];
  }
  return legalActions(s, a.seat).some((x) => x.type === a.type);
}

export function applyAction(prev: HoldemState, a: HoldemAction): HoldemState {
  if (!isLegal(prev, a)) {
    if (prev.toAct !== a.seat) throw new Error(`it is not seat ${a.seat}'s turn`);
    if (a.type === 'RAISE') {
      const r = raiseRange(prev, a.seat);
      throw new Error(r ? `a raise must go to between ${r[0]} and ${r[1]}` : 'you may not raise now');
    }
    throw new Error(`${a.type} is not legal now`);
  }
  const s = clone(prev);
  const p = s.players[a.seat]!;
  s.pending[a.seat] = false;
  if (a.type === 'FOLD') {
    p.status = 'folded';
    s.log.push({ kind: 'acted', seat: a.seat, action: 'fold', to: p.bet, amount: 0 });
  } else if (a.type === 'CHECK') {
    s.log.push({ kind: 'acted', seat: a.seat, action: 'check', to: p.bet, amount: 0 });
  } else if (a.type === 'CALL') {
    const amount = put(s, a.seat, s.currentBet - p.bet);
    s.log.push({ kind: 'acted', seat: a.seat, action: p.status === 'allIn' ? 'allIn' : 'call', to: p.bet, amount });
  } else {
    const before = s.currentBet;
    const amount = put(s, a.seat, a.to - p.bet);
    const raisedBy = p.bet - before;
    const full = raisedBy >= s.minRaise;
    s.log.push({ kind: 'acted', seat: a.seat, action: p.status === 'allIn' ? 'allIn' : before === 0 ? 'bet' : 'raise', to: p.bet, amount });
    s.currentBet = p.bet;
    for (let seat = 0; seat < s.seats; seat++) {
      if (seat === a.seat || !canAct(s.players[seat]!)) continue;
      // Everyone left must answer the new bet...
      const hadActed = !s.pending[seat];
      s.pending[seat] = true;
      // ...but a short all-in does not give those who already acted a new right to raise.
      s.raiseClosed[seat] = full ? false : hadActed || s.raiseClosed[seat]!;
    }
    if (full) s.minRaise = raisedBy;
  }
  advance(s, a.seat);
  return s;
}

function everyoneButOneIsAllIn(s: HoldemState): boolean {
  const live = s.players.filter(inHand);
  const acting = live.filter(canAct);
  // Nobody (or one player who has matched the bet) can still act: the rest is just cards.
  return live.length >= 2 && (acting.length === 0 || (acting.length === 1 && acting[0]!.bet >= s.currentBet));
}

function advance(s: HoldemState, from: number): void {
  const live = s.players.filter(inHand);
  if (live.length === 1) {
    // Everyone else folded: no showdown.
    s.toAct = null;
    awardUncontested(s);
    return;
  }
  const next = nextSeat(s, from, (p, seat) => canAct(p) && s.pending[seat]!);
  if (next !== null && !everyoneButOneIsAllIn(s)) {
    s.toAct = next;
    return;
  }
  if (next !== null && everyoneButOneIsAllIn(s) && s.players[next]!.bet < s.currentBet) {
    // The one player left with chips still has to call or fold.
    s.toAct = next;
    return;
  }
  closeStreet(s);
}

const STREETS: Street[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];

/** The street is over: next one, or run the board out, or the showdown. */
function closeStreet(s: HoldemState): void {
  for (const p of s.players) p.bet = 0;
  s.currentBet = 0;
  s.minRaise = s.bigBlind;
  s.raiseClosed = Array<boolean>(s.seats).fill(false);
  s.toAct = null;
  const runOut = everyoneButOneIsAllIn(s);
  while (true) {
    const i = STREETS.indexOf(s.phase as Street);
    if (i === 3) {
      showdown(s);
      return;
    }
    const street = STREETS[i + 1]!;
    s.deck.pop(); // the burn card
    const cards = street === 'FLOP' ? [s.deck.pop()!, s.deck.pop()!, s.deck.pop()!] : [s.deck.pop()!];
    s.board.push(...cards);
    s.phase = street;
    s.log.push({ kind: 'street', street, cards: cards.slice() });
    if (runOut) continue;
    s.pending = s.players.map(canAct);
    s.toAct = nextSeat(s, s.button, (p, seat) => canAct(p) && s.pending[seat]!);
    if (s.toAct === null) continue;
    return;
  }
}

function awardUncontested(s: HoldemState): void {
  const winner = s.players.findIndex(inHand);
  const pot = s.players.reduce((a, p) => a + p.committed, 0);
  const net = s.players.map((p) => -p.committed);
  s.players[winner]!.stack += pot;
  net[winner]! += pot;
  s.log.push({ kind: 'potWon', amount: pot, winners: [winner], uncontested: true });
  s.lastResult = { pots: [{ amount: pot, winners: [winner], eligible: [winner] }], shown: [], net };
  endHand(s);
}

/** Pots from what each player committed: a main pot and a side pot per all-in level. */
export function buildPots(players: Player[]): { amount: number; eligible: number[] }[] {
  const levels = [...new Set(players.filter((p) => p.committed > 0 && p.status !== 'folded').map((p) => p.committed))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: number[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of players) amount += Math.max(0, Math.min(p.committed, level) - prev);
    const eligible = players.map((p, i) => (p.status !== 'folded' && p.status !== 'out' && p.committed >= level ? i : -1)).filter((i) => i >= 0);
    if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  // Chips folded players put in above the top live level still belong to the last pot.
  const counted = pots.reduce((a, p) => a + p.amount, 0);
  const total = players.reduce((a, p) => a + p.committed, 0);
  if (total > counted && pots.length > 0) pots[pots.length - 1]!.amount += total - counted;
  return pots;
}

function showdown(s: HoldemState): void {
  const live = s.players.map((p, i) => (inHand(p) ? i : -1)).filter((i) => i >= 0);
  const scores = new Map<number, number>();
  for (const seat of live) scores.set(seat, evaluate([...s.players[seat]!.hole, ...s.board]));
  const shown: Shown[] = live.map((seat) => ({ seat, hole: s.players[seat]!.hole.slice(), score: scores.get(seat)!, category: categoryOf(scores.get(seat)!) }));
  s.log.push({ kind: 'showdown', shown });
  const net = s.players.map((p) => -p.committed);
  const results: PotResult[] = [];
  for (const pot of buildPots(s.players)) {
    const best = Math.max(...pot.eligible.map((seat) => scores.get(seat)!));
    const winners = pot.eligible.filter((seat) => scores.get(seat) === best);
    // Odd chips go to the first winner left of the button.
    const ordered = winners.slice().sort((a, b) => ((a - s.button - 1 + s.seats) % s.seats) - ((b - s.button - 1 + s.seats) % s.seats));
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    for (const w of ordered) {
      const won = share + (odd > 0 ? 1 : 0);
      if (odd > 0) odd--;
      s.players[w]!.stack += won;
      net[w]! += won;
    }
    results.push({ amount: pot.amount, winners, eligible: pot.eligible });
    s.log.push({ kind: 'potWon', amount: pot.amount, winners, uncontested: false });
  }
  s.lastResult = { pots: results, shown, net };
  endHand(s);
}

function endHand(s: HoldemState): void {
  s.toAct = null;
  for (const p of s.players) p.committed = 0;
  s.players.forEach((p, seat) => {
    if (p.stack === 0 && p.status !== 'out') {
      p.status = 'out';
      s.log.push({ kind: 'eliminated', seat });
    }
  });
  const left = s.players.filter((p) => p.stack > 0).length;
  const capped = s.config.maxHands > 0 && s.handNumber >= s.config.maxHands;
  s.phase = left <= 1 || capped ? 'MATCH_OVER' : 'HAND_OVER';
  if (s.phase === 'MATCH_OVER') s.log.push({ kind: 'matchOver', winners: winners(s)!, stacks: s.players.map((p) => p.stack) });
}

export function winners(s: HoldemState): number[] | null {
  if (s.phase !== 'MATCH_OVER') return null;
  const best = Math.max(...s.players.map((p) => p.stack));
  return s.players.map((p, i) => (p.stack === best ? i : -1)).filter((i) => i >= 0);
}

export function chipsInPlay(s: HoldemState): number {
  return s.players.reduce((a, p) => a + p.stack + p.committed, 0);
}
