import { cardWidthForHeight, fanHeight, fitHand } from './geometry';

/**
 * Every dimension the table draws, derived from the window it actually has.
 *
 * Until now each one was an absolute literal tuned for a 390x844 phone, which
 * is why the hand spilled off a 320dp screen and why landscape was locked out
 * entirely. One memoised object keyed on the window keeps the layout honest at
 * both extremes without scattering `useWindowDimensions` through the tree.
 *
 * This file is the pure half: a function of the usable box alone, so the
 * invariants can be tested without a window. `useTableMetrics` supplies the box.
 */

export interface TableMetrics {
  orientation: 'portrait' | 'landscape';
  /** Usable box, insets already subtracted. */
  width: number;
  height: number;
  /** 1 at the 390x844 reference; the scarce axis decides it. */
  scale: number;
  /** Space the hand fan may occupy. */
  handWidth: number;
  /** Landscape side-rail width; 0 in portrait. */
  railW: number;
  /** Room the fan needs, arc and lift included. */
  handMinHeight: number;
  /** Widest card the hand may use; landscape trades size for a visible felt. */
  handCardMax: number;
  /** Floor for the table area, so the felt never collapses to nothing. */
  feltMinHeight: number;
  /**
   * Ceiling for it too. The felt is the only row that flexes, so without this it
   * swallows every spare pixel — which on a big screen is most of them.
   */
  feltMaxHeight: number;
  slotW: number;
  slotH: number;
  puck: number;
  /** My own puck, a shade smaller than the others'. */
  selfPuck: number;
  /** Short screens hide what they must rather than squashing everything. */
  compact: boolean;
  /**
   * Landscape where the right rail cannot hold the leave button, the six
   * emote faces and five bid buttons at once (about 514 dp with its padding):
   * the faces float over the felt's edge while the tray is open instead.
   */
  tightRail: boolean;
  /**
   * Portrait keeps a row's height free under the felt so a prompt coming or
   * going never moves the hand — but only where the column can pay for it:
   * with the reserve the felt must still get its full floor. The reserve's
   * 62 dp once pushed the action buttons off every 647–676 dp phone.
   */
  promptReserve: boolean;
  /**
   * Portrait where even the lowest floor cannot pay for the busiest moment (a
   * calls chip and a prompt at once). There the two rows that are no use
   * while the table asks a question — the emote strip and the online bot
   * line — give way while a prompt is up, so the buttons that answer it stay
   * on the screen.
   */
  shortColumn: boolean;
}

const REF_W = 390;
const REF_H = 844;

/**
 * What the centre column keeps between the felt and the hand: its own gap on
 * either side of the row in between. Mirrors `styles.centre` in TableScreen.
 */
export const FELT_HAND_GAP = 12;

/** Between the fan and my puck beside it, in landscape's hand row. */
export const SELF_PUCK_GAP = 8;

/**
 * Portrait's rows that do not flex, in dp, as measured on a 360 dp Samsung
 * with Rubik at the busiest moment of a deal — declaring, online: the root's
 * padding (24), the profile strip with the leave button (35), the "— igra
 * bot" line (16), the score strip (34), a calls chip (24), the zvanja prompt
 * (58), the emote strip (34), the actions row (40), and the nine gaps
 * between ten rows (72). The hand and my puck are added from their own
 * sizes; the felt takes what is left.
 *
 * The prompt is counted whether or not its row is reserved: an unreserved
 * prompt still appears, and the felt must be able to give it the room. The
 * first version counted it only when reserved, and on the Samsung the zvanja
 * question pushed "Prijavi" and "Nemam" under the navigation bar.
 */
export const PORTRAIT_CHROME = 24 + 35 + 16 + 34 + 24 + 58 + 34 + 40 + 9 * 8;
/**
 * Bidding's own band: four trump buttons wrap the actions row onto two lines
 * (92), with no chip and no prompt beside them — so it must never need more
 * than declaring's chip, prompt and one line of buttons.
 */
export const BIDDING_ACTIONS = 92;
/** What a short column sheds while a prompt is up: the emote strip (34) and the bot line (16), with their gaps. */
export const PROMPT_SHED = 34 + 8 + 16 + 8;
/** The felt's floor where the phone can pay for it, and how far it may give. */
export const FELT_FLOOR = 260;
export const FELT_FLOOR_MIN = 180;

export function computeTableMetrics(usableW: number, usableH: number): TableMetrics {
  const landscape = usableW >= usableH;
  // Portrait is width-bound and landscape is height-bound: scale by whichever
  // axis is actually scarce, or a tall thin phone gets giant cards.
  const scale = landscape
    ? clamp(usableH / REF_W, 0.72, 1.3)
    : clamp(Math.min(usableW / REF_W, usableH / REF_H), 0.78, 1.3);

  // In landscape the rails take the sides, so the hand gets the middle.
  const railW = landscape ? Math.round(96 * scale) : 0;
  const puck = Math.round((landscape ? 44 : 54) * scale);
  // My own puck: centred under the fan in portrait, so the fan has the whole
  // width; beside the fan in landscape, where height is the scarce thing, so
  // the fan gives up that much width there (it is capped well short of it).
  const selfPuck = Math.round(puck * 0.85);
  const handWidth = Math.max(240, usableW - 24 - railW * 2 - (landscape ? selfPuck + SELF_PUCK_GAP : 0));

  // Landscape has width to burn and no height, so the hand takes a fixed
  // slice of the screen instead of the biggest card that fits across it.
  const handCardMax = landscape
    ? clamp(Math.floor(cardWidthForHeight(usableH * 0.34, 8)), 40, 76)
    : // Portrait: grow with the screen rather than staying at phone size. 76
      // is the handset figure and `scale` is already 1 there, so phones are
      // unchanged; a roomier window simply gets roomier cards.
      Math.round(76 * scale);
  const fit = fitHand(handWidth, 8, handCardMax);
  const handMinHeight = Math.ceil(fanHeight(fit.cardW, 8));

  // Portrait's budget: the fixed rows, the fan, and my puck's row (the ring
  // around the disc; no name is drawn there). The reserve is kept only if the
  // felt keeps its whole floor with it; without it, the floor gives before
  // the actions row is pushed off the bottom of a short phone.
  const portraitFixed = PORTRAIT_CHROME + handMinHeight + selfPuck + 10;
  const promptReserve = !landscape && usableH - portraitFixed >= FELT_FLOOR;
  const feltMinHeight = landscape ? 0 : clamp(usableH - portraitFixed, FELT_FLOOR_MIN, FELT_FLOOR);
  const shortColumn = !landscape && usableH - portraitFixed < FELT_FLOOR_MIN;

  return {
    orientation: landscape ? 'landscape' : 'portrait',
    width: usableW,
    height: usableH,
    scale,
    handWidth,
    railW,
    handCardMax,
    handMinHeight,
    // Portrait: a generous floor where the column can pay for it, less where
    // it cannot. Sideways it must be zero: the felt is the only flexible row,
    // so any floor it cannot meet is paid for by pushing the hand off.
    feltMinHeight,
    // Portrait: the table may take about half the height and no more. Beyond
    // that it is just empty baize, and the cards are what people read.
    // Landscape: whatever the hand leaves, and never what the hand needs —
    // the felt was offered the whole height, which is exactly the budget the
    // fan is also drawn from.
    feltMaxHeight: landscape
      ? Math.max(0, usableH - handMinHeight - FELT_HAND_GAP)
      : Math.round(usableH * 0.48),
    slotW: Math.round(46 * scale),
    slotH: Math.round(67 * scale),
    puck,
    selfPuck,
    compact: usableH < 620,
    tightRail: landscape && usableH < 520,
    promptReserve,
    shortColumn,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
