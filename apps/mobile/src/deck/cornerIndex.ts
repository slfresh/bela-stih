/**
 * The corner index: the rank (and, on courts and aces, the pip) in the
 * top-left corner of every mađarica, mirrored bottom-right — an app-only
 * element a printed deck does not carry, and the one thing that lets a rank
 * be read in a fan that shows only the left third of each card. The art was
 * drawn to dodge the box below; this module is what the test measures.
 */

/** The box the index must stay inside, in card units (100 × 145). */
export const INDEX_MAX_X = 24;
export const INDEX_MAX_Y = 22;

/** The pip is drawn on a 100-unit canvas; at this scale it is 8.5 units tall. */
export const INDEX_PIP_SCALE = 0.085;

export interface IndexLayout {
  label: string;
  /** Centre x and baseline y of the numeral. */
  x: number;
  y: number;
  fontSize: number;
  /** Where the pip's 100-unit canvas is placed, if the index carries one. */
  pip: { x: number; y: number } | null;
}

export function cornerIndexLayout(label: string, withPip: boolean): IndexLayout {
  // Roman VIII needs four characters in the width of one letter.
  const fontSize = label.length >= 4 ? 6.5 : label.length === 3 ? 8 : label.length === 2 ? 10 : 11;
  const y = fontSize + 1;
  return {
    label,
    x: 12.5,
    y,
    fontSize,
    pip: withPip ? { x: 12.5 - (100 * INDEX_PIP_SCALE) / 2, y: y + 1.5 } : null,
  };
}

/** The index's extent, with a generous 0.65 em per character for the numeral. */
export function indexBounds(l: IndexLayout): { right: number; bottom: number } {
  const textW = l.label.length * l.fontSize * 0.65;
  const pipSize = 100 * INDEX_PIP_SCALE;
  return {
    right: Math.max(l.x + textW / 2, l.pip ? l.pip.x + pipSize : 0),
    bottom: l.pip ? l.pip.y + pipSize : l.y,
  };
}
