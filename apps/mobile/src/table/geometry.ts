import type { Seat } from '@belot/engine';

/**
 * Where each seat sits on screen, and how the hand is sized.
 *
 * DIRECTION OF PLAY — the one rule this file exists to encode. Croatian bela
 * runs COUNTER-CLOCKWISE: the dealer's RIGHT-hand neighbour bids first and
 * leads, play passes to the player on your RIGHT, and the dealer is last
 * (which is exactly why "mus" falls on them). Sources: hr.wikipedia "Belot",
 * belaklub.com, tako.hr, playtoy.tportal.hr. Only Međimurje is documented as
 * playing the other way round.
 *
 * The engine already encodes this correctly — `turn = (seat + 1) % 4` — so a
 * seat's index offset from mine IS its play order after me. All this module
 * does is stop drawing offset 1 on the left.
 */

export type Position = 'bottom' | 'left' | 'top' | 'right';

/**
 * Indexed by the offset from my seat in PLAY order; the value is where that
 * seat is drawn. Offset 1 (next to act) is on the right.
 */
export const POSITIONS: readonly Position[] = ['bottom', 'right', 'top', 'left'];

/** Where `seat` is drawn, from `mySeat`'s point of view. */
export function seatPosition(seat: Seat, mySeat: Seat): Position {
  return POSITIONS[(seat - mySeat + 4) % 4]!;
}

/** The seat drawn at `pos`, from `mySeat`'s point of view. Inverse of the above. */
export function seatAt(pos: Position, mySeat: Seat): Seat {
  return ((mySeat + POSITIONS.indexOf(pos)) % 4) as Seat;
}
