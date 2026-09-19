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

/** A gift as the server relays it: always a list of recipients, even for one. */
export interface GiftMessage {
  from: Seat;
  to: Seat[];
  id: GiftId;
}

const isSeat = (v: unknown): v is Seat => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3;

/** One other seat, or everyone else at the table; never the giver. */
export function recipientsOf(to: Seat | 'table', from: Seat): Seat[] {
  if (to === 'table') return ([0, 1, 2, 3] as Seat[]).filter((s) => s !== from);
  return to === from ? [] : [to];
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
