import { describe, expect, it } from 'vitest';
import {
  computeTableMetrics,
  FELT_FLOOR,
  FELT_FLOOR_MIN,
  FELT_HAND_GAP,
  BIDDING_ACTIONS,
  EMOTE_TOGGLE,
  LAND_GAP,
  LAND_PHRASE_H,
  LAND_TRAY_H,
  LAND_TRAY_W,
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
  // Measured on the player's Samsung held sideways (usable 723x336: a 24 dp
  // status bar, a 29.5 dp camera cut-out on the left, the 48 dp navigation
  // bar on the right): a compact button and the leave button are 33.7 dp
  // there, not the web's 31, so the right rail's sums use 34.
  const LEAVE = 34;
  const BUTTON = 34;
  /**
   * A compact button whose label wraps: one more 13 dp line of 11 px Rubik.
   * In the rail that is the online "Napusti stol" / "Напусти сто" on a rail
   * under 83 dp, and every Croatian bela label ("K srce + BELA").
   */
  const BUTTON2 = 47;
  const TOGGLE = 40;
  const FACE = 34;
  const GAP = 6;
  const ROOT_PAD = 12;
  /**
   * The right rail's free gap, where the emote box lives: the leave button on
   * top, the question's buttons (their heights) and the toggle at the foot,
   * and the rail's 6 dp gap on both sides of the free one.
   */
  const railGap = (h: number, buttons: readonly number[], leave = LEAVE) =>
    h - ROOT_PAD - leave - 2 * GAP - buttons.reduce((s, b) => s + b + GAP, 0) - TOGGLE;
  const ones = (n: number) => Array<number>(n).fill(BUTTON);
  /** Every phone and larger held sideways; the Samsung as measured (723x336) and as first assumed (752x331). */
  const RAIL_BOXES = [
    [568, 320], [640, 336], [667, 375], [723, 336], [752, 331], [780, 360], [800, 390], [915, 412], [1000, 480],
    [1024, 600], [1280, 800], [1366, 1024], ...LANDSCAPE,
  ] as const;
  /** Shorter than any phone held sideways: a phone's browser under its toolbar, split screen, the 240 floor. */
  const SHORT_BOXES = [[426, 240], [532, 280], [485, 296]] as const;
  /** A rail phrase chip around en "Thanks!" (51.2 dp of Rubik-700 at 13 px): 2 x 6 padding, 2 x 1 border. */
  const phraseChip = (fontScale: number) => 51.2 * fontScale + 2 * 6 + 2;

  it('holds the score, the plate with who called, and a chip on the left of every screen', () => {
    for (const [w, h] of LANDSCAPE) {
      const left = PROFILE + HEADER + PLATE + CALLER + CHIP + 4 * GAP;
      expect(left, `${w}x${h} left rail`).toBeLessThanOrEqual(h - ROOT_PAD);
    }
  });

  it('holds the leave button, five bid buttons and the toggle on the right of every screen', () => {
    for (const [w, h] of RAIL_BOXES) {
      expect(railGap(h, ones(5)), `${w}x${h} right rail`).toBeGreaterThanOrEqual(0);
    }
    // Online in Croatian, a two-line leave label and a two-line suit, on the
    // Samsung and up. (On 568x320 that worst case runs about 4 dp into the
    // root's 6 dp padding: older than the emote box, and out of sight.)
    for (const [w, h] of RAIL_BOXES.filter(([, rh]) => rh >= 331)) {
      expect(railGap(h, [BUTTON2, ...ones(4)], BUTTON2), `${w}x${h} worst labels`).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the emote box under the leave button whenever the table is not asking me to bid', () => {
    for (const [w, h] of RAIL_BOXES) {
      // Nobody asking me anything, and the zvanja question's two buttons —
      // under the online leave label on two lines, too.
      expect(railGap(h, [], BUTTON2), `${w}x${h} idle`).toBeGreaterThanOrEqual(LAND_TRAY_H);
      expect(railGap(h, ones(2), BUTTON2), `${w}x${h} declaring`).toBeGreaterThanOrEqual(LAND_TRAY_H);
    }
  });

  it('gives the box way to two two-line bela buttons only on the shortest rails', () => {
    // Online, trump K and Q in hand: both bela labels wrap, and so does the leave label.
    for (const [w, h] of RAIL_BOXES) {
      const room = railGap(h, [BUTTON2, BUTTON2], BUTTON2);
      if (h >= 331) expect(room, `${w}x${h}`).toBeGreaterThanOrEqual(LAND_TRAY_H);
      else expect(room, `${w}x${h}`).toBeLessThan(LAND_TRAY_H);
    }
  });

  it('is wide enough for two faces abreast and the widest phrase, however short the window', () => {
    for (const [w, h] of [...RAIL_BOXES, ...SHORT_BOXES]) {
      const m = computeTableMetrics(w, h);
      expect(m.railW, `${w}x${h}`).toBeGreaterThanOrEqual(LAND_TRAY_W);
      expect(m.railW, `${w}x${h} "Thanks!"`).toBeGreaterThanOrEqual(phraseChip(1));
    }
    // On a phone, even at the 1.2 cap on the rail phrases' font scale.
    for (const [w, h] of RAIL_BOXES) {
      expect(computeTableMetrics(w, h).railW, `${w}x${h} "Thanks!" at 1.2`).toBeGreaterThanOrEqual(phraseChip(1.2));
    }
  });

  it('fills the emote box exactly both ways, so the swap moves nothing', () => {
    expect(3 * FACE + 2 * GAP).toBe(LAND_TRAY_H);
    expect(4 * LAND_PHRASE_H + 3 * GAP).toBe(LAND_TRAY_H);
    expect(2 * FACE + GAP).toBe(LAND_TRAY_W);
    // A phrase's pinned 17 dp line, its border top and bottom, and some air.
    expect(LAND_PHRASE_H).toBeGreaterThanOrEqual(17 + 2 + 4);
  });

  it('gives the box way to a five-button bid only where the rail cannot hold both', () => {
    for (const [w, h] of [[568, 320], [640, 336], [667, 375], [723, 336], [752, 331], [780, 360], [800, 390]] as const) {
      expect(railGap(h, ones(5)), `${w}x${h}`).toBeLessThan(LAND_TRAY_H);
    }
    for (const [w, h] of [[1000, 480], [1024, 600], [1280, 800], [1366, 1024]] as const) {
      expect(railGap(h, ones(5)), `${w}x${h}`).toBeGreaterThanOrEqual(LAND_TRAY_H);
    }
  });

  it("keeps the toggle the harness's square, and no face can pass for it", () => {
    // The device harness takes the bottom-right clickable square of 105..135 px (3 px per dp).
    expect(EMOTE_TOGGLE).toBe(TOGGLE);
    expect(3 * EMOTE_TOGGLE).toBeGreaterThanOrEqual(105);
    expect(3 * EMOTE_TOGGLE).toBeLessThanOrEqual(135);
    expect(3 * FACE).toBeLessThan(105);
  });

  it('has no tight-rail mode left: nothing floats beside the rail', () => {
    expect(computeTableMetrics(800, 360)).not.toHaveProperty('tightRail');
    expect(computeTableMetrics(1024, 768)).not.toHaveProperty('tightRail');
  });
});
