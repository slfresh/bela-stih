import type { BotLevel } from './bots';
import type { ActionOf, AnyGame, ConfigOf, EventOf, StateOf, ViewOf } from './definition';
import { BOT_RNG_SALT, makeRng, type Rng } from './rng';

/**
 * The seat-aware session over any `GameDefinition` — what `Table` has been for
 * Bela, for every game.
 *
 * A game is pure and turn-by-turn; a UI wants something that plays the bot
 * seats by itself, stops when it needs a person, and says what just happened
 * so the table can be animated. It is UI-free on purpose: the same object
 * backs the offline client, the terminal client and the server's disconnect
 * fill, where a dropped player simply becomes a bot seat.
 */

export interface SessionOptions<C> {
  /** How many seats the table has (Bela: always 4). */
  seats: number;
  /**
   * The randomness behind the shuffle AND the bots, superseding `seed`. A
   * server passes a crypto-backed generator: a seeded table is reproducible,
   * and anything reproducible from 32 bits is recoverable by an opponent.
   */
  rng?: Rng;
  /** Seats a person controls. Empty means every seat is a bot (demo / auto-play). */
  humanSeats?: number[];
  botLevel?: BotLevel;
  config?: Partial<C>;
  seed?: number;
  dealer?: number;
  stacks?: number[];
}

/** The most default actions one timeout applies to one seat (see `turnContinues`). */
const MAX_TIMEOUT_STEPS = 3;

export class Session<D extends AnyGame> {
  private s: StateOf<D>;
  private readonly rng: Rng;
  private queued: EventOf<D>[] = [];
  private readonly humans: Set<number>;
  private matchNumber = 0;
  private moves = 0;
  /** Injected randomness, kept so a rematch is seeded the same way. */
  private readonly injected: Rng | null;
  readonly botLevel: BotLevel;
  readonly seats: number;

  constructor(
    readonly def: D,
    opts: SessionOptions<ConfigOf<D>>,
  ) {
    const seed = opts.seed ?? (Date.now() & 0x7fffffff);
    this.seats = opts.seats;
    this.humans = new Set(opts.humanSeats ?? []);
    this.botLevel = opts.botLevel ?? 'medium';
    this.injected = opts.rng ?? null;
    // Bot choices are as predictable as the deck when both come from one seed.
    this.rng = this.injected ?? makeRng(seed ^ BOT_RNG_SALT);

    const fresh = def.createMatch({
      seats: opts.seats,
      seed,
      rng: this.injected ?? undefined,
      dealer: opts.dealer,
      config: opts.config,
      stacks: opts.stacks,
    }) as StateOf<D>;
    this.s = def.startRound(fresh) as StateOf<D>;
    this.record(fresh, this.s, { kind: 'startRound' });
    this.runBots();
  }

  // --- seats ---------------------------------------------------------------

  /** Seats currently played by a person; everything else is a bot. */
  get humanSeats(): ReadonlySet<number> {
    return this.humans;
  }

  /**
   * Hand a seat to a bot, or give it back to a person. Handing a seat to a bot
   * immediately runs it, in case the table was waiting on that player.
   */
  setSeatHuman(seat: number, human: boolean): void {
    if (human) this.humans.add(seat);
    else this.humans.delete(seat);
    if (!human) this.runBots();
  }

  // --- reading -------------------------------------------------------------

  get state(): Readonly<StateOf<D>> {
    return this.s;
  }

  /**
   * How many actions have been applied to this session, ever. Paired with
   * `actors()` this identifies the DECISION in front of the table, which is
   * what a clock has to be keyed on: two consecutive decisions by one seat
   * are different decisions and each deserves its own full clock.
   */
  get moveCount(): number {
    return this.moves;
  }

  /** Seats owed a decision right now. */
  actors(): number[] {
    return this.def.actors(this.s);
  }

  /** The human seats among `actors()` — who the table is actually waiting on. */
  humanActors(): number[] {
    return this.actors().filter((seat) => this.humans.has(seat));
  }

  /**
   * Stable id of the decision in front of the table, or null when nobody acts:
   * the open window's own name while one is open (it outlives the moves made
   * in it), otherwise the seat on turn and the move count.
   */
  decisionId(): string | null {
    const actors = this.actors();
    if (actors.length === 0) return null;
    const window = this.def.windowKey?.(this.s);
    return window ? `window:${window}` : `${actors.join(',')}:${this.moves}`;
  }

  /** The hidden-hand-safe view for one seat. This is what crosses the wire. */
  view(seat: number): ViewOf<D> {
    return this.def.view(this.s, seat);
  }

  legal(seat: number): ActionOf<D>[] {
    return this.def.legalActions(this.s, seat);
  }

  roundOver(): boolean {
    return this.def.roundOver(this.s);
  }

  matchOver(): boolean {
    return this.def.matchOver(this.s);
  }

  winners(): number[] | null {
    return this.def.winners(this.s);
  }

  settlement(): number[] | null {
    return this.def.settlement(this.s);
  }

  /** Take the events since the last drain. The UI animates them, then renders state. */
  drainEvents(): EventOf<D>[] {
    const out = this.queued;
    this.queued = [];
    return out;
  }

  // --- driving -------------------------------------------------------------

  /** Submit a human action, then let the bots run up to the next human decision. */
  submit(action: ActionOf<D>): void {
    const actors = this.actors();
    if (actors.length === 0) throw new Error('no action is expected right now');
    if (!actors.includes(action.seat)) {
      throw new Error(`it is not seat ${action.seat}'s turn (waiting on ${actors.join(', ')})`);
    }
    if (!this.humans.has(action.seat)) throw new Error(`seat ${action.seat} is played by a bot`);

    this.applyAndRecord(action);
    this.runBots();
  }

  /**
   * Submit an untrusted action (off the wire) for a seat. False means it was
   * rejected, by the game's normaliser or by its rules; the state is untouched.
   */
  submitRaw(seat: number, raw: unknown): boolean {
    const action = this.def.normalize(this.s, seat, raw) as ActionOf<D> | null;
    if (!action || action.seat !== seat) return false;
    try {
      this.submit(action);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start a fresh match at the same table: same seats, same bot level, same
   * config, and the same bot RNG carried on so the bots do not replay their
   * last match. Legal only once a match is over.
   */
  newMatch(opts: { seed?: number; dealer?: number; stacks?: number[] } = {}): void {
    if (!this.matchOver()) throw new Error('cannot start a new match while one is in progress');
    // Anything still undrained belongs to the finished match.
    this.queued = [];
    this.matchNumber += 1;
    const before = this.s;
    const fresh = this.def.createMatch({
      seats: this.seats,
      seed: opts.seed ?? (Date.now() & 0x7fffffff),
      rng: this.injected ?? undefined,
      dealer: opts.dealer ?? this.dealerOf(before),
      config: this.configOf(before),
      stacks: opts.stacks,
    }) as StateOf<D>;
    this.s = this.def.startRound(fresh) as StateOf<D>;
    this.record(before, this.s, { kind: 'newMatch', matchNumber: this.matchNumber });
    this.runBots();
  }

  /** Deal again after a finished round. */
  startNextRound(): void {
    if (!this.roundOver()) throw new Error('cannot start a round while one is in progress');
    const before = this.s;
    this.s = this.def.startRound(before) as StateOf<D>;
    this.record(before, this.s, { kind: 'startRound' });
    this.runBots();
  }

  /** Advance while a bot is owed a decision. Stops when only people are waited on, or nobody is. */
  runBots(): void {
    let guard = 0;
    while (true) {
      if (guard++ > 4096) throw new Error('bot loop failed to make progress');
      const seat = this.actors().find((s) => !this.humans.has(s));
      if (seat === undefined) return;
      this.applyAndRecord(this.botDecision(seat));
    }
  }

  /**
   * Play exactly ONE bot action on `seat`'s behalf (a turn timeout), leaving
   * the seat's human flag untouched, then let the table settle as usual.
   */
  botMoveFor(seat: number): void {
    if (!this.actors().includes(seat)) return;
    this.applyAndRecord(this.botDecision(seat));
    this.runBots();
  }

  /**
   * The window closed: every human still owed a decision takes the game's
   * default one (fold or check, "no more bets", draw), and finishes the turn
   * with it when the game says the turn goes on. Then the bots settle.
   */
  closeWindow(): void {
    for (const seat of this.humanActors()) {
      // One timeout settles the seat's whole turn: a game whose turn has two
      // halves (Osmice: draw, then play the drawn card) says the turn goes on,
      // and the default applies again instead of a second full clock starting.
      // Bounded, so a game that answers yes for ever cannot hang the table.
      for (let step = 0; step < MAX_TIMEOUT_STEPS; step++) {
        if (!this.actors().includes(seat)) break;
        if (step > 0 && !this.def.turnContinues?.(this.s, seat)) break;
        const action = this.def.defaultAction(this.s, seat, this.rng, this.botLevel) as ActionOf<D>;
        this.applyAndRecord(action, { kind: 'closeWindow' });
      }
    }
    this.runBots();
  }

  /** Play an all-bot table through to a winner. Used by demos, harnesses and tests. */
  playWholeMatch(maxRounds = 500): void {
    if (this.humans.size > 0) throw new Error('playWholeMatch expects an all-bot table');
    let rounds = 0;
    while (!this.matchOver()) {
      if (rounds++ > maxRounds) throw new Error('match failed to finish');
      this.runBots();
      if (this.roundOver() && !this.matchOver()) this.startNextRound();
    }
  }

  // --- internals -----------------------------------------------------------

  private botDecision(seat: number): ActionOf<D> {
    const memory = this.def.bot.memory?.(this.s);
    return this.def.bot.decide(this.view(seat), this.rng, this.botLevel, memory) as ActionOf<D>;
  }

  private applyAndRecord(
    action: ActionOf<D>,
    cause: { kind: 'action'; action: ActionOf<D> } | { kind: 'closeWindow' } = { kind: 'action', action },
  ): void {
    const before = this.s;
    const after = this.def.apply(before, action) as StateOf<D>;
    // Belt and braces: assigning first and validating later is what once turned
    // one malformed socket message into a table whose state was permanently
    // `undefined`.
    if (!after) throw new Error('game returned no state');
    this.s = after;
    this.moves += 1;
    // A timed-out seat's default action is still an action to the animator.
    this.record(before, after, cause.kind === 'closeWindow' ? { kind: 'action', action } : cause);
  }

  private record(
    before: StateOf<D>,
    after: StateOf<D>,
    cause: { kind: 'action'; action: ActionOf<D> } | { kind: 'startRound' } | { kind: 'newMatch'; matchNumber: number },
  ): void {
    for (const e of this.def.deriveEvents(before, after, cause) as EventOf<D>[]) this.queued.push(e);
  }

  /** Games keep their dealer and config on the state under these names when they have them. */
  private dealerOf(s: StateOf<D>): number | undefined {
    const d = (s as { dealer?: unknown }).dealer;
    return typeof d === 'number' ? d : undefined;
  }

  private configOf(s: StateOf<D>): Partial<ConfigOf<D>> | undefined {
    const c = (s as { config?: unknown }).config;
    return c && typeof c === 'object' ? (c as Partial<ConfigOf<D>>) : undefined;
  }
}
