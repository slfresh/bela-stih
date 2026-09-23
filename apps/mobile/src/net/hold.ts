import type { Seat } from '@belot/engine';

/**
 * A private table standing still, as the server says it (protocol.ts, HoldInfo):
 * paused by a player, or waiting for one whose connection dropped - a phone
 * call is the usual reason - before a bot takes their cards.
 */
export interface WireHold {
  paused?: { by: Seat; msLeft: number };
  waiting: { seat: Seat; msLeft: number }[];
}

/**
 * The same on this device's clock. The server sends time LEFT, never a moment:
 * the two clocks disagree, and "7:42 left" means the same on both.
 */
export interface TableHold {
  paused: { by: Seat; until: number } | null;
  waiting: { seat: Seat; until: number }[];
}

export function localHold(h: WireHold | undefined, now: number): TableHold | null {
  if (!h) return null;
  return {
    paused: h.paused ? { by: h.paused.by, until: now + h.paused.msLeft } : null,
    waiting: h.waiting.map((w) => ({ seat: w.seat, until: now + w.msLeft })),
  };
}

/** "7:42" - minutes and seconds left, rounded up, never below 0:00. */
export function clockText(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Who has not said they are ready for the next deal yet: people who are on
 * the line, other than me. Bots never keep a table waiting.
 */
export function stillReading(
  seats: readonly { seat: Seat; connected: boolean; bot: boolean }[],
  votes: readonly Seat[],
  me: Seat,
): Seat[] {
  return seats.filter((s) => s.connected && !s.bot && s.seat !== me && !votes.includes(s.seat)).map((s) => s.seat);
}
