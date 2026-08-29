import type {
  Action,
  Card,
  Declaration,
  DeclarationSummary,
  EngineConfig,
  Phase,
  PlayContext,
  PublicView,
  Seat,
  Suit,
  TeamId,
  TrickPlay,
} from '@belot/shared-types';
import { DEFAULT_CONFIG, SEATS, SUITS } from '@belot/shared-types';
import {
  cardEquals,
  cardId,
  hasCard,
  makeDeck,
  makeRng,
  removeCard,
  shuffle,
  type Rng,
} from './cards';
import { legalPlays } from './legality';
import { detectDeclarations, resolveDeclarations } from './declarations';
import { scoreDeal, type DealScoreResult, type DealTrick } from './scoring';
import { trickWinnerIndex } from './compare';

/** Partners sit across: team 0 = seats {0,2}, team 1 = seats {1,3}. */
export function teamOf(seat: Seat): TeamId {
  return (seat % 2) as TeamId;
}

/**
 * The full authoritative game state. Held by the Colyseus room on the server and
 * by the offline app on device. `rng` is the only non-serializable field — the
 * server keeps it private and never ships it to clients (see `publicView`).
 */
export interface GameState {
  config: EngineConfig;
  rng: Rng;

  phase: Phase;
  dealer: Seat;
  dealNumber: number;
  matchScores: [number, number];

  /** Hidden information. Never send another seat's hand over the wire. */
  hands: Card[][];
  /** Undealt cards held between the 6-card deal and COMPLETE_DEAL. */
  stock: Card[];
  context: PlayContext;

  // bidding
  bidTurn: Seat;
  passCount: number;

  // doubling
  callerSeat: Seat | null;
  multiplier: 1 | 2 | 4;
  doubleStage: 'KONTRA' | 'REKONTRA' | null;
  doubleTurn: Seat | null;
  /** Seats still owed a kontra/rekontra opportunity at the current stage. */
  doubleQueue: Seat[];

  // play
  /** What each seat COULD announce. Hidden information — never send this to a client. */
  availableDeclarations: Declaration[][];
  /** What each seat actually announced. Only these enter the contest and score. */
  announcedDeclarations: Declaration[][];
  /** Per seat: has its trick-1 announce-or-skip decision been settled? */
  declared: boolean[];
  /** Who was DEALT the trump K+Q. Hidden information — never send this to a client. */
  belaHolderSeat: Seat | null;
  /** Who actually called bela. Only this scores; public once called. */
  belaAnnouncedSeat: Seat | null;
  trickLeader: Seat | null;
  turn: Seat | null;
  currentTrick: TrickPlay[];
  completedTricks: DealTrick[];

  lastDealResult: DealScoreResult | null;
}

export interface CreateMatchOptions {
  config?: Partial<EngineConfig>;
  /** Seed the deterministic RNG. Pass fresh entropy per match (server: crypto; client: random). */
  seed?: number;
  dealer?: Seat;
}

export function createMatch(opts: CreateMatchOptions = {}): GameState {
  const config: EngineConfig = { ...DEFAULT_CONFIG, ...opts.config };
  const seed = opts.seed ?? 0x1234abcd;
  return {
    config,
    rng: makeRng(seed),
    phase: 'IDLE',
    dealer: opts.dealer ?? 0,
    dealNumber: 0,
    matchScores: [0, 0],
    hands: [[], [], [], []],
    stock: [],
    context: { contractType: 'SUIT', trumpSuit: null },
    bidTurn: 0,
    passCount: 0,
    callerSeat: null,
    multiplier: 1,
    doubleStage: null,
    doubleTurn: null,
    doubleQueue: [],
    availableDeclarations: [[], [], [], []],
    announcedDeclarations: [[], [], [], []],
    declared: [false, false, false, false],
    belaHolderSeat: null,
    belaAnnouncedSeat: null,
    trickLeader: null,
    turn: null,
    currentTrick: [],
    completedTricks: [],
    lastDealResult: null,
  };
}

// Clone everything except the (stateful, non-cloneable) rng and the (immutable) config.
function cloneState(s: GameState): GameState {
  const { rng, config, ...rest } = s;
  const copy = structuredClone(rest) as Omit<GameState, 'rng' | 'config'>;
  return { ...copy, rng, config };
}

function expectPhase(s: GameState, p: Phase): void {
  if (s.phase !== p) throw new Error(`expected phase ${p}, got ${s.phase}`);
}

function expectSeat(actual: Seat, expected: Seat | null): void {
  if (expected === null || actual !== expected) {
    throw new Error(`seat ${actual} acted out of turn (expected ${String(expected)})`);
  }
}

/** Deal 6 cards each and open the bidding. Call from IDLE or DEAL_OVER. */
export function startDeal(prev: GameState): GameState {
  if (prev.phase !== 'IDLE' && prev.phase !== 'DEAL_OVER') {
    throw new Error(`cannot startDeal from phase ${prev.phase}`);
  }
  const s = cloneState(prev);
  const deck = shuffle(makeDeck(), s.rng);

  s.hands = [[], [], [], []];
  let idx = 0;
  for (let r = 0; r < 6; r++) {
    for (let off = 0; off < 4; off++) {
      const seat = ((s.dealer + 1 + off) % 4) as Seat;
      s.hands[seat]!.push(deck[idx++]!);
    }
  }
  s.stock = deck.slice(idx); // 8 cards for COMPLETE_DEAL

  s.context = { contractType: 'SUIT', trumpSuit: null };
  s.callerSeat = null;
  s.multiplier = 1;
  s.doubleStage = null;
  s.doubleTurn = null;
  s.doubleQueue = [];
  s.availableDeclarations = [[], [], [], []];
  s.announcedDeclarations = [[], [], [], []];
  s.declared = [false, false, false, false];
  s.belaHolderSeat = null;
  s.belaAnnouncedSeat = null;
  s.trickLeader = null;
  s.turn = null;
  s.currentTrick = [];
  s.completedTricks = [];
  s.lastDealResult = null;

  s.phase = 'BID';
  s.bidTurn = ((s.dealer + 1) % 4) as Seat;
  s.passCount = 0;
  return s;
}

export function currentActor(s: GameState): Seat | null {
  switch (s.phase) {
    case 'BID':
      return s.bidTurn;
    case 'DOUBLE':
      return s.doubleTurn;
    case 'PLAY':
      return s.turn;
    default:
      return null;
  }
}

export function legalActions(s: GameState): Action[] {
  switch (s.phase) {
    case 'BID': {
      const seat = s.bidTurn;
      const acts: Action[] = [];
      const dealerForced = s.config.dealerMustCall && seat === s.dealer && s.passCount === 3;
      if (!dealerForced) acts.push({ type: 'BID_PASS', seat });
      for (const suit of SUITS) acts.push({ type: 'BID_CALL', seat, suit });
      return acts;
    }
    case 'DOUBLE': {
      const seat = s.doubleTurn!;
      if (s.doubleStage === 'KONTRA') {
        return [
          { type: 'DOUBLE_KONTRA', seat },
          { type: 'DOUBLE_PASS', seat },
        ];
      }
      if (s.doubleStage === 'REKONTRA') {
        return [
          { type: 'DOUBLE_REKONTRA', seat },
          { type: 'DOUBLE_PASS', seat },
        ];
      }
      return [];
    }
    case 'PLAY': {
      const seat = s.turn!;
      // Announce-or-forfeit: a seat holding zvanja settles them before it plays.
      if (owesDeclaration(s, seat)) {
        return [
          { type: 'DECLARE_ANNOUNCE', seat },
          { type: 'DECLARE_SKIP', seat },
        ];
      }
      return legalPlays({
        hand: s.hands[seat]!,
        trick: s.currentTrick,
        mySeat: seat,
        ctx: s.context,
        forcedOvertrumpOverPartner: s.config.forcedOvertrumpOverPartner,
      }).flatMap((card): Action[] => {
        const play: Action = { type: 'PLAY_CARD', seat, card };
        // Where bela is available, playing the card silently and calling it are
        // two genuinely different moves, so both are offered.
        return canAnnounceBelaWith(s, seat, card)
          ? [play, { type: 'PLAY_CARD', seat, card, announceBela: true }]
          : [play];
      });
    }
    default:
      return [];
  }
}

export function applyAction(prev: GameState, action: Action): GameState {
  const s = cloneState(prev);
  switch (action.type) {
    case 'BID_PASS':
      return applyBidPass(s, action.seat);
    case 'BID_CALL':
      return applyBidCall(s, action.seat, action.suit);
    case 'DOUBLE_KONTRA':
    case 'DOUBLE_REKONTRA':
    case 'DOUBLE_PASS':
      return applyDouble(s, action.type, action.seat);
    case 'DECLARE_ANNOUNCE':
    case 'DECLARE_SKIP':
      return applyDeclare(s, action.type, action.seat);
    case 'PLAY_CARD':
      return applyPlay(s, action.seat, action.card, action.announceBela === true);
  }
}

function applyBidPass(s: GameState, seat: Seat): GameState {
  expectPhase(s, 'BID');
  expectSeat(seat, s.bidTurn);
  const dealerForced = s.config.dealerMustCall && seat === s.dealer && s.passCount === 3;
  if (dealerForced) throw new Error('dealer is forced to call (muss)');
  s.passCount += 1;
  s.bidTurn = ((seat + 1) % 4) as Seat;
  if (s.passCount === 4) {
    // Only reachable when dealerMustCall is off. Nobody wants it: the deal is
    // void and passes on, so the dealer rotates just as at a real table.
    s.phase = 'DEAL_OVER';
    s.dealer = ((s.dealer + 1) % 4) as Seat;
    return startDeal(s);
  }
  return s;
}

function applyBidCall(s: GameState, seat: Seat, suit: Suit): GameState {
  expectPhase(s, 'BID');
  expectSeat(seat, s.bidTurn);
  s.context = { contractType: 'SUIT', trumpSuit: suit };
  s.callerSeat = seat;
  s.multiplier = 1;

  // Tables that do not play kontra go straight from the call to the cards.
  if (!s.config.allowKontra) {
    s.doubleStage = null;
    s.doubleTurn = null;
    s.doubleQueue = [];
    return completeDeal(s);
  }

  s.phase = 'DOUBLE';
  // Both defenders get a chance to kontra, in seat order after the caller.
  s.doubleStage = 'KONTRA';
  s.doubleQueue = [((seat + 1) % 4) as Seat, ((seat + 3) % 4) as Seat];
  return advanceDoubleQueue(s);
}

/** Pop the next seat owed a doubling decision; if none remain, deal the last 2 cards. */
function advanceDoubleQueue(s: GameState): GameState {
  const next = s.doubleQueue.shift();
  if (next === undefined) {
    s.doubleTurn = null;
    s.doubleStage = null;
    return completeDeal(s);
  }
  s.doubleTurn = next;
  return s;
}

function applyDouble(
  s: GameState,
  type: 'DOUBLE_KONTRA' | 'DOUBLE_REKONTRA' | 'DOUBLE_PASS',
  seat: Seat,
): GameState {
  expectPhase(s, 'DOUBLE');
  expectSeat(seat, s.doubleTurn);

  if (type === 'DOUBLE_PASS') return advanceDoubleQueue(s);

  if (type === 'DOUBLE_KONTRA') {
    if (s.doubleStage !== 'KONTRA') throw new Error('kontra not available');
    s.multiplier = 2;
    // The calling team may now answer with rekontra.
    s.doubleStage = 'REKONTRA';
    const caller = s.callerSeat!;
    s.doubleQueue = [caller, ((caller + 2) % 4) as Seat];
    return advanceDoubleQueue(s);
  }

  // DOUBLE_REKONTRA
  if (s.doubleStage !== 'REKONTRA') throw new Error('rekontra not available');
  s.multiplier = 4;
  s.doubleQueue = [];
  return advanceDoubleQueue(s);
}

function completeDeal(s: GameState): GameState {
  let idx = 0;
  for (let r = 0; r < 2; r++) {
    for (let off = 0; off < 4; off++) {
      const seat = ((s.dealer + 1 + off) % 4) as Seat;
      s.hands[seat]!.push(s.stock[idx++]!);
    }
  }
  s.stock = [];

  // What each seat holds is fixed by the completed 8-card hands; what each seat
  // SCORES depends on whether it speaks up during trick 1.
  s.availableDeclarations = SEATS.map((seat) => detectDeclarations(s.hands[seat]!, seat));
  if (s.config.declarationMode === 'auto') {
    s.announcedDeclarations = s.availableDeclarations.map((d) => d.slice());
    s.declared = [true, true, true, true];
  } else {
    s.announcedDeclarations = [[], [], [], []];
    // A seat with nothing to declare has no decision to make, so it is never
    // prompted. That leaks nothing: legalActions are private to the seat on turn.
    s.declared = SEATS.map((seat) => s.availableDeclarations[seat]!.length === 0);
  }

  s.belaHolderSeat = detectBelaSeat(s.hands, s.context);
  // Under 'auto' the pair pays out on sight; under 'announce' it pays only if called.
  s.belaAnnouncedSeat = s.config.belaMode === 'auto' ? s.belaHolderSeat : null;
  s.phase = 'PLAY';
  s.trickLeader = ((s.dealer + 1) % 4) as Seat;
  s.turn = s.trickLeader;
  s.currentTrick = [];
  s.completedTricks = [];
  return s;
}

function detectBelaSeat(hands: Card[][], ctx: PlayContext): Seat | null {
  if (ctx.contractType !== 'SUIT' || ctx.trumpSuit === null) return null;
  for (const seat of SEATS) {
    const h = hands[seat]!;
    const hasK = h.some((c) => c.suit === ctx.trumpSuit && c.rank === 'K');
    const hasQ = h.some((c) => c.suit === ctx.trumpSuit && c.rank === 'Q');
    if (hasK && hasQ) return seat;
  }
  return null;
}

/**
 * Does this seat still owe an announce-or-skip call? Only during trick 1, only
 * under 'announce' mode, and only for a seat that actually holds something.
 */
function owesDeclaration(s: GameState, seat: Seat): boolean {
  return (
    s.phase === 'PLAY' &&
    s.config.declarationMode === 'announce' &&
    s.completedTricks.length === 0 &&
    !s.declared[seat]
  );
}

function applyDeclare(
  s: GameState,
  type: 'DECLARE_ANNOUNCE' | 'DECLARE_SKIP',
  seat: Seat,
): GameState {
  expectPhase(s, 'PLAY');
  expectSeat(seat, s.turn);
  if (!owesDeclaration(s, seat)) throw new Error('no declaration is owed');

  s.declared[seat] = true;
  if (type === 'DECLARE_ANNOUNCE') {
    // You announce exactly what you hold -- the engine never lets you overstate it.
    s.announcedDeclarations[seat] = s.availableDeclarations[seat]!.slice();
  }
  // The turn does not move: this seat still has a card to play.
  return s;
}

/**
 * May this seat call bela while playing this card? Requires the trump K or Q, and
 * that BOTH are still in hand — which is exactly what makes this the first of the
 * pair. After the first one leaves, this can never be true again.
 */
function canAnnounceBelaWith(s: GameState, seat: Seat, card: Card): boolean {
  if (s.config.belaMode !== 'announce') return false;
  if (s.belaAnnouncedSeat !== null) return false;
  const trump = s.context.trumpSuit;
  if (s.context.contractType !== 'SUIT' || trump === null) return false;
  if (card.suit !== trump || (card.rank !== 'K' && card.rank !== 'Q')) return false;
  const hand = s.hands[seat]!;
  return (
    hand.some((c) => c.suit === trump && c.rank === 'K') &&
    hand.some((c) => c.suit === trump && c.rank === 'Q')
  );
}

function applyPlay(s: GameState, seat: Seat, card: Card, announceBela: boolean): GameState {
  expectPhase(s, 'PLAY');
  expectSeat(seat, s.turn);
  if (owesDeclaration(s, seat)) {
    throw new Error('must announce or skip zvanja before playing in trick 1');
  }
  const hand = s.hands[seat]!;
  if (!hasCard(hand, card)) throw new Error(`card ${cardId(card)} not in hand`);
  const legal = legalPlays({
    hand,
    trick: s.currentTrick,
    mySeat: seat,
    ctx: s.context,
    forcedOvertrumpOverPartner: s.config.forcedOvertrumpOverPartner,
  });
  if (!legal.some((c) => cardEquals(c, card))) {
    throw new Error(`illegal play ${cardId(card)}`);
  }

  if (announceBela) {
    if (!canAnnounceBelaWith(s, seat, card)) {
      throw new Error(`cannot call bela on ${cardId(card)}`);
    }
    s.belaAnnouncedSeat = seat;
  }

  s.hands[seat] = removeCard(hand, card);
  s.currentTrick.push({ seat, card });

  if (s.currentTrick.length < 4) {
    s.turn = ((seat + 1) % 4) as Seat;
    return s;
  }

  const localWin = trickWinnerIndex(
    s.currentTrick.map((p) => p.card),
    s.context,
  );
  const winnerSeat = s.currentTrick[localWin]!.seat;
  s.completedTricks.push({ winnerSeat, cards: s.currentTrick.map((p) => p.card) });
  s.currentTrick = [];
  s.trickLeader = winnerSeat;
  s.turn = winnerSeat;

  if (s.completedTricks.length === 8) return scoreCurrentDeal(s);
  return s;
}

function scoreCurrentDeal(s: GameState): GameState {
  // Only what was actually announced enters the contest; silence forfeits.
  const resolution = resolveDeclarations(s.announcedDeclarations, teamOf, s.config);
  // Only a called bela scores; an uncalled pair is forfeited exactly like zvanja.
  const belaTeam = s.belaAnnouncedSeat === null ? null : teamOf(s.belaAnnouncedSeat);
  const result = scoreDeal({
    ctx: s.context,
    tricks: s.completedTricks,
    teamOf,
    callerTeam: teamOf(s.callerSeat!),
    multiplier: s.multiplier,
    declarations: resolution,
    belaTeam,
    config: s.config,
  });

  s.matchScores = [
    s.matchScores[0] + result.finalScore[0],
    s.matchScores[1] + result.finalScore[1],
  ];
  s.lastDealResult = result;
  s.dealNumber += 1;
  s.turn = null;
  s.dealer = ((s.dealer + 1) % 4) as Seat;

  // First team past the target wins. If both cross on the same deal the higher
  // total takes it; an exact tie is unresolved, so the match plays on.
  const target = s.config.matchTarget;
  const reached = s.matchScores[0] >= target || s.matchScores[1] >= target;
  const tied = s.matchScores[0] === s.matchScores[1];
  s.phase = reached && !tied ? 'MATCH_OVER' : 'DEAL_OVER';
  return s;
}

export function matchWinner(s: GameState): TeamId | null {
  if (s.phase !== 'MATCH_OVER') return null;
  return s.matchScores[0] > s.matchScores[1] ? 0 : 1;
}

/** Redacted, hidden-hand-safe view for a single seat (what crosses the wire). */
export function publicView(s: GameState, seat: Seat): PublicView {
  const toAct = currentActor(s);
  return {
    phase: s.phase,
    dealer: s.dealer,
    seat,
    hand: s.hands[seat]!.slice(),
    handCounts: [
      s.hands[0]!.length,
      s.hands[1]!.length,
      s.hands[2]!.length,
      s.hands[3]!.length,
    ],
    context: s.context,
    callerSeat: s.callerSeat,
    multiplier: s.multiplier,
    trickLeader: s.trickLeader,
    currentTrick: s.currentTrick.slice(),
    toAct,
    matchScores: [s.matchScores[0], s.matchScores[1]],
    // Public summaries only: what the table has HEARD, never the cards behind it.
    announcedDeclarations: s.announcedDeclarations.flat().map(summarize),
    // The seat's own zvanja; their cards are already in `hand`, so this leaks nothing.
    myDeclarations: s.availableDeclarations[seat]!.slice(),
    mustDeclare: toAct === seat && owesDeclaration(s, seat),
    canAnnounceBela:
      toAct === seat &&
      s.phase === 'PLAY' &&
      !owesDeclaration(s, seat) &&
      legalActions(s).some((a) => a.type === 'PLAY_CARD' && a.announceBela === true),
    belaAnnouncedBy: s.belaAnnouncedSeat,
    legalActions: toAct === seat ? legalActions(s) : [],
  };
}

/** Strip the cards off a declaration, leaving what the table is entitled to know. */
function summarize(d: Declaration): DeclarationSummary {
  return { kind: d.kind, value: d.value, length: d.length, topRank: d.topRank, seat: d.seat };
}
