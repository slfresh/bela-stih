import { makeRng, shuffle, type Rng } from '@belot/game-core';
import { cardPoints, isNumber, isWild, makeDeck, type Colour, type OCard } from './cards';

/**
 * Osmice rules, as a pure state machine.
 *
 * On your turn, play one card that matches the active colour or the value on
 * top of the pile, or a wild. Or draw one: if it can be played you may play it
 * straight away, otherwise your turn ends. A `preskok` skips the next player,
 * `obrni` turns the direction round (between two it is a skip), `vuci2` makes
 * the next player draw two and miss their go, a `divlja` names the colour and
 * a `divlja4` names it and makes the next player draw four and miss their go.
 * Empty your hand to win the round: you score what is left in everybody
 * else's. First to the match target wins.
 */

export interface OsmiceConfig {
  /** Points to win the match. */
  matchTarget: number;
  /** Cards dealt to each player. */
  handSize: number;
  /**
   * May a draw-two be answered with another draw-two (and a draw-four with a
   * draw-four), passing the whole pile on? Off by default: the classic rule.
   */
  stackDraws: boolean;
  /** A draw-four only when you hold nothing of the active colour (the classic rule, enforced). */
  wild4OnlyWithoutColour: boolean;
}

export const DEFAULT_OSMICE_CONFIG: OsmiceConfig = {
  matchTarget: 500,
  handSize: 7,
  stackDraws: false,
  wild4OnlyWithoutColour: true,
};

export type OsmicePhase = 'IDLE' | 'PLAY' | 'ROUND_OVER' | 'MATCH_OVER';

export interface RoundResult {
  winner: number;
  /** What each seat had left, in points (the winner's is 0). */
  left: number[];
  points: number;
}

export interface OsmiceState {
  seats: number;
  config: OsmiceConfig;
  rng: Rng;
  phase: OsmicePhase;
  dealer: number;
  roundNumber: number;
  /** Hidden: each seat sees only its own. */
  hands: OCard[][];
  /** Hidden from everyone. */
  drawPile: OCard[];
  /** The last card is the top. */
  discard: OCard[];
  colour: Colour;
  direction: 1 | -1;
  turn: number;
  /** Cards the player on turn must take (only ever non-zero with `stackDraws`). */
  pendingDraw: number;
  pendingKind: 'draw2' | 'wild4' | null;
  /** The card this seat just drew and may still play; it is their turn until they play it or pass. */
  drawn: OCard | null;
  scores: number[];
  /**
   * Per seat, the colours they have drawn on this round: public — everyone saw
   * them draw rather than play — and the best read a player has of a hand.
   */
  drewOn: Colour[][];
  lastRound: RoundResult | null;
  /** What the last move did, for the event stream (see MoveNote). Never sent to a client as is. */
  note?: MoveNote;
}

export type OsmiceAction =
  | { type: 'PLAY'; seat: number; cardId: string; colour?: Colour }
  | { type: 'DRAW'; seat: number }
  | { type: 'PASS'; seat: number };

export interface CreateOsmiceOptions {
  seats: number;
  seed: number;
  rng?: Rng;
  config?: Partial<OsmiceConfig>;
  dealer?: number;
}

export function createMatch(o: CreateOsmiceOptions): OsmiceState {
  if (!Number.isInteger(o.seats) || o.seats < 2 || o.seats > 6) throw new Error(`osmice is played by 2 to 6, not ${o.seats}`);
  const config = { ...DEFAULT_OSMICE_CONFIG, ...o.config };
  return {
    seats: o.seats,
    config,
    rng: o.rng ?? makeRng(o.seed),
    phase: 'IDLE',
    // The first startRound moves the deal on by one, so the first dealer is `dealer`.
    dealer: ((o.dealer ?? 0) - 1 + o.seats) % o.seats,
    roundNumber: 0,
    hands: Array.from({ length: o.seats }, () => []),
    drawPile: [],
    discard: [],
    colour: 'red',
    direction: 1,
    turn: 0,
    pendingDraw: 0,
    pendingKind: null,
    drawn: null,
    scores: Array<number>(o.seats).fill(0),
    drewOn: Array.from({ length: o.seats }, () => []),
    lastRound: null,
  };
}

const clone = (s: OsmiceState): OsmiceState => ({
  ...s,
  hands: s.hands.map((h) => h.slice()),
  drawPile: s.drawPile.slice(),
  discard: s.discard.slice(),
  scores: s.scores.slice(),
  drewOn: s.drewOn.map((d) => d.slice()),
});

export const nextSeat = (s: OsmiceState, from: number, steps = 1): number =>
  (((from + s.direction * steps) % s.seats) + s.seats) % s.seats;

export const top = (s: OsmiceState): OCard | null => s.discard[s.discard.length - 1] ?? null;

/** Deal a fresh round: a new shuffled deck, the deal moves on, the first card turned up is a number. */
export function startRound(prev: OsmiceState): OsmiceState {
  if (prev.phase !== 'IDLE' && prev.phase !== 'ROUND_OVER') throw new Error(`cannot deal from phase ${prev.phase}`);
  const s = clone(prev);
  s.roundNumber += 1;
  s.dealer = (s.dealer + 1) % s.seats;
  s.direction = 1;
  s.pendingDraw = 0;
  s.pendingKind = null;
  s.drawn = null;
  s.drewOn = Array.from({ length: s.seats }, () => []);
  s.note = undefined;
  const deck = shuffle(makeDeck(), s.rng);
  s.hands = Array.from({ length: s.seats }, () => []);
  for (let i = 0; i < s.config.handSize; i++) {
    for (let p = 0; p < s.seats; p++) s.hands[(s.dealer + 1 + p) % s.seats]!.push(deck.pop()!);
  }
  // Turn up the first card; an action or a wild goes to the bottom and the
  // next is turned, so the round always opens on a plain number.
  let first = deck.pop()!;
  while (!isNumber(first)) {
    deck.unshift(first);
    first = deck.pop()!;
  }
  s.discard = [first];
  s.drawPile = deck;
  s.colour = first.colour!;
  s.turn = (s.dealer + 1) % s.seats;
  s.phase = 'PLAY';
  return s;
}

/** Can this card go on the pile right now (ignoring whose turn it is)? */
export function canPlay(s: OsmiceState, card: OCard, hand: OCard[]): boolean {
  const t = top(s);
  if (s.pendingDraw > 0) {
    // Only the same kind passes a stacked draw on.
    return card.value === s.pendingKind;
  }
  if (card.value === 'wild') return true;
  if (card.value === 'wild4') {
    return !s.config.wild4OnlyWithoutColour || !hand.some((c) => c.id !== card.id && c.colour === s.colour);
  }
  return card.colour === s.colour || (t !== null && card.value === t.value);
}

export function currentActor(s: OsmiceState): number | null {
  return s.phase === 'PLAY' ? s.turn : null;
}

const playsOf = (seat: number, card: OCard): OsmiceAction[] =>
  isWild(card)
    ? (['red', 'gold', 'green', 'blue'] as const).map((colour) => ({ type: 'PLAY' as const, seat, cardId: card.id, colour }))
    : [{ type: 'PLAY', seat, cardId: card.id }];

export function legalActions(s: OsmiceState, seat: number): OsmiceAction[] {
  if (s.phase !== 'PLAY' || s.turn !== seat) return [];
  const hand = s.hands[seat]!;
  if (s.drawn) {
    // Just drew a playable card: play that one, or keep it and pass.
    return [...playsOf(seat, s.drawn), { type: 'PASS', seat }];
  }
  const out: OsmiceAction[] = [];
  for (const card of hand) if (canPlay(s, card, hand)) out.push(...playsOf(seat, card));
  // Drawing is always allowed (it is how you take a stacked pile, too) —
  // unless there is nothing left anywhere to draw, and then you pass.
  if (s.drawPile.length + s.discard.length - 1 > 0) out.push({ type: 'DRAW', seat });
  else if (out.length === 0) out.push({ type: 'PASS', seat });
  return out;
}

/** Take `n` cards for `seat`, reshuffling the pile under the top card when the deck runs out. */
function draw(s: OsmiceState, seat: number, n: number): { got: OCard[]; reshuffled: number } {
  const got: OCard[] = [];
  let reshuffled = 0;
  for (let i = 0; i < n; i++) {
    if (s.drawPile.length === 0) {
      const keep = s.discard.pop()!;
      if (s.discard.length === 0) {
        s.discard.push(keep);
        break;
      }
      reshuffled += s.discard.length;
      s.drawPile = shuffle(s.discard, s.rng);
      s.discard = [keep];
    }
    got.push(s.drawPile.pop()!);
  }
  s.hands[seat]!.push(...got);
  return { got, reshuffled };
}

/** What `apply` did, for the event stream: the engine's own record of a move. */
export interface MoveNote {
  kind: 'played' | 'drew' | 'passed';
  card?: OCard;
  drewCount?: number;
  /** The drawn card is playable and the drawer may play it. */
  canPlayDrawn?: boolean;
  skipped?: number;
  reversed?: boolean;
  penalty?: { seat: number; count: number };
  reshuffled?: number;
}

export function applyAction(prev: OsmiceState, a: OsmiceAction): OsmiceState {
  if (prev.phase !== 'PLAY') throw new Error(`no move in phase ${prev.phase}`);
  if (a.seat !== prev.turn) throw new Error(`it is seat ${prev.turn}'s turn, not ${a.seat}'s`);
  // Every move must be one of the legal ones, word for word: the checks below
  // then only say WHY, and no corner of the rules can be missed.
  const legal = legalActions(prev, a.seat);
  const same = (x: OsmiceAction) =>
    x.type === a.type && (x.type !== 'PLAY' || (a.type === 'PLAY' && x.cardId === a.cardId && x.colour === a.colour));
  const s: OsmiceState = clone(prev);
  if (!legal.some(same)) {
    explainIllegal(prev, a);
    throw new Error(`${a.type} is not a legal move now`);
  }
  const hand = s.hands[a.seat]!;
  const n = s.seats;

  if (a.type === 'PASS') {
    s.drawn = null;
    s.turn = nextSeat(s, a.seat);
    s.note = { kind: 'passed' };
    return s;
  }

  if (a.type === 'DRAW') {
    if (s.pendingDraw > 0) {
      // Take the whole stacked pile, and the turn moves on.
      const { got, reshuffled } = draw(s, a.seat, s.pendingDraw);
      s.pendingDraw = 0;
      s.pendingKind = null;
      s.turn = nextSeat(s, a.seat);
      s.note = { kind: 'drew', drewCount: got.length, reshuffled };
      return s;
    }
    const colourBefore = s.colour;
    const { got, reshuffled } = draw(s, a.seat, 1);
    if (!s.drewOn[a.seat]!.includes(colourBefore)) s.drewOn[a.seat]!.push(colourBefore);
    const card = got[0];
    if (card && canPlay(s, card, s.hands[a.seat]!)) {
      s.drawn = card;
      s.note = { kind: 'drew', drewCount: 1, canPlayDrawn: true, reshuffled };
    } else {
      s.turn = nextSeat(s, a.seat);
      s.note = { kind: 'drew', drewCount: got.length, reshuffled };
    }
    return s;
  }

  // PLAY
  const idx = hand.findIndex((c) => c.id === a.cardId);
  const card = hand[idx]!;
  hand.splice(idx, 1);
  s.discard.push(card);
  s.colour = isWild(card) ? a.colour! : card.colour!;
  s.drawn = null;
  const note: MoveNote = { kind: 'played', card };

  let next = nextSeat(s, a.seat);
  if (card.value === 'skip') {
    note.skipped = next;
    next = nextSeat(s, next);
  } else if (card.value === 'reverse') {
    s.direction = s.direction === 1 ? -1 : 1;
    note.reversed = true;
    if (n === 2) {
      // Between two, turning round is the same as skipping the other.
      note.skipped = nextSeat(s, a.seat);
      next = a.seat;
    } else {
      next = nextSeat(s, a.seat);
    }
  } else if (card.value === 'draw2' || card.value === 'wild4') {
    const count = card.value === 'draw2' ? 2 : 4;
    if (s.config.stackDraws) {
      s.pendingDraw += count;
      s.pendingKind = card.value;
    } else {
      const { got, reshuffled } = draw(s, next, count);
      note.penalty = { seat: next, count: got.length };
      if (reshuffled) note.reshuffled = reshuffled;
      note.skipped = next;
      next = nextSeat(s, next);
    }
  }
  s.turn = next;

  if (hand.length === 0) {
    // Going out ends the round, whatever the last card was. A stacked draw
    // still pending is simply taken by nobody.
    s.pendingDraw = 0;
    s.pendingKind = null;
    const left = s.hands.map((h) => h.reduce((sum, c) => sum + cardPoints(c), 0));
    const points = left.reduce((x, y) => x + y, 0);
    s.scores[a.seat] = s.scores[a.seat]! + points;
    s.lastRound = { winner: a.seat, left, points };
    s.phase = s.scores[a.seat]! >= s.config.matchTarget ? 'MATCH_OVER' : 'ROUND_OVER';
  }
  s.note = note;
  return s;
}

/** Throws the reason a move is not legal, when there is a more useful one than "not legal". */
function explainIllegal(s: OsmiceState, a: OsmiceAction): void {
  if (a.type === 'PASS') throw new Error('you may pass only after drawing');
  if (a.type === 'DRAW' && s.drawn) throw new Error('you have already drawn; play that card or pass');
  if (a.type !== 'PLAY') return;
  const card = s.hands[a.seat]!.find((c) => c.id === a.cardId);
  if (!card) throw new Error(`seat ${a.seat} does not hold ${a.cardId}`);
  if (s.drawn && s.drawn.id !== card.id) throw new Error('after drawing, only the drawn card may be played');
  if (isWild(card) && !a.colour) throw new Error('a wild needs a colour');
  if (!isWild(card) && a.colour !== undefined) throw new Error('only a wild names a colour');
  throw new Error(`${card.id} cannot go on the pile now`);
}

export function matchWinner(s: OsmiceState): number | null {
  if (s.phase !== 'MATCH_OVER') return null;
  return s.lastRound?.winner ?? null;
}
