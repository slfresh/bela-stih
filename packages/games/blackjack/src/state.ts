import { makeRng, type Rng } from '@belot/game-core';
import { makeShoe, type Card52 } from '@belot/cards';

/**
 * Blackjack for a table of 1 to 5 against the dealer.
 *
 * A round opens with a betting window everyone answers at once. Then two cards
 * each and two for the dealer, one face down. The dealer peeks under an ace or
 * a ten: a dealer blackjack ends the round at once. Otherwise each hand plays
 * in turn — hit, stand, double on two cards, split a pair once — and the
 * dealer draws to 17, standing on a soft 17 unless the table says otherwise.
 * A blackjack pays 3:2, a win 1:1, a tie is a push.
 *
 * The engine writes what each move did into `log` as it applies it: the event
 * stream comes straight from the rules, and the dealer's face-down card is
 * withheld in exactly one place.
 */

export interface BlackjackConfig {
  decks: number;
  startingStack: number;
  minBet: number;
  maxBet: number;
  /** Rounds in a match. */
  rounds: number;
  /** Fewer cards than this left at a round's start: a fresh shoe. */
  cutCard: number;
  dealerHitsSoft17: boolean;
  /** A blackjack pays this fraction to one: 3:2 is [3, 2]. */
  blackjackPays: [number, number];
  doubleAfterSplit: boolean;
}

export const DEFAULT_BLACKJACK_CONFIG: BlackjackConfig = {
  decks: 6,
  startingStack: 1000,
  minBet: 10,
  maxBet: 500,
  rounds: 20,
  cutCard: 60,
  dealerHitsSoft17: false,
  blackjackPays: [3, 2],
  doubleAfterSplit: true,
};

export const CHIPS: readonly number[] = [10, 25, 100, 500];

export type BlackjackPhase = 'IDLE' | 'BETTING' | 'PLAYING' | 'ROUND_OVER' | 'MATCH_OVER';

export interface Hand {
  cards: Card52[];
  bet: number;
  doubled: boolean;
  /** Made by splitting: a 21 in two cards is not a blackjack. */
  fromSplit: boolean;
  /** No more cards for this hand. */
  done: boolean;
  /** Set when the round settles. */
  result: 'win' | 'lose' | 'push' | 'blackjack' | null;
}

export type HandResult = NonNullable<Hand['result']>;

export type BlackjackEvent =
  | { kind: 'matchStarted'; matchNumber: number }
  | { kind: 'roundStarted'; roundNumber: number; rounds: number; shuffled: boolean }
  | { kind: 'betPlaced'; seat: number; amount: number }
  | { kind: 'betsCleared'; seat: number }
  | { kind: 'ready'; seat: number }
  /** A card dealt face up — or, for the dealer's hole card, face down (`card: null`). */
  | { kind: 'dealt'; to: 'dealer' | number; hand: number; card: Card52 | null }
  | { kind: 'hit'; seat: number; hand: number }
  | { kind: 'stood'; seat: number; hand: number }
  | { kind: 'doubled'; seat: number; hand: number }
  | { kind: 'split'; seat: number }
  | { kind: 'busted'; seat: number; hand: number; total: number }
  | { kind: 'blackjack'; seat: number }
  | { kind: 'dealerRevealed'; card: Card52; total: number; blackjack: boolean }
  | { kind: 'dealerDone'; total: number; busted: boolean }
  | { kind: 'settled'; seat: number; hand: number; result: HandResult; net: number }
  | { kind: 'matchOver'; winners: number[]; stacks: number[] };

export interface BlackjackState {
  seats: number;
  config: BlackjackConfig;
  rng: Rng;
  phase: BlackjackPhase;
  /** Hidden from everyone. */
  shoe: Card52[];
  roundNumber: number;
  stacks: number[];
  /** The bet each seat has made in the window (before the deal). */
  bets: number[];
  ready: boolean[];
  hands: Hand[][];
  dealer: Card52[];
  /** The dealer's second card is face up. */
  holeShown: boolean;
  turn: { seat: number; hand: number } | null;
  /** Hi-Lo running count of every card shown since the last shuffle: public by construction. */
  runningCount: number;
  shuffled: boolean;
  house: number;
  startStacks: number[];
  /** What the last transition did, in order (see the header). */
  log: BlackjackEvent[];
}

export type BlackjackAction =
  | { type: 'BET'; seat: number; amount: number }
  | { type: 'CLEAR'; seat: number }
  | { type: 'READY'; seat: number }
  | { type: 'HIT'; seat: number }
  | { type: 'STAND'; seat: number }
  | { type: 'DOUBLE'; seat: number }
  | { type: 'SPLIT'; seat: number };

// ---------------------------------------------------------------------------
// Card arithmetic
// ---------------------------------------------------------------------------

export function cardValue(c: Card52): number {
  if (c.rank === 'A') return 11;
  if (c.rank === 'T' || c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') return 10;
  return Number(c.rank);
}

/** The best total and whether an ace still counts 11 in it. */
export function handValue(cards: Card52[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (h: { cards: Card52[]; fromSplit?: boolean }): boolean =>
  !h.fromSplit && h.cards.length === 2 && handValue(h.cards).total === 21;

/** Hi-Lo: 2-6 count +1, 7-9 nothing, tens and aces −1. */
export function hiLo(c: Card52): number {
  const v = cardValue(c);
  return v <= 6 ? 1 : v >= 10 ? -1 : 0;
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export function createMatch(o: { seats: number; seed: number; rng?: Rng; config?: Partial<BlackjackConfig>; stacks?: number[] }): BlackjackState {
  if (!Number.isInteger(o.seats) || o.seats < 1 || o.seats > 5) throw new Error(`blackjack seats 1 to 5, not ${o.seats}`);
  const config = { ...DEFAULT_BLACKJACK_CONFIG, ...o.config };
  const rng = o.rng ?? makeRng(o.seed);
  const stacks = o.stacks?.slice() ?? Array<number>(o.seats).fill(config.startingStack);
  return {
    seats: o.seats,
    config,
    rng,
    phase: 'IDLE',
    shoe: makeShoe(config.decks, rng),
    roundNumber: 0,
    stacks,
    bets: Array<number>(o.seats).fill(0),
    ready: Array<boolean>(o.seats).fill(false),
    hands: Array.from({ length: o.seats }, () => []),
    dealer: [],
    holeShown: false,
    turn: null,
    runningCount: 0,
    shuffled: true,
    house: 0,
    startStacks: stacks.slice(),
    log: [],
  };
}

const clone = (s: BlackjackState): BlackjackState => ({
  ...s,
  shoe: s.shoe.slice(),
  stacks: s.stacks.slice(),
  bets: s.bets.slice(),
  ready: s.ready.slice(),
  hands: s.hands.map((hs) => hs.map((h) => ({ ...h, cards: h.cards.slice() }))),
  dealer: s.dealer.slice(),
  turn: s.turn ? { ...s.turn } : null,
  log: [],
});

/**
 * A seat with too few chips to bet the minimum. Chips riding on a hand not yet
 * settled count: the deal moves every bet off `bets` and onto the hands, and
 * a seat that bet its whole stack is still in until its hands are paid.
 */
export const isOut = (s: BlackjackState, seat: number): boolean =>
  s.stacks[seat]! + s.bets[seat]! + s.hands[seat]!.reduce((sum, h) => sum + (h.result === null ? h.bet : 0), 0) < s.config.minBet;

function draw(s: BlackjackState, faceUp = true): Card52 {
  const c = s.shoe.pop();
  if (!c) throw new Error('the shoe ran out');
  if (faceUp) s.runningCount += hiLo(c);
  return c;
}

export function startRound(prev: BlackjackState): BlackjackState {
  if (prev.phase !== 'IDLE' && prev.phase !== 'ROUND_OVER') throw new Error(`cannot start a round from ${prev.phase}`);
  const s = clone(prev);
  s.roundNumber += 1;
  s.shuffled = s.roundNumber === 1;
  if (s.shoe.length < s.config.cutCard) {
    s.shoe = makeShoe(s.config.decks, s.rng);
    s.runningCount = 0;
    s.shuffled = true;
  }
  s.bets = Array<number>(s.seats).fill(0);
  s.hands = Array.from({ length: s.seats }, () => []);
  s.dealer = [];
  s.holeShown = false;
  s.turn = null;
  s.ready = Array.from({ length: s.seats }, (_, seat) => isOut(s, seat));
  s.phase = 'BETTING';
  s.log.push({ kind: 'roundStarted', roundNumber: s.roundNumber, rounds: s.config.rounds, shuffled: s.shuffled });
  if (s.ready.every(Boolean)) deal(s);
  return s;
}

export function actors(s: BlackjackState): number[] {
  if (s.phase === 'BETTING') return s.ready.map((r, seat) => (r ? -1 : seat)).filter((x) => x >= 0);
  if (s.phase === 'PLAYING' && s.turn) return [s.turn.seat];
  return [];
}

export function legalActions(s: BlackjackState, seat: number): BlackjackAction[] {
  if (s.phase === 'BETTING') {
    if (s.ready[seat]) return [];
    const out: BlackjackAction[] = [];
    for (const amount of CHIPS) {
      if (amount <= s.stacks[seat]! && s.bets[seat]! + amount <= s.config.maxBet) out.push({ type: 'BET', seat, amount });
    }
    if (s.bets[seat]! > 0) out.push({ type: 'CLEAR', seat });
    // A bet under the minimum cannot stand: add to it, clear it, or sit the round out with nothing on.
    if (s.bets[seat] === 0 || s.bets[seat]! >= s.config.minBet) out.push({ type: 'READY', seat });
    return out;
  }
  if (s.phase !== 'PLAYING' || !s.turn || s.turn.seat !== seat) return [];
  const hand = s.hands[seat]![s.turn.hand]!;
  const out: BlackjackAction[] = [{ type: 'HIT', seat }, { type: 'STAND', seat }];
  const two = hand.cards.length === 2;
  const splitAces = hand.fromSplit && hand.cards[0]!.rank === 'A';
  if (two && !splitAces && s.stacks[seat]! >= hand.bet && (!hand.fromSplit || s.config.doubleAfterSplit)) out.push({ type: 'DOUBLE', seat });
  if (two && s.hands[seat]!.length === 1 && cardValue(hand.cards[0]!) === cardValue(hand.cards[1]!) && hand.cards[0]!.rank === hand.cards[1]!.rank && s.stacks[seat]! >= hand.bet) {
    out.push({ type: 'SPLIT', seat });
  }
  return out;
}

export function applyAction(prev: BlackjackState, a: BlackjackAction): BlackjackState {
  const legal = legalActions(prev, a.seat);
  if (!legal.some((x) => x.type === a.type && (x.type !== 'BET' || (a.type === 'BET' && x.amount === a.amount)))) {
    if (prev.phase === 'BETTING' && prev.ready[a.seat]) throw new Error(`seat ${a.seat} has already said no more bets`);
    if (a.type === 'BET') throw new Error(`a bet of ${a.amount} is not allowed now`);
    if (a.type === 'READY') throw new Error(`the minimum bet is ${prev.config.minBet}`);
    throw new Error(`${a.type} is not a legal move now`);
  }
  const s = clone(prev);
  switch (a.type) {
    case 'BET':
      s.stacks[a.seat] = s.stacks[a.seat]! - a.amount;
      s.bets[a.seat] = s.bets[a.seat]! + a.amount;
      s.log.push({ kind: 'betPlaced', seat: a.seat, amount: a.amount });
      return s;
    case 'CLEAR':
      s.stacks[a.seat] = s.stacks[a.seat]! + s.bets[a.seat]!;
      s.bets[a.seat] = 0;
      s.log.push({ kind: 'betsCleared', seat: a.seat });
      return s;
    case 'READY':
      s.ready[a.seat] = true;
      s.log.push({ kind: 'ready', seat: a.seat });
      if (s.ready.every(Boolean)) deal(s);
      return s;
  }
  const t = s.turn!;
  const hand = s.hands[t.seat]![t.hand]!;
  if (a.type === 'HIT') {
    s.log.push({ kind: 'hit', seat: t.seat, hand: t.hand });
    giveCard(s, t.seat, t.hand);
  } else if (a.type === 'STAND') {
    hand.done = true;
    s.log.push({ kind: 'stood', seat: t.seat, hand: t.hand });
  } else if (a.type === 'DOUBLE') {
    s.stacks[t.seat] = s.stacks[t.seat]! - hand.bet;
    hand.bet *= 2;
    hand.doubled = true;
    s.log.push({ kind: 'doubled', seat: t.seat, hand: t.hand });
    giveCard(s, t.seat, t.hand);
    hand.done = true;
  } else if (a.type === 'SPLIT') {
    s.stacks[t.seat] = s.stacks[t.seat]! - hand.bet;
    const second: Hand = { cards: [hand.cards.pop()!], bet: hand.bet, doubled: false, fromSplit: true, done: false, result: null };
    hand.fromSplit = true;
    s.hands[t.seat]!.push(second);
    s.log.push({ kind: 'split', seat: t.seat });
    giveCard(s, t.seat, 0);
    giveCard(s, t.seat, 1);
    // Split aces take one card each and nothing more.
    if (hand.cards[0]!.rank === 'A') {
      hand.done = true;
      second.done = true;
    }
  }
  advance(s);
  return s;
}

/** One card to a seat's hand; a bust or a 21 ends that hand. */
function giveCard(s: BlackjackState, seat: number, h: number): void {
  const hand = s.hands[seat]![h]!;
  const card = draw(s);
  hand.cards.push(card);
  s.log.push({ kind: 'dealt', to: seat, hand: h, card });
  const { total } = handValue(hand.cards);
  if (total > 21) {
    hand.done = true;
    s.log.push({ kind: 'busted', seat, hand: h, total });
  } else if (total === 21) {
    hand.done = true;
  }
}

/** No more bets: the deal, the peek, and the first hand to play. */
function deal(s: BlackjackState): void {
  const playing = Array.from({ length: s.seats }, (_, i) => i).filter((i) => s.bets[i]! > 0);
  for (const seat of playing) s.hands[seat] = [{ cards: [], bet: s.bets[seat]!, doubled: false, fromSplit: false, done: false, result: null }];
  s.bets = Array<number>(s.seats).fill(0);
  for (let round = 0; round < 2; round++) {
    for (const seat of playing) {
      const card = draw(s);
      s.hands[seat]![0]!.cards.push(card);
      s.log.push({ kind: 'dealt', to: seat, hand: 0, card });
    }
    const card = draw(s, round === 0);
    s.dealer.push(card);
    s.log.push({ kind: 'dealt', to: 'dealer', hand: 0, card: round === 0 ? card : null });
  }
  s.phase = 'PLAYING';
  // Blackjacks are settled at once unless the dealer has one too.
  const up = s.dealer[0]!;
  const dealerBj = isBlackjack({ cards: s.dealer });
  if ((up.rank === 'A' || cardValue(up) === 10) && dealerBj) {
    reveal(s);
    settle(s);
    return;
  }
  for (const seat of playing) {
    const hand = s.hands[seat]![0]!;
    if (isBlackjack(hand)) {
      hand.done = true;
      s.log.push({ kind: 'blackjack', seat });
    }
  }
  advance(s);
}

function reveal(s: BlackjackState): void {
  if (s.holeShown) return;
  s.holeShown = true;
  const hole = s.dealer[1]!;
  s.runningCount += hiLo(hole);
  s.log.push({ kind: 'dealerRevealed', card: hole, total: handValue(s.dealer).total, blackjack: isBlackjack({ cards: s.dealer }) });
}

/** The next hand still to play, or the dealer's turn and the settlement. */
function advance(s: BlackjackState): void {
  for (let seat = 0; seat < s.seats; seat++) {
    const hs = s.hands[seat]!;
    for (let h = 0; h < hs.length; h++) {
      if (!hs[h]!.done) {
        s.turn = { seat, hand: h };
        return;
      }
    }
  }
  s.turn = null;
  // The dealer plays only if some hand is still standing to beat.
  const live = s.hands.some((hs) => hs.some((h) => handValue(h.cards).total <= 21 && !isBlackjack(h)));
  reveal(s);
  if (live) {
    while (true) {
      const { total, soft } = handValue(s.dealer);
      if (total > 17 || (total === 17 && !(soft && s.config.dealerHitsSoft17))) break;
      const card = draw(s);
      s.dealer.push(card);
      s.log.push({ kind: 'dealt', to: 'dealer', hand: 0, card });
    }
  }
  const d = handValue(s.dealer).total;
  s.log.push({ kind: 'dealerDone', total: d, busted: d > 21 });
  settle(s);
}

function settle(s: BlackjackState): void {
  const dealer = handValue(s.dealer).total;
  const dealerBj = isBlackjack({ cards: s.dealer });
  const [num, den] = s.config.blackjackPays;
  s.hands.forEach((hs, seat) => {
    hs.forEach((hand, h) => {
      const mine = handValue(hand.cards).total;
      let result: HandResult;
      let back: number;
      if (isBlackjack(hand)) {
        result = dealerBj ? 'push' : 'blackjack';
        // 3:2 on an odd bet comes to half a chip, and there are no half
        // chips: the half goes to the player, as tables without them do,
        // rather than quietly to the house.
        back = dealerBj ? hand.bet : hand.bet + Math.ceil((hand.bet * num) / den);
      } else if (mine > 21 || dealerBj) {
        result = 'lose';
        back = 0;
      } else if (dealer > 21 || mine > dealer) {
        result = 'win';
        back = hand.bet * 2;
      } else if (mine === dealer) {
        result = 'push';
        back = hand.bet;
      } else {
        result = 'lose';
        back = 0;
      }
      hand.result = result;
      s.stacks[seat] = s.stacks[seat]! + back;
      s.house -= back - hand.bet;
      s.log.push({ kind: 'settled', seat, hand: h, result, net: back - hand.bet });
    });
  });
  const nobodyCanBet = s.stacks.every((x) => x < s.config.minBet);
  s.phase = s.roundNumber >= s.config.rounds || nobodyCanBet ? 'MATCH_OVER' : 'ROUND_OVER';
  if (s.phase === 'MATCH_OVER') s.log.push({ kind: 'matchOver', winners: winners(s)!, stacks: s.stacks.slice() });
}

export function winners(s: BlackjackState): number[] | null {
  if (s.phase !== 'MATCH_OVER') return null;
  const best = Math.max(...s.stacks);
  return s.stacks.map((x, i) => (x === best ? i : -1)).filter((i) => i >= 0);
}
