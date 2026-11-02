import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Session, makeRng, type ActionOf, type AnyGame, type BotLevel, type ConfigOf, type EventOf, type ViewOf } from '@belot/game-core';

/**
 * One local game of anything in the app against the bots.
 *
 * Bela has its own director (anim/director.ts) that animates a whole batch of
 * bot moves from patched views. The other games need none of that: here the
 * session holds every seat, and this hook plays each bot's move itself, one at
 * a time after a moment's thought, so every frame the screen draws is a real
 * state of the game. A move is never batched, so nothing has to be patched.
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

  // The bots, one move per beat — in a betting window too, while the person is still deciding.
  useEffect(() => {
    if (session.roundOver() || session.matchOver()) return;
    const seat = session.actors().find((s) => s !== mySeat);
    if (seat === undefined) return;
    const delay = thinkRef.current?.(seat) ?? 700;
    const h = setTimeout(() => {
      // The session may have moved on (a remount, a new match): only act if this seat is still owed a move.
      if (!session.actors().includes(seat)) return;
      const memory = def.bot.memory?.(session.state);
      session.submit(def.bot.decide(session.view(seat), botRng, opts.botLevel, memory));
      settle();
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
