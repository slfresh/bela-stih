import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Session, makeRng, type ActionOf, type AnyGame, type BotLevel, type ConfigOf, type EventOf, type Rng, type ViewOf } from '@belot/game-core';

/**
 * One local game of anything in the app against the bots.
 *
 * Bela has its own director (anim/director.ts) that animates a whole batch of
 * bot moves from patched views. The other games need none of that: here the
 * session holds every seat, and this hook plays each bot's move itself, one at
 * a time after a moment's thought, so every frame the screen draws is a real
 * state of the game. A move is never batched, so nothing has to be patched —
 * save a betting window (a game with `windowKey`), which every bot answers in
 * one beat, as a table of players betting at once would.
 *
 * The screen gives it a game, how many seats, and the bot level; it gets back
 * the view to draw, whose turn it is, and the calls a person makes.
 */

export interface LocalSessionOptions<D extends AnyGame> {
  seats: number;
  /** Where the person sits; offline always 0. */
  mySeat?: number;
  botLevel: BotLevel;
  config?: Partial<ConfigOf<D>>;
  /** Starting stacks for a betting game, one per seat (the person's is their buy-in). */
  stacks?: number[];
  seed?: number;
  /** How long a bot seems to think, in ms; 0 plays at once (tests, reduced motion). */
  thinkMs?: (seat: number) => number;
  /** Every event, once, in order, as it happens: sound, haptics, progression, a line on the table. */
  onEvent?: (e: EventOf<D>, view: ViewOf<D>) => void;
}

export interface LocalSession<D extends AnyGame> {
  view: ViewOf<D>;
  /** The person may act now. */
  myTurn: boolean;
  /** The seat the table is waiting on, or null between rounds. */
  actor: number | null;
  roundOver: boolean;
  matchOver: boolean;
  winners: number[] | null;
  submit(action: ActionOf<D>): boolean;
  nextRound(): void;
  newMatch(): void;
}

/**
 * One beat of the bots: the first bot owed a move makes it — or, while a
 * betting window is open (a game with `windowKey`), every bot owed an answer
 * gives its whole one: its chips and its "no more bets". One bot per beat, a
 * chip per beat, kept a full table of six waiting ten seconds a coup; a
 * window is answered by everyone at once, as at a real table. `after` runs
 * after each bot's turn, so the events still arrive one bot after another.
 */
export function botBeat<D extends AnyGame>(session: Session<D>, def: D, mySeat: number, rng: Rng, level: BotLevel, after: () => void): void {
  const move = (seat: number) => {
    const memory = def.bot.memory?.(session.state);
    session.submit(def.bot.decide(session.view(seat), rng, level, memory));
  };
  const window = def.windowKey?.(session.state) ?? null;
  if (window === null) {
    const seat = session.actors().find((s) => s !== mySeat);
    if (seat === undefined) return;
    move(seat);
    after();
    return;
  }
  for (const bot of session.actors().filter((s) => s !== mySeat)) {
    // A cap, not a count: a bot ends its answer with READY long before it.
    for (let i = 0; i < 64; i++) {
      if (def.windowKey?.(session.state) !== window || !session.actors().includes(bot)) break;
      move(bot);
    }
    after();
  }
}

export function useLocalSession<D extends AnyGame>(def: D, opts: LocalSessionOptions<D>): LocalSession<D> {
  const mySeat = opts.mySeat ?? 0;
  const sessionRef = useRef<Session<D> | null>(null);
  const seed = useRef(opts.seed ?? (Date.now() & 0x7fffffff)).current;
  if (sessionRef.current === null) {
    sessionRef.current = new Session(def, {
      seats: opts.seats,
      // Every seat "human": the session never runs a bot by itself, this hook does, one move at a time.
      humanSeats: Array.from({ length: opts.seats }, (_, i) => i),
      botLevel: opts.botLevel,
      config: opts.config,
      stacks: opts.stacks,
      seed,
    });
  }
  const session = sessionRef.current;
  const botRng = useMemo(() => makeRng(seed ^ 0x2545f491), [seed]);

  // The latest callbacks, so a new closure from the screen never restarts the loop.
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;
  const thinkRef = useRef(opts.thinkMs);
  thinkRef.current = opts.thinkMs;

  const [tick, setTick] = useState(0);
  const settle = useCallback(() => {
    const view = session.view(mySeat);
    for (const e of session.drainEvents()) onEventRef.current?.(e as EventOf<D>, view);
    setTick((t) => t + 1);
  }, [session, mySeat]);

  // The opening deal's events, once.
  useEffect(() => {
    settle();
  }, [settle]);

  // The bots, a beat at a time (see botBeat) — in a betting window too, while the person is still deciding.
  useEffect(() => {
    if (session.roundOver() || session.matchOver()) return;
    const seat = session.actors().find((s) => s !== mySeat);
    if (seat === undefined) return;
    const delay = thinkRef.current?.(seat) ?? 700;
    const h = setTimeout(() => {
      // The session may have moved on (a remount, a new match): only act if this seat is still owed a move.
      if (!session.actors().includes(seat)) return;
      botBeat(session, def, mySeat, botRng, opts.botLevel, settle);
    }, delay);
    return () => clearTimeout(h);
  }, [tick, session, def, botRng, opts.botLevel, mySeat, settle]);

  const submit = useCallback(
    (action: ActionOf<D>): boolean => {
      if (!session.actors().includes(mySeat)) return false;
      try {
        session.submit(action);
      } catch {
        return false;
      }
      settle();
      return true;
    },
    [session, mySeat, settle],
  );

  const nextRound = useCallback(() => {
    if (!session.roundOver() || session.matchOver()) return;
    session.startNextRound();
    settle();
  }, [session, settle]);

  const newMatch = useCallback(() => {
    if (!session.matchOver()) return;
    session.newMatch();
    settle();
  }, [session, settle]);

  const actors = session.actors();
  const actor = actors.includes(mySeat) ? mySeat : (actors[0] ?? null);
  return {
    view: session.view(mySeat),
    myTurn: actors.includes(mySeat),
    actor,
    roundOver: session.roundOver(),
    matchOver: session.matchOver(),
    winners: session.winners(),
    submit,
    nextRound,
    newMatch,
  };
}
