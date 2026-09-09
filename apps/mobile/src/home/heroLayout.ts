/**
 * The home table's composition, as a function of the width the column gives
 * it — a pure module, so the one thing that can go wrong here is testable.
 *
 * The pill's padding and type were fixed while the table's width was not, so
 * on a 360 dp phone (a 320 dp column) a pill sized for a tablet sat across
 * all three characters: it covered both guests' shoulders and the top of the
 * player's own hat. Everything below scales with the width, and
 * `heroCollides` is what the test asserts never happens.
 */

/**
 * Rubik Black advances, as fractions of the em, for every letter the three
 * PLAY labels use (hr IGRAJ, sr ИГРАЈ, en PLAY). Read from the shipped
 * Rubik-900.ttf; a letter the table does not know is taken at a wide one's
 * width so an added locale errs towards a smaller pill, never a colliding one.
 */
const ADVANCE: Record<string, number> = {
  I: 0.368,
  G: 0.753,
  R: 0.722,
  A: 0.755,
  J: 0.702,
  P: 0.705,
  L: 0.626,
  Y: 0.71,
  И: 0.81,
  Г: 0.599,
  Р: 0.705,
  А: 0.755,
  Ј: 0.702,
};
const ADVANCE_DEFAULT = 0.82;

/**
 * The table's proportions. Wider than tall, but not 2:1 — at 2:1 a 320 dp
 * column left 160 dp of height for a 45 dp guest, a 52 dp pill and a 50 dp
 * player, which is 13 dp more than there is.
 */
export const HERO_ASPECT = 1.8;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HeroLayout {
  width: number;
  height: number;
  /** The two guests across the table, and the player's own chair. */
  seat: number;
  guestTop: number;
  guestInset: number;
  youSize: number;
  youBottom: number;
  /** The word on the baize. */
  pill: {
    fontSize: number;
    lineHeight: number;
    letterSpacing: number;
    padH: number;
    padV: number;
    w: number;
    h: number;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function heroLayout(width: number, label: string): HeroLayout {
  const height = Math.round(width / HERO_ASPECT);
  const seat = Math.round(Math.min(56, width * 0.14));
  // The player's own chair reads as the near one by being a little bigger —
  // a little, because the word above it needs the room more.
  const youSize = Math.round(seat * 1.08);
  // The guests sit high and wide enough to leave the middle band free.
  const guestTop = Math.round(height * 0.05);
  const guestInset = Math.round(width * 0.15);
  const youBottom = Math.round(height * 0.04);

  const fontSize = Math.round(clamp(width * 0.066, 17, 24));
  const lineHeight = Math.round(fontSize * 1.25);
  const letterSpacing = Math.round(fontSize * 0.12 * 10) / 10;
  const padH = Math.round(clamp(width * 0.085, 16, 32));
  const padV = Math.round(clamp(width * 0.037, 8, 12));

  let em = 0;
  for (const ch of label) em += ADVANCE[ch] ?? ADVANCE_DEFAULT;
  // Tracking is added after every letter, the last one included: that is what
  // React Native measures, and the pill is sized from what it measures.
  const textW = em * fontSize + letterSpacing * label.length;
  return {
    width,
    height,
    seat,
    guestTop,
    guestInset,
    youSize,
    youBottom,
    pill: {
      fontSize,
      lineHeight,
      letterSpacing,
      padH,
      padV,
      // +2 for the pill's own hairline border.
      w: Math.ceil(textW) + 2 * padH + 2,
      h: lineHeight + 2 * padV + 2,
    },
  };
}

/** Where each piece lands, for the test and for nothing else. */
export function heroBoxes(l: HeroLayout): { guestL: Box; guestR: Box; you: Box; pill: Box } {
  return {
    guestL: { x: l.guestInset, y: l.guestTop, w: l.seat, h: l.seat },
    guestR: { x: l.width - l.guestInset - l.seat, y: l.guestTop, w: l.seat, h: l.seat },
    you: {
      x: Math.round((l.width - l.youSize) / 2),
      y: l.height - l.youBottom - l.youSize,
      w: l.youSize,
      h: l.youSize,
    },
    pill: {
      x: Math.round((l.width - l.pill.w) / 2),
      y: Math.round((l.height - l.pill.h) / 2),
      w: l.pill.w,
      h: l.pill.h,
    },
  };
}

/** The overlap between two boxes, in dp on the smaller axis; 0 when they are clear. */
export function overlap(a: Box, b: Box): number {
  const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return dx > 0 && dy > 0 ? Math.min(dx, dy) : 0;
}

/** Does the word on the baize touch any of the three characters? */
export function heroCollides(width: number, label: string): number {
  const b = heroBoxes(heroLayout(width, label));
  return Math.max(overlap(b.pill, b.guestL), overlap(b.pill, b.guestR), overlap(b.pill, b.you));
}
