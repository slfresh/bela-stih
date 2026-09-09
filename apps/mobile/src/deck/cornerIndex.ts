/**
 * The corner index: the rank (and, on courts and aces, the pip) in the
 * top-left corner of every mađarica, mirrored bottom-right — an app-only
 * element a printed deck does not carry, and the one thing that lets a rank
 * be read in a fan that shows only the left third of each card. The art was
 * drawn to dodge the box below; this module is what the test measures.
 *
 * The numeral is as large as that box allows — its whole width — and a long
 * label (Roman VIII) is condensed to fit rather than shrunk: at first it was
 * sized to its character count, which put "VIII" at 6.5 units, a 3 px face
 * on the 50 px cards a 360 dp phone fans. The index is set in the app's own
 * bold face, so its width is known here and not left to the platform.
 */

/** The box the index must stay inside, in card units (100 × 145). */
export const INDEX_MAX_X = 24;
export const INDEX_MAX_Y = 22;

/** The pip is drawn on a 100-unit canvas; at this scale it is 8 units tall. */
export const INDEX_PIP_SCALE = 0.08;

/** The numeral's size: the box's width, for the rank to read in a fan. */
export const INDEX_FONT = 15;
/** With a pip underneath, the letter gives the pip its room. */
export const INDEX_FONT_PIP = 13;
/** How wide the run of glyphs may be; a longer run is condensed, never shrunk. */
export const INDEX_RUN_W = 21;
/** Rubik's cap height, as a fraction of the em. */
export const CAP_HEIGHT = 0.7;

/**
 * Rubik Bold advance widths as fractions of the em (read from the shipped
 * Rubik-700.ttf), for every glyph a rank label can hold in any locale: the
 * Roman numerals, the Latin and Cyrillic court letters, the digits.
 */
const ADVANCE: Record<string, number> = {
  I: 0.324,
  V: 0.693,
  X: 0.69,
  A: 0.716,
  K: 0.663,
  D: 0.716,
  B: 0.704,
  J: 0.671,
  Q: 0.712,
  '0': 0.68,
  '1': 0.497,
  '7': 0.573,
  '8': 0.677,
  '9': 0.641,
  А: 0.716,
  К: 0.701,
  Д: 0.782,
  Б: 0.657,
};
/** A glyph the table does not know is taken at a wide letter's width. */
const ADVANCE_DEFAULT = 0.72;

/** The width of a label set in the index's face, in card units. */
export function labelWidth(label: string, fontSize: number): number {
  let em = 0;
  for (const ch of label) em += ADVANCE[ch] ?? ADVANCE_DEFAULT;
  return em * fontSize;
}

export interface IndexLayout {
  label: string;
  /** Centre x and baseline y of the numeral. */
  x: number;
  y: number;
  fontSize: number;
  /** The horizontal squeeze that keeps a long run inside the box; 1 for most labels. */
  scaleX: number;
  /** Where the pip's 100-unit canvas is placed, if the index carries one. */
  pip: { x: number; y: number } | null;
}

export function cornerIndexLayout(label: string, withPip: boolean): IndexLayout {
  const fontSize = withPip ? INDEX_FONT_PIP : INDEX_FONT;
  // The baseline: a number card's first pip starts 16 units down, and the
  // numeral's foot must clear its ink; with a pip in the index the letter
  // rises to leave the pip its 8 units above the box's floor.
  const y = withPip ? 12.5 : 15;
  const scaleX = Math.min(1, INDEX_RUN_W / labelWidth(label, fontSize));
  const pipSize = 100 * INDEX_PIP_SCALE;
  return {
    label,
    x: 12.5,
    y,
    fontSize,
    scaleX,
    pip: withPip ? { x: 12.5 - pipSize / 2, y: y + 1.25 } : null,
  };
}

/** The index's extent: the run at its real (condensed) width, and the pip's foot if it carries one. */
export function indexBounds(l: IndexLayout): { right: number; bottom: number; top: number } {
  const textW = labelWidth(l.label, l.fontSize) * l.scaleX;
  const pipSize = 100 * INDEX_PIP_SCALE;
  return {
    right: Math.max(l.x + textW / 2, l.pip ? l.pip.x + pipSize : 0),
    bottom: l.pip ? l.pip.y + pipSize : l.y,
    top: l.y - CAP_HEIGHT * l.fontSize,
  };
}
