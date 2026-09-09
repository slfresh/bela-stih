import { describe, expect, it } from 'vitest';
import { computeTableMetrics, FELT_HAND_GAP } from '../src/table/metrics';
import { fanHeight, fitHand } from '../src/table/geometry';

/**
 * The table's dimensions as a function of the usable box. Phones first: the
 * boxes below are real handsets with their insets already taken off.
 */
const LANDSCAPE = [
  [640, 360], // a 16:9 budget phone
  [800, 360],
  [915, 412], // Pixel-class
  [1024, 768], // tablet
  [960, 505], // the web column at its widest
] as const;
const PORTRAIT = [
  [320, 568],
  [360, 740],
  [412, 915],
  [480, 1000],
] as const;

describe('computeTableMetrics', () => {
  it('never lets a landscape felt claim the height the hand needs', () => {
    // With the whole height on offer the felt was the fan's only competitor
    // for it — and the fan is drawn from the same budget.
    for (const [w, h] of LANDSCAPE) {
      const m = computeTableMetrics(w, h);
      expect(m.orientation).toBe('landscape');
      expect(m.feltMaxHeight + m.handMinHeight + FELT_HAND_GAP).toBeLessThanOrEqual(h);
      expect(m.feltMaxHeight).toBeGreaterThan(h * 0.4); // and still a table, not a strip
    }
  });

  it('reserves the whole fan for the hand, lift and arc included', () => {
    for (const [w, h] of [...LANDSCAPE, ...PORTRAIT]) {
      const m = computeTableMetrics(w, h);
      const fit = fitHand(m.handWidth, 8, m.handCardMax);
      expect(m.handMinHeight).toBeGreaterThanOrEqual(fanHeight(fit.cardW, 8));
    }
  });

  it('leaves portrait exactly where it was', () => {
    for (const [w, h] of PORTRAIT) {
      const m = computeTableMetrics(w, h);
      expect(m.orientation).toBe('portrait');
      expect(m.feltMaxHeight).toBe(Math.round(h * 0.48));
      expect(m.feltMinHeight).toBe(260);
      expect(m.railW).toBe(0);
    }
  });

  it('keeps a landscape hand to about a third of the height', () => {
    for (const [w, h] of LANDSCAPE) {
      const m = computeTableMetrics(w, h);
      expect(m.handMinHeight).toBeLessThanOrEqual(Math.ceil(h * 0.34) + 1);
    }
  });
});
