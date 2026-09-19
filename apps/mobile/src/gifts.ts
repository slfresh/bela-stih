import type { Seat } from '@belot/engine';
import { isGiftId, spendOnGift, type GiftId, type PlayerProfile } from '@belot/progression';

/**
 * Table gifts, the pure part: who a gift is for, what a relayed gift looks
 * like on the wire, and the ONE place a gift touches a profile. No React
 * Native here, so the tests load it under node.
 */

/**
 * How long a player waits between gifts. A second longer than the server's
 * GIFT_GAP_MS (apps/server/src/protocol.ts), so network jitter can never
 * push a gift somebody already paid for into the server's window, where it
 * would be dropped.
 */
export const GIFT_COOLDOWN_MS = 8000;

/**
 * How long a sent gift is waited for. The server's heartbeat closes a
 * stalled connection within about nine seconds, so no echo of a live send
 * comes later than this; a send still unanswered by then was lost with its
 * connection. Until then no second gift goes out, so two can never ride on
 * one wallet.
 */
export const GIFT_ECHO_WAIT_MS = 15000;

/**
 * Who at the table can be given a gift, seat by seat: everyone offline;
 * online, the seats the room says can see one (an older app cannot).
 */
export type GiftReach = readonly boolean[];

/** A gift as the server relays it: always a list of recipients, even for one. */
export interface GiftMessage {
  from: Seat;
  to: Seat[];
  id: GiftId;
}

const isSeat = (v: unknown): v is Seat => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3;

/**
 * One other seat, or everyone else at the table; never the giver, and never
 * a seat outside `reach` (none is, when it is not given).
 */
export function recipientsOf(to: Seat | 'table', from: Seat, reach?: GiftReach): Seat[] {
  const can = (s: Seat) => reach?.[s] ?? true;
  if (to === 'table') return ([0, 1, 2, 3] as Seat[]).filter((s) => s !== from && can(s));
  return to === from || !can(to) ? [] : [to];
}

/** The room's word on who can see a gift (SeatInfo.seesGifts), as a GiftReach. */
export function reachOf(seats: readonly { seat: Seat; seesGifts?: boolean }[]): boolean[] {
  return ([0, 1, 2, 3] as Seat[]).map((s) => seats.some((x) => x.seat === s && x.seesGifts === true));
}

/**
 * A relayed gift this client understands. An id it does not know — a newer
 * app's gift — is ignored rather than drawn as nothing and charged for.
 */
export function isGiftMessage(m: unknown): m is GiftMessage {
  if (!m || typeof m !== 'object') return false;
  const g = m as { from?: unknown; to?: unknown; id?: unknown };
  if (!isSeat(g.from) || !isGiftId(g.id) || !Array.isArray(g.to) || g.to.length === 0) return false;
  if (!g.to.every(isSeat) || g.to.includes(g.from) || new Set(g.to).size !== g.to.length) return false;
  return true;
}

/**
 * The sender pays when the server's echo comes back, and only then: a send
 * the server dropped (rate limit, an old server, no network) costs nothing.
 * Anyone else's gift leaves this profile exactly as it was — the receiver
 * gains nothing, which is what keeps coins from moving between players.
 */
export function applyGiftEcho(profile: PlayerProfile, msg: GiftMessage, mySeat: Seat | null): PlayerProfile {
  if (mySeat === null || msg.from !== mySeat) return profile;
  return spendOnGift(profile, msg.id, msg.to.length);
}
