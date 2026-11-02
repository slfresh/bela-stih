import type { AnyGame, EventOf, ViewOf } from '@belot/game-core';
import type { LocalSession } from './useLocalSession';

/**
 * Where a table's game comes from: a session on the device (useLocalSession)
 * or a room on the server (useNetSession). A table calls it once per render
 * with its event handler and draws what comes back, never knowing which.
 *
 * It is a hook in all but name: the offline source calls useLocalSession
 * inside it, so a table must call it unconditionally, every render, like any
 * hook.
 */
export type SessionSource<D extends AnyGame> = (onEvent: (e: EventOf<D>, view: ViewOf<D>) => void) => LocalSession<D>;

/** Seats in play order after `me`, for drawing the others round the table. */
export function othersAfter(me: number, seats: number): number[] {
  return Array.from({ length: seats - 1 }, (_, i) => (me + i + 1) % seats);
}
