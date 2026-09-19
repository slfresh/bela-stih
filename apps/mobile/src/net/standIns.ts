import type { Seat } from '@belot/engine';

/**
 * Who a bot is standing in for. The room's `bot` flag only says nobody is
 * playing a seat NOW: a table started with bots reports its empty seats as
 * bots exactly as it reports a player who dropped. Only a seat a person has
 * played since the start is someone a bot stands in for.
 *
 * Pure: the hook keeps the set, the tests drive it.
 */

/** A seat as the room reports it. */
interface SeatLike {
  seat: Seat;
  bot: boolean;
}

/**
 * The seats a person has played since the table started. Before the start
 * the server counts every seat as human, so only a started table's report
 * counts; the room locks at the start, so nobody new sits down and the set
 * only grows.
 */
export function notePeople(
  had: ReadonlySet<Seat>,
  status: 'waiting' | 'playing' | 'finished',
  seats: readonly SeatLike[],
): ReadonlySet<Seat> {
  if (status === 'waiting') return had;
  let next: Set<Seat> | null = null;
  for (const s of seats) {
    if (s.bot || had.has(s.seat)) continue;
    next ??= new Set(had);
    next.add(s.seat);
  }
  return next ?? had;
}

/** A person's seat once, a bot's now: never a seat that was a bot from the start, never mine. */
export function standInsOf<T extends SeatLike>(seats: readonly T[], had: ReadonlySet<Seat>, mySeat: Seat | null): T[] {
  return seats.filter((s) => s.bot && s.seat !== mySeat && had.has(s.seat));
}
