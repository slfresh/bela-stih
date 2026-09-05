import type {
  Action,
  Card,
  DealScoreResult,
  DeclarationSummary,
  EngineConfig,
  GameState,
  Phase,
  PublicView,
  Seat,
  Suit,
  TeamId,
} from '@belot/engine';
import {
  applyAction,
  createMatch,
  currentActor,
  legalActions,
  makeRng,
  matchWinner,
  pointValue,
  publicView,
  startDeal,
  teamOf,
  type Rng,
} from '@belot/engine';
import { decideAction, type BotLevel } from '@belot/bots';

/**
 * @belot/table — the seat-aware session layer.
 *
 * The engine is pure and turn-by-turn; a UI wants something that plays the bot
 * seats by itself, stops when it needs a person, and says what just happened so
 * the table can be animated. That is all this is.
 *
 * It is deliberately UI-free, so the same object backs the offline Expo client
 * AND the server's disconnect-fill: a dropped player simply becomes a bot seat.
 */

// ---------------------------------------------------------------------------
// Events — the animation script
// ---------------------------------------------------------------------------

export type TableEvent =
  | { kind: 'dealStarted'; dealNumber: number; dealer: Seat }
  | { kind: 'bidPassed'; seat: Seat }
  | { kind: 'bidCalled'; seat: Seat; suit: Suit }
  | { kind: 'doubled'; seat: Seat; multiplier: 2 | 4 }
  | { kind: 'doublePassed'; seat: Seat }
  /** The last two cards are out; zvanja are now fixed and play begins. */
  | { kind: 'handsCompleted'; trumpSuit: Suit; callerSeat: Seat; multiplier: 1 | 2 | 4 }
  | { kind: 'declared'; seat: Seat; declarations: DeclarationSummary[] }
  | { kind: 'declarationSkipped'; seat: Seat }
  | { kind: 'belaCalled'; seat: Seat }
  | { kind: 'cardPlayed'; seat: Seat; card: Card }
  | { kind: 'trickWon'; seat: Seat; trickNumber: number; points: number; isLastTrick: boolean }
  | { kind: 'dealScored'; result: DealScoreResult; matchScores: [number, number] }
  | { kind: 'matchOver'; winner: TeamId; matchScores: [number, number] }
  /** A fresh match at the same table, same seats. */
  | { kind: 'matchStarted'; matchNumber: number };

export interface TableOptions {
  /** Seats a person controls. Empty means every seat is a bot (demo / auto-play). */
  humanSeats?: Seat[];
  botLevel?: BotLevel;
  config?: Partial<EngineConfig>;
  seed?: number;
  dealer?: Seat;
}

export class Table {
  private s: GameState;
  private readonly rng: Rng;
  private queued: TableEvent[] = [];

  private readonly humans: Set<Seat>;
  private matchNumber = 0;
  private moves = 0;
  readonly botLevel: BotLevel;

  constructor(opts: TableOptions = {}) {
    const seed = opts.seed ?? (Date.now() & 0x7fffffff);
    this.humans = new Set(opts.humanSeats ?? []);
    this.botLevel = opts.botLevel ?? 'medium';
    this.rng = makeRng(seed ^ 0x9e3779b9);

    this.s = createMatch({ seed, dealer: opts.dealer, config: opts.config });
    this.s = startDeal(this.s);
    this.queued.push({ kind: 'dealStarted', dealNumber: this.s.dealNumber, dealer: this.s.dealer });
    this.runBots();
  }

  // --- seats ---------------------------------------------------------------

  /** Seats currently played by a person; everything else is a bot. */
  get humanSeats(): ReadonlySet<Seat> {
    return this.humans;
  }

  /**
   * Hand a seat to a bot, or give it back to a person.
   *
   * This is how a disconnect is survived online: the seat becomes a bot, play
   * carries on, and the returning player takes it back mid-deal. Handing a seat
   * to a bot immediately runs it, in case the table was waiting on that player.
   */
  setSeatHuman(seat: Seat, human: boolean): void {
    if (human) this.humans.add(seat);
    else this.humans.delete(seat);
    if (!human) this.runBots();
  }

  // --- reading -------------------------------------------------------------

  get state(): Readonly<GameState> {
    return this.s;
  }

  /**
   * How many actions have been applied to this table, ever.
   *
   * Paired with `actor()` this identifies the DECISION in front of a seat, not
   * merely the seat — which is what a turn clock has to be keyed on. Two
   * consecutive decisions by the same player (declare, then lead) are different
   * decisions and each deserves its own full clock.
   */
  get moveCount(): number {
    return this.moves;
  }

  get phase(): Phase {
    return this.s.phase;
  }

  get matchScores(): readonly [number, number] {
    return this.s.matchScores;
  }

  /** The hidden-hand-safe view for one seat. This is what crosses the wire. */
  view(seat: Seat): PublicView {
    return publicView(this.s, seat);
  }

  actor(): Seat | null {
    return currentActor(this.s);
  }

  isHumanTurn(): boolean {
    const seat = this.actor();
    return seat !== null && this.humans.has(seat);
  }

  /** Legal actions for whoever is on turn (empty when the deal is between hands). */
  legal(): Action[] {
    return legalActions(this.s);
  }

  /** Take the events since the last drain. The UI animates them, then renders state. */
  drainEvents(): TableEvent[] {
    const out = this.queued;
    this.queued = [];
    return out;
  }

  // --- driving -------------------------------------------------------------

  /** Submit a human action, then let the bots run up to the next human decision. */
  submit(action: Action): void {
    const seat = this.actor();
    if (seat === null) throw new Error(`no action is expected in phase ${this.s.phase}`);
    if (!this.humans.has(seat)) throw new Error(`seat ${seat} is played by a bot`);
    if (action.seat !== seat) throw new Error(`it is seat ${seat}'s turn, not ${action.seat}'s`);

    this.applyAndRecord(action);
    this.runBots();
  }

  /**
   * Start a fresh match at the same table: same seats, same bot level, same
   * engine config, and the same bot RNG carried on so the bots do not replay
   * their last match. Scores and the deal counter reset; the dealer rotation
   * continues round the table rather than snapping back.
   *
   * Legal only once a match is over — a live match is never silently discarded.
   */
  newMatch(opts: { seed?: number; dealer?: Seat } = {}): void {
    if (this.s.phase !== 'MATCH_OVER') {
      throw new Error(`cannot start a new match from phase ${this.s.phase}`);
    }
    // Anything still undrained belongs to the finished match; it must not be
    // replayed into the new one.
    this.queued = [];
    this.matchNumber += 1;
    this.s = createMatch({
      seed: opts.seed ?? (Date.now() & 0x7fffffff),
      dealer: opts.dealer ?? this.s.dealer,
      config: this.s.config,
    });
    this.s = startDeal(this.s);
    this.queued.push({ kind: 'matchStarted', matchNumber: this.matchNumber });
    this.queued.push({ kind: 'dealStarted', dealNumber: this.s.dealNumber, dealer: this.s.dealer });
    this.runBots();
  }

  /** Deal again after a scored hand. */
  startNextDeal(): void {
    if (this.s.phase !== 'DEAL_OVER') {
      throw new Error(`cannot deal from phase ${this.s.phase}`);
    }
    this.s = startDeal(this.s);
    this.queued.push({ kind: 'dealStarted', dealNumber: this.s.dealNumber, dealer: this.s.dealer });
    this.runBots();
  }

  /** Advance while it is a bot's turn. Stops at a human decision or a scored deal. */
  runBots(): void {
    let guard = 0;
    while (true) {
      if (guard++ > 4096) throw new Error('bot loop failed to make progress');
      const seat = this.actor();
      if (seat === null || this.humans.has(seat)) return;
      this.applyAndRecord(decideAction(this.view(seat), this.rng, this.botLevel));
    }
  }

  /**
   * Play exactly ONE bot action on `seat`'s behalf, then let the table settle as
   * usual, leaving the seat's human flag untouched.
   *
   * `setSeatHuman(seat, false)` is NOT a one-move primitive: it runs the bots
   * until the actor is null or a HUMAN seat, so on a table whose only human is
   * the seat being covered there is nothing left to stop on and it plays out the
   * entire deal. That is right for a disconnect and wrong for a turn timeout.
   */
  botMoveFor(seat: Seat): void {
    if (this.actor() !== seat) return;
    this.applyAndRecord(decideAction(this.view(seat), this.rng, this.botLevel));
    // Whoever is next may also be a bot; advancing to the next human decision
    // is the same thing a normal submit() does.
    this.runBots();
  }

  /** Play an all-bot table through to a winner. Used by the demo and the tests. */
  playWholeMatch(maxDeals = 500): void {
    if (this.humans.size > 0) throw new Error('playWholeMatch expects an all-bot table');
    let dealt = 0;
    while (this.s.phase !== 'MATCH_OVER') {
      if (dealt++ > maxDeals) throw new Error('match failed to finish');
      this.runBots();
      if (this.s.phase === 'DEAL_OVER') this.startNextDeal();
    }
  }

  winner(): TeamId | null {
    return matchWinner(this.s);
  }

  // --- event derivation ----------------------------------------------------

  private applyAndRecord(action: Action): void {
    const before = this.s;
    const after = applyAction(before, action);
    // Belt and braces behind applyAction's own `default:`. Assigning first and
    // validating later is what turned one malformed socket message into a Table
    // whose state was permanently `undefined`.
    if (!after) throw new Error('engine returned no state');
    this.s = after;
    this.moves += 1;
    const push = (e: TableEvent) => this.queued.push(e);

    switch (action.type) {
      case 'BID_PASS':
        push({ kind: 'bidPassed', seat: action.seat });
        break;
      case 'BID_CALL':
        push({ kind: 'bidCalled', seat: action.seat, suit: action.suit });
        break;
      case 'DOUBLE_KONTRA':
      case 'DOUBLE_REKONTRA':
        push({ kind: 'doubled', seat: action.seat, multiplier: after.multiplier as 2 | 4 });
        break;
      case 'DOUBLE_PASS':
        push({ kind: 'doublePassed', seat: action.seat });
        break;
      case 'DECLARE_ANNOUNCE':
        push({
          kind: 'declared',
          seat: action.seat,
          declarations: after.announcedDeclarations[action.seat]!.map((d) => ({
            kind: d.kind,
            value: d.value,
            length: d.length,
            topRank: d.topRank,
            seat: d.seat,
          })),
        });
        break;
      case 'DECLARE_SKIP':
        push({ kind: 'declarationSkipped', seat: action.seat });
        break;
      case 'PLAY_CARD':
        // The call lands before the card, exactly as it is said at the table.
        if (before.belaAnnouncedSeat === null && after.belaAnnouncedSeat !== null) {
          push({ kind: 'belaCalled', seat: action.seat });
        }
        push({ kind: 'cardPlayed', seat: action.seat, card: action.card });
        break;
    }

    // A void deal (everyone passed) restarts the bidding on a fresh hand.
    if (before.phase === 'BID' && after.phase === 'BID' && after.passCount === 0) {
      push({ kind: 'dealStarted', dealNumber: after.dealNumber, dealer: after.dealer });
    }

    // The contract is settled, the last two cards are out, play begins. This
    // fires from BID directly when the table plays no kontra, and from DOUBLE
    // when it does.
    if (before.phase !== 'PLAY' && after.phase === 'PLAY') {
      push({
        kind: 'handsCompleted',
        trumpSuit: after.context.trumpSuit!,
        callerSeat: after.callerSeat!,
        multiplier: after.multiplier,
      });
    }

    if (after.completedTricks.length > before.completedTricks.length) {
      const trick = after.completedTricks[after.completedTricks.length - 1]!;
      const trickNumber = after.completedTricks.length;
      push({
        kind: 'trickWon',
        seat: trick.winnerSeat,
        trickNumber,
        points: trick.cards.reduce((sum, c) => sum + pointValue(c, after.context), 0),
        isLastTrick: trickNumber === 8,
      });
    }

    if (before.phase === 'PLAY' && after.phase !== 'PLAY' && after.lastDealResult) {
      push({
        kind: 'dealScored',
        result: after.lastDealResult,
        matchScores: [after.matchScores[0], after.matchScores[1]],
      });
    }

    if (after.phase === 'MATCH_OVER') {
      push({
        kind: 'matchOver',
        winner: matchWinner(after)!,
        matchScores: [after.matchScores[0], after.matchScores[1]],
      });
    }
  }
}

export { teamOf, type BotLevel };
