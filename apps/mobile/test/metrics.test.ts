import { describe, expect, it } from 'vitest';
import {
  computeTableMetrics,
  FELT_FLOOR,
  FELT_FLOOR_MIN,
  FELT_HAND_GAP,
  BIDDING_ACTIONS,
  LAND_GAP,
  PORTRAIT_CHROME,
  PUCK_NAME_ROOM,
  PROMPT_SHED,
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

/**
 * Portrait's rows, as measured on the Samsung with Rubik — owned by this test,
 * so an understated budget in metrics.ts cannot pass by agreeing with itself.
 */
const ROW = { pad: 24, top: 35, status: 16, header: 34, calls: 24, prompt: 58, emotes: 34, line: 40, gap: 8 };
/** The two busiest moments of a deal, online: every row they render but the felt, the hand and my puck. */
const DECLARING =
  ROW.pad + ROW.top + ROW.status + ROW.header + ROW.calls + ROW.prompt + ROW.emotes + ROW.line + 9 * ROW.gap;
const BIDDING =
  ROW.pad + ROW.top + ROW.status + ROW.header + ROW.emotes + (3 * ROW.line + 2 * ROW.gap + 2) + 7 * ROW.gap;
/** What a short column sheds while it asks: the emote strip and the bot line, with their gaps. */
const SHED = ROW.emotes + ROW.gap + ROW.status + ROW.gap;

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

  it('counts at least the rows the busiest moments render', () => {
    expect(PORTRAIT_CHROME).toBeGreaterThanOrEqual(DECLARING);
    expect(BIDDING).toBeLessThanOrEqual(DECLARING);
    expect(BIDDING_ACTIONS).toBe(3 * ROW.line + 2 * ROW.gap + 2);
    expect(PROMPT_SHED).toBe(SHED);
  });

  for (const [name, rows] of [
    ['declaring (a chip and the zvanja question)', DECLARING],
    ['bidding (three lines of buttons)', BIDDING],
  ] as const) {
    it(`keeps the answering buttons on screen while ${name}, down to a 360x640 phone`, () => {
      for (const [w, h] of PHONES) {
        if (h < 640) continue; // a 320x568 phone is below what the table can hold at its busiest
        const m = computeTableMetrics(w, h);
        // The table asks in both moments, so a short column sheds its rows.
        const need = rows + m.handMinHeight + m.selfPuck + 10 + m.feltMinHeight - (m.shortColumn ? SHED : 0);
        expect(need, `${w}x${h}`).toBeLessThanOrEqual(h);
      }
    });
  }

  it('keeps the prompt reserve only where the felt keeps its whole floor with it', () => {
    for (const [w, h] of PHONES) {
      const m = computeTableMetrics(w, h);
      if (m.promptReserve) expect(m.feltMinHeight, `${w}x${h}`).toBe(FELT_FLOOR);
    }
    expect(computeTableMetrics(412, 915).promptReserve).toBe(true);
    expect(computeTableMetrics(360, 723).promptReserve).toBe(false);
    expect(computeTableMetrics(375, 647).promptReserve).toBe(false);
    for (const [w, h] of LANDSCAPE) expect(computeTableMetrics(w, h).promptReserve).toBe(false);
  });

  it('lets the floor give on the Samsung, but no lower than it must', () => {
    const m = computeTableMetrics(360, 723);
    expect(m.feltMinHeight).toBeLessThan(FELT_FLOOR);
    expect(m.feltMinHeight).toBeGreaterThanOrEqual(FELT_FLOOR_MIN);
    expect(m.shortColumn).toBe(false);
  });

  it('sheds rows only where the lowest floor cannot pay, and never sideways', () => {
    expect(computeTableMetrics(412, 915).shortColumn).toBe(false);
    expect(computeTableMetrics(360, 640).shortColumn).toBe(true);
    for (const [w, h] of LANDSCAPE) expect(computeTableMetrics(w, h).shortColumn).toBe(false);
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

  it('stands beside the fan in landscape: the fan fits the cell it is really given, at no cost to the cards', () => {
    for (const [w, h] of LANDSCAPE) {
      const m = computeTableMetrics(w, h);
      // The centre column, and the cell the hand gets in it beside my puck's box.
      const centre = w - 24 - m.railW * 2 - LAND_GAP * 2;
      const cell = centre - (m.selfPuck + PUCK_NAME_ROOM) - SELF_PUCK_GAP;
      expect(m.handWidth, `${w}x${h}`).toBeLessThanOrEqual(Math.max(240, cell));
      // Capped cards: the puck costs the fan nothing.
      const inCell = fitHand(m.handWidth, 8, m.handCardMax).cardW;
      const alone = fitHand(centre, 8, m.handCardMax).cardW;
      expect(inCell, `${w}x${h}`).toBeCloseTo(alone, 5);
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

  it('floats the faces exactly where the full right rail does not fit', () => {
    // The right rail's full stack: the leave button, six faces, five bid buttons and the toggle.
    const full = LEAVE + GAP + FACES + GAP + 5 * BUTTON + 4 * GAP + GAP + TOGGLE;
    for (let h = 300; h <= 800; h += 10) {
      const m = computeTableMetrics(Math.round(h * 2), h);
      expect(m.tightRail, `landscape ${Math.round(h * 2)}x${h}`).toBe(full > h - ROOT_PAD);
    }
  });

  it('floats the faces only where the rail is short', () => {
    expect(computeTableMetrics(800, 360).tightRail).toBe(true);
    expect(computeTableMetrics(1024, 768).tightRail).toBe(false);
    for (const [w, h] of PORTRAIT) expect(computeTableMetrics(w, h).tightRail).toBe(false);
  });
});
