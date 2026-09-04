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

// ---------------------------------------------------------------------------
// The hand
// ---------------------------------------------------------------------------

/** Card art is drawn on a 100x145 canvas, so every card keeps this ratio. */
export const CARD_ASPECT = 1.45;

/** Below this a mađarica's pips stop reading; above it the fan looks silly. */
const MIN_CARD_W = 40;
const MAX_CARD_W = 76;
/** How much of each overlapped card must stay visible to be identifiable. */
const MIN_REVEAL = 0.42;
const MAX_REVEAL = 0.72;

export interface HandFit {
  cardW: number;
  cardH: number;
  /** Distance between neighbouring card origins. */
  advance: number;
  /** The negative margin that produces that advance. */
  overlap: number;
  /** How much the fan is scaled relative to the reference 58px card. */
  scale: number;
}

/**
 * Size the hand to the space it actually has, so eight cards are always ONE
 * row — on a 320dp phone they used to spill off both edges, and a wrapped
 * second row is the layout players complain about most in rival apps.
 */
export function fitHand(available: number, count: number): HandFit {
  const cardW =
    count <= 1
      ? Math.min(MAX_CARD_W, available)
      : clamp(available / (1 + (count - 1) * 0.62), MIN_CARD_W, MAX_CARD_W);
  const advance =
    count <= 1
      ? 0
      : clamp((available - cardW) / (count - 1), cardW * MIN_REVEAL, cardW * MAX_REVEAL);
  return {
    cardW,
    cardH: cardW * CARD_ASPECT,
    advance,
    overlap: count <= 1 ? 0 : -(cardW - advance),
    scale: cardW / 58,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
