import type { Seat } from '@belot/engine';
import type { Lang } from '@belot/i18n';

/**
 * A seat's name as the room sent it, in the player's language. The server
 * fills a seat nobody named (a vacant chair, a player with no nickname) with
 * its own Croatian `Igrač N` (apps/server/src/BelaRoom.ts); shown verbatim,
 * a Serbian or English player read Latin Croatian on the pucks and in the
 * bot line. Exactly that fallback is said in the locale's own words; any
 * real nickname is left as it was typed.
 */
export const SERVER_FALLBACK = (seat: Seat) => `Igrač ${seat + 1}`;

export function seatName(lang: Lang, s: { seat: Seat; name: string }): string {
  return s.name === SERVER_FALLBACK(s.seat) ? lang.s.ui.playerN(s.seat + 1) : s.name;
}
