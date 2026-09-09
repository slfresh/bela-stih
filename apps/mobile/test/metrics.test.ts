import { describe, expect, it } from 'vitest';
import { computeTableMetrics, FELT_HAND_GAP, SELF_PUCK_GAP } from '../src/table/metrics';
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

describe('the prompt reserve', () => {
  it('is kept only where the column can pay for it', () => {
    // With the felt at its floor the fixed rows need ~610px; the reserve's
    // 62 more pushed the action buttons off a 647px iPhone SE / 8.
    expect(computeTableMetrics(375, 647).promptReserve).toBe(false);
    expect(computeTableMetrics(360, 668).promptReserve).toBe(false);
    expect(computeTableMetrics(390, 763).promptReserve).toBe(true);
    expect(computeTableMetrics(412, 850).promptReserve).toBe(true);
    for (const [w, h] of LANDSCAPE) expect(computeTableMetrics(w, h).promptReserve).toBe(false);
  });
});

describe('the hand beside my puck', () => {
  it('still fits eight readable cards on a narrow phone with the puck taking its share', () => {
    for (const [w, h] of [
      [320, 568],
      [360, 740],
      [375, 667],
    ] as const) {
      const m = computeTableMetrics(w, h);
      expect(m.selfPuck).toBeGreaterThan(0);
      expect(m.selfPuck).toBeLessThan(m.puck);
      // The row: puck + gap + hand, inside the usable width less the root padding.
      expect(m.selfPuck + SELF_PUCK_GAP + m.handWidth).toBeLessThanOrEqual(w - 24);
      const fit = fitHand(m.handWidth, 8, m.handCardMax);
      expect(fit.cardW, `${w}x${h}`).toBeGreaterThanOrEqual(40);
    }
  });

  it('keeps the whole width for the fan in landscape, where the rail holds the puck', () => {
    const m = computeTableMetrics(800, 360);
    expect(m.handWidth).toBe(Math.max(240, 800 - 24 - m.railW * 2));
  });
});

describe('the landscape rails', () => {
  // The rails' fixed rows, as the web export measured them at 640x360 with
  // Rubik and compact buttons. Not derived: the point is to hold the layout
  // to the screens it must fit.
  const PROFILE = 78;
  const HEADER = 102;
  const PLATE = 38;
  const CALLER = 21;
  const CHIP = 50; // one zvanje chip, the calls column's minimum worth having
  const LEAVE = 31;
  const BUTTON = 31;
  const TOGGLE = 40;
  const GAP = 6;
  const ROOT_PAD = 12;
  /** My puck's row: ring, its gap, the name. */
  const puckRow = (selfPuck: number) => selfPuck + 10 + 2 + 16;

  it('a phone stacks the left rail without the puck, and the right without the faces', () => {
    for (const [w, h] of [
      [640, 360],
      [800, 360],
      [915, 412],
      [844, 390],
    ] as const) {
      const m = computeTableMetrics(w, h);
      expect(m.tightRail, `${w}x${h}`).toBe(true);
      const left = PROFILE + HEADER + PLATE + CHIP + LEAVE + 4 * GAP;
      expect(left, `${w}x${h} left rail`).toBeLessThanOrEqual(h - ROOT_PAD);
      // Bidding: pass and four calls, the toggle, my puck at the top.
      const right = puckRow(m.selfPuck) + 5 * BUTTON + 4 * GAP + TOGGLE + 2 * GAP;
      expect(right, `${w}x${h} right rail`).toBeLessThanOrEqual(h - ROOT_PAD);
    }
  });

  it('a tablet or the web column keeps everything in the left rail', () => {
    for (const [w, h] of [
      [1024, 768],
      [960, 505],
    ] as const) {
      const m = computeTableMetrics(w, h);
      expect(m.tightRail, `${w}x${h}`).toBe(false);
      const left = PROFILE + HEADER + PLATE + CALLER + puckRow(m.selfPuck) + CHIP + LEAVE + 5 * GAP;
      expect(left, `${w}x${h} left rail`).toBeLessThanOrEqual(h - ROOT_PAD);
    }
  });

  it('never tightens a portrait phone', () => {
    for (const [w, h] of PORTRAIT) expect(computeTableMetrics(w, h).tightRail).toBe(false);
  });
});
