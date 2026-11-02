import type { BotLevel } from './bots';
import type { Rng } from './rng';

/**
 * @belot/game-core — the contract a card game implements to sit in the app.
 *
 * A game is a pure, immutable state machine plus a redaction function: the
 * session layer (`Session`) plays its bot seats, the server room sends each
 * client only `view(s, seat)`, the client animates `deriveEvents`. Nothing here
 * knows about React, websockets or clocks — a game is time-free, and a timed
 * betting window is the session applying `defaultAction` when the clock the
 * room owns runs out.
 *
 * Bela (`@belot/games-bela`) is the first implementation, as an adapter over the
 * untouched `@belot/engine`; every later game is written against this directly.
 */

/** A seat's standing in the match. `out` seats never act again this match. */
export type SeatStatus = 'active' | 'out' | 'sittingOut';

export interface GameMeta {
  /** Stable id: room names, storage records and i18n namespaces key on it. */
  id: string;
  minPlayers: number;
  maxPlayers: number;
  /** Partnership games (Bela: 2 teams, partners across). Null when every seat plays alone. */
  teams: { count: number; teamOf(seat: number, seats: number): number } | null;
  deck: 'madarice32' | 'french52' | 'french52-shoe' | 'custom';
  /** Per-seat chip stacks are part of the state (poker, baccarat, blackjack). */
  betting: boolean;
  /** Casino-style game: grouped in the lobby and declared on the rating questionnaire. */
  casino: boolean;
  /** `actors()` may name several seats at once (a betting window). */
  simultaneous: boolean;
  /** Order free seats are handed out, so friends land where the game wants them (Bela: partners). */
  seatFillOrder?(seats: number): number[];
  /** Default decision window and the pause between rounds, in milliseconds. */
  windowMs: number;
  nextRoundMs: number;
}

/**
 * What caused a transition. `deriveEvents` sees it so session-level events
 * (a deal starting, a rematch) are the game's to name, like everything else
 * a client animates.
 */
export type Cause<A> =
  | { kind: 'action'; action: A }
  | { kind: 'startRound' }
  | { kind: 'newMatch'; matchNumber: number }
  | { kind: 'closeWindow' };

/** Hidden tokens (card ids, hole cards) and the seats allowed to see them now. */
export interface Secret {
  tokens: string[];
  visibleTo: number[];
}

export interface CreateMatchOptions<C> {
  seats: number;
  /** Shuffle randomness. The session passes an injected generator or nothing; `seed` then rules. */
  rng?: Rng;
  seed: number;
  config?: Partial<C>;
  dealer?: number;
  /** Starting stacks for betting games, one per seat. */
  stacks?: number[];
}

export interface GameDefinition<
  S,
  A extends { seat: number; type: string },
  V,
  E extends { kind: string },
  C,
> {
  meta: GameMeta;
  defaultConfig: C;

  createMatch(o: CreateMatchOptions<C>): S;
  /** Deal the next round (hand, coup, deal). Only legal when `roundOver` or fresh. */
  startRound(s: S): S;
  roundOver(s: S): boolean;
  matchOver(s: S): boolean;

  /** Seats owed a decision right now: `[]` none, `[x]` one, several for a window. */
  actors(s: S): number[];
  seatStatus(s: S, seat: number): SeatStatus;
  /** Legal actions for one seat; empty unless it is among `actors`. */
  legalActions(s: S, seat: number): A[];
  /** Validate an untrusted action from the wire; null rejects it. */
  normalize(s: S, seat: number, raw: unknown): A | null;
  /** The action a seat takes when its clock runs out. */
  defaultAction(s: S, seat: number, rng: Rng, level: BotLevel): A;
  /**
   * After a timed-out seat's default action, is the turn it timed out on still
   * unfinished - still that seat's, and only half done? Osmice says yes while
   * the seat holds the card its default move just drew: the draw and the play
   * of that card are one turn, and one timeout settles it rather than a second
   * full clock. The session then applies `defaultAction` again, a few times at
   * most. Games where a seat's next decision is a new one (Bela: winning a
   * trick and leading the next) leave this out, and a timeout stays one move.
   */
  turnContinues?(s: S, seat: number): boolean;
  /**
   * While a window several seats answer at once is open (a betting round), a
   * name for it that stays the same however many moves are made in it — a
   * bet placed is still the same window — and changes when the next one
   * opens. Null when no window is open. A clock keys on this, so answering
   * early or late never restarts it for the others. Games without windows
   * leave it out.
   */
  windowKey?(s: S): string | null;
  /** Pure: returns a new state, never mutates. Throws on an illegal action. */
  apply(s: S, a: A): S;

  /** The redacted state one seat may receive. Hidden-hand safe by construction. */
  view(s: S, seat: number): V;
  /** Everything hidden right now, for the generic leak test and the server smoke. */
  secrets(s: S): Secret[];
  /** May this event be broadcast to every seat? */
  isEventPublic(e: E): boolean;
  deriveEvents(before: S, after: S, cause: Cause<A>): E[];

  /** Winning seats (or team ids when `meta.teams`), once `matchOver`. */
  winners(s: S): number[] | null;
  /** Per-seat chip deltas at the end of a betting match; null for other games. */
  settlement(s: S): number[] | null;

  bot: {
    decide(view: V, rng: Rng, level: BotLevel, memory?: unknown): A;
    /** What a bot may remember beyond its view (Bela: the deal's completed tricks). */
    memory?(s: S): unknown;
  };
}

// Convenience projections over a definition's type parameters.
export type AnyGame = GameDefinition<any, any, any, any, any>;
export type StateOf<D> = D extends GameDefinition<infer S, any, any, any, any> ? S : never;
export type ActionOf<D> = D extends GameDefinition<any, infer A, any, any, any> ? A : never;
export type ViewOf<D> = D extends GameDefinition<any, any, infer V, any, any> ? V : never;
export type EventOf<D> = D extends GameDefinition<any, any, any, infer E, any> ? E : never;
export type ConfigOf<D> = D extends GameDefinition<any, any, any, any, infer C> ? C : never;
