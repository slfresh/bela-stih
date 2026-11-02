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

/**
 * How a room's events reach the table an online game draws, in the order the
 * room sent them.
 *
 * The table hands over its event handler as it renders (`offer`), but it can
 * take events only once it is on screen: the bots' opening moves, and the
 * first round's deal, arrive with the very message that takes the lobby down,
 * before there is a table at all. Those wait, and the screen hands them over
 * after the commit that drew the table (`open`). Until the queue is empty,
 * every new event joins the back of it: one that arrived between the table's
 * render and that commit used to go straight in, ahead of the deal it
 * followed, and its sound played first. A screen with no table on it (the
 * lobby, a failure) shuts the gate again (`close`).
 */
export interface EventGate<E, V> {
  deliver(e: E, v: V): void;
  offer(handler: (e: E, v: V) => void): void;
  open(): void;
  close(): void;
}

export function eventGate<E, V>(): EventGate<E, V> {
  let handler: ((e: E, v: V) => void) | null = null;
  let isOpen = false;
  const queue: [E, V][] = [];
  return {
    deliver(e, v) {
      if (isOpen && handler && queue.length === 0) handler(e, v);
      else queue.push([e, v]);
    },
    offer(h) {
      handler = h;
    },
    open() {
      if (!handler) return;
      // One at a time off the front: an event that comes in while these play
      // (the queue is not empty yet) still lands behind them.
      while (queue.length > 0) {
        const [e, v] = queue.shift()!;
        handler(e, v);
      }
      isOpen = true;
    },
    close() {
      isOpen = false;
      handler = null;
    },
  };
}
