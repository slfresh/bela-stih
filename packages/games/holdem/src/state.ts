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
 * flop), the big blind moving on one live seat a hand even as players bust
 * (nobody pays it twice running or skips it), the minimum raise (at least the
 * size of the last full raise), a short all-in that does not reopen the
 * betting for whoever already acted (though several that add up to a full
 * raise do), the big blind's option, uncalled chips handed back rather than
 * "won", side pots built from what each player committed, and odd chips to
 * the first winner left of the button.
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
  /** Only chips somebody else put in too: what was actually contested. */
  pots: PotResult[];
  /** A bet nobody matched, handed back to whoever made it (empty when none). Never counted as won. */
  returned: { seat: number; amount: number }[];
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
  /** The part of a bet nobody matched goes back to its owner: not a pot, and not a win. */
  | { kind: 'returned'; seat: number; amount: number }
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
  /**
   * Per seat, the bet to call when it last acted on this street (null: not yet).
   * A seat that already acted may raise again only once the bet has gone up a
   * full raise since: one short all-in does not reopen the betting, but
   * several that add up to a full raise do.
   */
  actedAt: (number | null)[];
  /** The seat that posted the big blind last hand: the next live seat after it posts this one. */
  bigBlindSeat: number | null;
  /** Uncalled chips handed back so far this hand, for `lastResult`. */
  returned: { seat: number; amount: number }[];
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
    actedAt: Array<number | null>(o.seats).fill(null),
    bigBlindSeat: null,
    returned: [],
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
  actedAt: s.actedAt.slice(),
  returned: s.returned.slice(),
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

/** The seat before `from` (counter-clockwise) that satisfies `ok`. */
function prevSeat(s: HoldemState, from: number, ok: (p: Player, seat: number) => boolean): number | null {
  for (let i = 1; i <= s.seats; i++) {
    const seat = (from - i + s.seats * 2) % s.seats;
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
  s.returned = [];
  s.deck = shuffle(makeDeck52(), s.rng);
  const isLive = (p: Player) => p.status !== 'out';
  const live = s.players.filter(isLive).length;
  let sb: number;
  let bb: number;
  if (s.bigBlindSeat === null) {
    // The first hand: the button on the dealer, the blinds after it (heads
    // up the button is the small blind).
    s.button = nextSeat(s, s.button, isLive)!;
    sb = live === 2 ? s.button : nextSeat(s, s.button, isLive)!;
    bb = nextSeat(s, sb, isLive)!;
  } else {
    // After that the big blind leads: it moves on to the next live seat, so
    // when someone busts nobody pays it twice running or skips it — going
    // heads up included. The small blind and the button are the live seats
    // just before it (heads up the button posts the small blind).
    bb = nextSeat(s, s.bigBlindSeat, isLive)!;
    sb = prevSeat(s, bb, isLive)!;
    s.button = live === 2 ? sb : prevSeat(s, sb, isLive)!;
  }
  s.bigBlindSeat = bb;
  s.log.push({ kind: 'handStarted', handNumber: s.handNumber, button: s.button, smallBlind: s.smallBlind, bigBlind: s.bigBlind });
  const sbPosted = put(s, sb, s.smallBlind);
  s.log.push({ kind: 'blind', seat: sb, amount: sbPosted, big: false });
  const bbPosted = put(s, bb, s.bigBlind);
  s.log.push({ kind: 'blind', seat: bb, amount: bbPosted, big: true });
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
  // The bet to match is the full big blind, even when the big blind is all in
  // for less: a short blind does not make limping cheaper for the others, and
  // a raise is measured from the big blind. Only when a single player can
  // still act is there nobody to match the full blind against, and then the
  // bet is what the blinds actually put in (a small blind facing a big blind
  // all in for 5 has nothing to call; whatever it put in above that goes back).
  s.currentBet = s.players.filter(canAct).length >= 2 ? s.bigBlind : Math.max(sbPosted, bbPosted);
  s.minRaise = s.bigBlind;
  s.pending = s.players.map(canAct);
  s.actedAt = Array<number | null>(s.seats).fill(null);
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
  if (!canAct(p) || raiseClosedFor(s, seat)) return null;
  const max = p.bet + p.stack;
  if (max <= s.currentBet) return null; // can only call (all-in or not)
  // Nobody left to raise against: everyone else is all in or folded.
  const others = s.players.filter((q, i) => i !== seat && canAct(q)).length;
  if (others === 0) return null;
  const min = Math.min(max, s.currentBet + s.minRaise);
  return [min, max];
}

/**
 * A seat that already acted on this street may raise again only if the bet
 * has gone up by at least a full raise since: a short all-in alone leaves it
 * call or fold, but short all-ins that add up to a full raise reopen it.
 */
function raiseClosedFor(s: HoldemState, seat: number): boolean {
  const at = s.actedAt[seat];
  return at !== null && at !== undefined && s.currentBet - at < s.minRaise;
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
    // Everyone left must answer the new bet; whether they may raise it is
    // `raiseClosedFor`, from the bet each last acted at.
    for (let seat = 0; seat < s.seats; seat++) {
      if (seat === a.seat || !canAct(s.players[seat]!)) continue;
      s.pending[seat] = true;
    }
    if (full) s.minRaise = raisedBy;
  }
  // Whatever it did, this seat has now answered the bet as it stands.
  s.actedAt[a.seat] = s.currentBet;
  advance(s, a.seat);
  return s;
}

/**
 * Nobody can still act, or only one player who has matched everyone else: the
 * rest is just cards. "Matched" is against what the others actually have in,
 * not the bet to match - preflop that is the full big blind even when the big
 * blind is all in for less, and a small blind left alone against it has
 * nothing more to put in (the excess goes back when the street closes).
 */
function everyoneButOneIsAllIn(s: HoldemState): boolean {
  const live = s.players.filter(inHand);
  const acting = live.filter(canAct);
  if (live.length < 2) return false;
  if (acting.length === 0) return true;
  if (acting.length > 1) return false;
  const lone = acting[0]!;
  const others = Math.max(...live.filter((p) => p !== lone).map((p) => p.bet));
  return lone.bet >= others;
}

function advance(s: HoldemState, from: number): void {
  const live = s.players.filter(inHand);
  if (live.length === 1) {
    // Everyone else folded: no showdown.
    s.toAct = null;
    awardUncontested(s);
    return;
  }
  // The one player left with chips who is short of the others still has to
  // call or fold: everyoneButOneIsAllIn is false for them.
  const next = nextSeat(s, from, (p, seat) => canAct(p) && s.pending[seat]!);
  if (next !== null && !everyoneButOneIsAllIn(s)) {
    s.toAct = next;
    return;
  }
  closeStreet(s);
}

const STREETS: Street[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];

/** The street is over: next one, or run the board out, or the showdown. */
function closeStreet(s: HoldemState): void {
  // A bet nobody could match (everyone else all in for less, or folded) goes
  // back before any more cards: those chips were never in contention.
  returnUncalled(s);
  for (const p of s.players) p.bet = 0;
  s.currentBet = 0;
  s.minRaise = s.bigBlind;
  s.actedAt = Array<number | null>(s.seats).fill(null);
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

/**
 * Hand back the part of the biggest commitment nobody else matched — the
 * chips above the second-biggest, folded players included (what a folder put
 * in did match it that far). Only one seat can have such chips.
 */
function returnUncalled(s: HoldemState): void {
  const order = s.players.map((_, seat) => seat).sort((a, b) => s.players[b]!.committed - s.players[a]!.committed);
  const top = order[0]!;
  const p = s.players[top]!;
  const amount = p.committed - s.players[order[1]!]!.committed;
  if (amount <= 0) return;
  p.committed -= amount;
  p.bet -= amount;
  p.stack += amount;
  // Shoved more than anyone could call: with chips back, not all in after all.
  if (p.status === 'allIn') p.status = 'active';
  s.returned = [...s.returned, { seat: top, amount }];
  s.log.push({ kind: 'returned', seat: top, amount });
}

function awardUncontested(s: HoldemState): void {
  returnUncalled(s);
  const winner = s.players.findIndex(inHand);
  const pot = s.players.reduce((a, p) => a + p.committed, 0);
  const net = s.players.map((p) => -p.committed);
  s.players[winner]!.stack += pot;
  net[winner]! += pot;
  s.log.push({ kind: 'potWon', amount: pot, winners: [winner], uncontested: true });
  s.lastResult = { pots: [{ amount: pot, winners: [winner], eligible: [winner] }], returned: s.returned.slice(), shown: [], net };
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
  s.lastResult = { pots: results, returned: s.returned.slice(), shown, net };
  endHand(s);
}

function endHand(s: HoldemState): void {
  s.toAct = null;
  // The pot is paid: no bet stays in front of anyone, however the hand ended.
  for (const p of s.players) {
    p.committed = 0;
    p.bet = 0;
  }
  s.currentBet = 0;
  s.pending = Array<boolean>(s.seats).fill(false);
  s.actedAt = Array<number | null>(s.seats).fill(null);
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
