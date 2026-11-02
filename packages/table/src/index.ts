import type { Action, EngineConfig, GameState, Phase, PublicView, Seat, TeamId } from '@belot/engine';
import { legalActions, matchWins, teamOf, type Rng } from '@belot/engine';
import { Session } from '@belot/game-core';
import { BELA, type TableEvent } from '@belot/games-bela';
import type { BotLevel } from '@belot/bots';

/**
 * @belot/table — the seat-aware session layer for Bela.
 *
 * The engine is pure and turn-by-turn; a UI wants something that plays the bot
 * seats by itself, stops when it needs a person, and says what just happened so
 * the table can be animated. That is all this is.
 *
 * Since the app grew more games this is Bela's face of `Session` from
 * `@belot/game-core`: the same object every game uses, driving the `BELA`
 * definition from `@belot/games-bela`. The API below is unchanged, so the CLI,
 * the Expo client, the server and the golden corpus all keep calling it as
 * before — and a differential test pins it against the old implementation.
 *
 * It is deliberately UI-free, so the same object backs the offline Expo client
 * AND the server's disconnect-fill: a dropped player simply becomes a bot seat.
 */

export type { TableEvent };

export interface TableOptions {
  /**
   * The randomness behind the shuffle AND the bots, superseding `seed`. A
   * server passes a crypto-backed generator: a seeded table is reproducible,
   * and anything reproducible from 32 bits is recoverable by an opponent who
   * can see six of its cards.
   */
  rng?: Rng;
  /** Seats a person controls. Empty means every seat is a bot (demo / auto-play). */
  humanSeats?: Seat[];
  botLevel?: BotLevel;
  config?: Partial<EngineConfig>;
  seed?: number;
  dealer?: Seat;
}

export class Table {
  private readonly session: Session<typeof BELA>;

  constructor(opts: TableOptions = {}) {
    this.session = new Session(BELA, {
      seats: 4,
      rng: opts.rng,
      humanSeats: opts.humanSeats,
      botLevel: opts.botLevel,
      config: opts.config,
      seed: opts.seed,
      dealer: opts.dealer,
    });
  }

  get botLevel(): BotLevel {
    return this.session.botLevel;
  }

  // --- seats ---------------------------------------------------------------

  /** Seats currently played by a person; everything else is a bot. */
  get humanSeats(): ReadonlySet<Seat> {
    return this.session.humanSeats as ReadonlySet<Seat>;
  }

  /**
   * Hand a seat to a bot, or give it back to a person.
   *
   * This is how a disconnect is survived online: the seat becomes a bot, play
   * carries on, and the returning player takes it back mid-deal. Handing a seat
   * to a bot immediately runs it, in case the table was waiting on that player.
   */
  setSeatHuman(seat: Seat, human: boolean): void {
    this.session.setSeatHuman(seat, human);
  }

  // --- reading -------------------------------------------------------------

  get state(): Readonly<GameState> {
    return this.session.state;
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
    return this.session.moveCount;
  }

  get phase(): Phase {
    return this.state.phase;
  }

  get matchScores(): readonly [number, number] {
    return this.state.matchScores;
  }

  /** The hidden-hand-safe view for one seat. This is what crosses the wire. */
  view(seat: Seat): PublicView {
    return this.session.view(seat);
  }

  actor(): Seat | null {
    return (this.session.actors()[0] as Seat | undefined) ?? null;
  }

  isHumanTurn(): boolean {
    const seat = this.actor();
    return seat !== null && this.humanSeats.has(seat);
  }

  /** Legal actions for whoever is on turn (empty when the deal is between hands). */
  legal(): Action[] {
    return legalActions(this.state);
  }

  /** Take the events since the last drain. The UI animates them, then renders state. */
  drainEvents(): TableEvent[] {
    return this.session.drainEvents();
  }

  // --- driving -------------------------------------------------------------

  /** Submit a human action, then let the bots run up to the next human decision. */
  submit(action: Action): void {
    const seat = this.actor();
    if (seat === null) throw new Error(`no action is expected in phase ${this.phase}`);
    if (!this.humanSeats.has(seat)) throw new Error(`seat ${seat} is played by a bot`);
    if (action.seat !== seat) throw new Error(`it is seat ${seat}'s turn, not ${action.seat}'s`);
    this.session.submit(action);
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
    if (this.phase !== 'MATCH_OVER') {
      throw new Error(`cannot start a new match from phase ${this.phase}`);
    }
    this.session.newMatch(opts);
  }

  /** Deal again after a scored hand. */
  startNextDeal(): void {
    if (this.phase !== 'DEAL_OVER') {
      throw new Error(`cannot deal from phase ${this.phase}`);
    }
    this.session.startNextRound();
  }

  /** Advance while it is a bot's turn. Stops at a human decision or a scored deal. */
  runBots(): void {
    this.session.runBots();
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
    this.session.botMoveFor(seat);
  }

  /** Play an all-bot table through to a winner. Used by the demo and the tests. */
  playWholeMatch(maxDeals = 500): void {
    this.session.playWholeMatch(maxDeals);
  }

  winner(): TeamId | null {
    return (this.session.winners()?.[0] as TeamId | undefined) ?? null;
  }

  /** How many matches the winner is credited with (1, or 2 under the double-win rule). */
  matchWins(): 1 | 2 {
    return matchWins(this.state);
  }
}

export { teamOf, type BotLevel };
