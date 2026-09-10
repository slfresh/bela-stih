import { describe, expect, it } from 'vitest';
import {
  computeTableMetrics,
  FELT_FLOOR,
  FELT_FLOOR_MIN,
  FELT_HAND_GAP,
  PORTRAIT_CHROME,
  PROMPT_RESERVE,
  SELF_PUCK_GAP,
} from '../src/table/metrics';
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

  it("keeps portrait's table between its floor and half the height", () => {
    for (const [w, h] of PORTRAIT) {
      const m = computeTableMetrics(w, h);
      expect(m.orientation).toBe('portrait');
      expect(m.feltMaxHeight).toBe(Math.round(h * 0.48));
      expect(m.feltMinHeight).toBeGreaterThanOrEqual(FELT_FLOOR_MIN);
      expect(m.feltMinHeight).toBeLessThanOrEqual(FELT_FLOOR);
      expect(m.railW).toBe(0);
    }
    // A tall phone keeps the whole floor.
    expect(computeTableMetrics(412, 915).feltMinHeight).toBe(FELT_FLOOR);
  });

  it('keeps a landscape hand to about a third of the height', () => {
    for (const [w, h] of LANDSCAPE) {
      const m = computeTableMetrics(w, h);
      expect(m.handMinHeight).toBeLessThanOrEqual(Math.ceil(h * 0.34) + 1);
    }
  });
});

/** The column's worst case in portrait: every fixed row, the fan, my puck's row, the felt's floor. */
function portraitNeed(w: number, h: number) {
  const m = computeTableMetrics(w, h);
  return {
    m,
    need:
      PORTRAIT_CHROME + m.handMinHeight + m.selfPuck + 10 + (m.promptReserve ? PROMPT_RESERVE : 0) + m.feltMinHeight,
  };
}

describe('the portrait column', () => {
  const PHONES = [
    [320, 568],
    [360, 640],
    [375, 647],
    [360, 668],
    [360, 723], // the Samsung this was measured on
    [390, 763],
    [412, 850],
    [412, 915],
    [480, 1000],
  ] as const;

  it('never asks for more height than the phone has, down to the smallest phone it can hold', () => {
    for (const [w, h] of PHONES) {
      const { m, need } = portraitNeed(w, h);
      // The floor gives before the actions row is pushed off the bottom; only
      // a phone too short even for the lowest floor overflows.
      if (m.feltMinHeight > FELT_FLOOR_MIN) expect(need, `${w}x${h}`).toBeLessThanOrEqual(h);
    }
  });

  it('keeps the prompt reserve only where the felt keeps its whole floor with it', () => {
    for (const [w, h] of PHONES) {
      const { m } = portraitNeed(w, h);
      if (m.promptReserve) expect(m.feltMinHeight, `${w}x${h}`).toBe(FELT_FLOOR);
    }
    expect(computeTableMetrics(412, 915).promptReserve).toBe(true);
    expect(computeTableMetrics(375, 647).promptReserve).toBe(false);
    for (const [w, h] of LANDSCAPE) expect(computeTableMetrics(w, h).promptReserve).toBe(false);
  });

  it('fits the 360 dp Samsung it was measured on, calls chip and online line included', () => {
    const { m, need } = portraitNeed(360, 723);
    expect(need).toBeLessThanOrEqual(723);
    expect(m.feltMinHeight).toBeGreaterThanOrEqual(240);
  });
});

describe('my puck', () => {
  it("gives the fan portrait's whole width: it stands under the cards, not beside them", () => {
    for (const [w, h] of PORTRAIT) {
      const m = computeTableMetrics(w, h);
      expect(m.handWidth).toBe(Math.max(240, w - 24));
      expect(m.selfPuck).toBeGreaterThan(0);
      expect(m.selfPuck).toBeLessThan(m.puck);
    }
  });

  it('stands beside the fan in landscape at no cost to the cards', () => {
    for (const [w, h] of LANDSCAPE) {
      const m = computeTableMetrics(w, h);
      expect(m.handWidth).toBe(Math.max(240, w - 24 - m.railW * 2 - m.selfPuck - SELF_PUCK_GAP));
      const withPuck = fitHand(m.handWidth, 8, m.handCardMax).cardW;
      const without = fitHand(m.handWidth + m.selfPuck + SELF_PUCK_GAP, 8, m.handCardMax).cardW;
      expect(withPuck, `${w}x${h}`).toBeCloseTo(without, 5);
    }
  });
});

describe('the landscape rails', () => {
  // Measured on the web export at 640x360 with Rubik and compact buttons.
  const PROFILE = 78;
  const HEADER = 102;
  const PLATE = 38;
  /** The caller line, over two lines as the rail now allows. */
  const CALLER = 36;
  const CHIP = 50; // one zvanje chip, the calls column's minimum worth having
  const LEAVE = 31;
  const BUTTON = 31;
  const TOGGLE = 40;
  const FACES = 6 * 34 + 5 * 6;
  const GAP = 6;
  const ROOT_PAD = 12;

  it('holds the score, the plate with who called, and a chip on the left of every screen', () => {
    for (const [w, h] of LANDSCAPE) {
      const left = PROFILE + HEADER + PLATE + CALLER + CHIP + 4 * GAP;
      expect(left, `${w}x${h} left rail`).toBeLessThanOrEqual(h - ROOT_PAD);
    }
  });

  it('holds the leave button and five bid buttons on the right, faces floating where they cannot fit', () => {
    for (const [w, h] of LANDSCAPE) {
      const m = computeTableMetrics(w, h);
      const faces = m.tightRail ? 0 : FACES + GAP;
      const right = LEAVE + GAP + faces + 5 * BUTTON + 4 * GAP + GAP + TOGGLE;
      expect(right, `${w}x${h} right rail`).toBeLessThanOrEqual(h - ROOT_PAD);
    }
  });

  it('floats the faces only where the rail is short', () => {
    expect(computeTableMetrics(800, 360).tightRail).toBe(true);
    expect(computeTableMetrics(1024, 768).tightRail).toBe(false);
    for (const [w, h] of PORTRAIT) expect(computeTableMetrics(w, h).tightRail).toBe(false);
  });
});
