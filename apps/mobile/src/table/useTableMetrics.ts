import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cardWidthForHeight, fanHeight, fitHand } from './geometry';

/**
 * Every dimension the table draws, derived from the window it actually has.
 *
 * Until now each one was an absolute literal tuned for a 390x844 phone, which
 * is why the hand spilled off a 320dp screen and why landscape was locked out
 * entirely. One memoised object keyed on the window keeps the layout honest at
 * both extremes without scattering `useWindowDimensions` through the tree.
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
  /** Short screens hide what they must rather than squashing everything. */
  compact: boolean;
}

const REF_W = 390;
const REF_H = 844;

/**
 * How wide the app is allowed to be.
 *
 * Native gets the whole screen. The web build lives in a centred column, so
 * every dimension below must be taken from THAT box — measure the browser
 * window instead and the fan sizes itself for 1440px and spills straight out of
 * a 960px column. `WebShell` draws the box from this same function, so the two
 * cannot disagree.
 */
export function shellWidth(width: number, height: number): number {
  if (Platform.OS !== 'web') return width;
  const box = width > height ? Math.min(960, Math.round(height * 1.9)) : 480;
  return Math.min(width, box);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function useTableMetrics(): TableMetrics {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const usableW = Math.max(240, shellWidth(width, height) - insets.left - insets.right);
  const usableH = Math.max(240, height - insets.top - insets.bottom);

  return useMemo(() => {
    const landscape = usableW >= usableH;
    // Portrait is width-bound and landscape is height-bound: scale by whichever
    // axis is actually scarce, or a tall thin phone gets giant cards.
    const scale = landscape
      ? clamp(usableH / REF_W, 0.72, 1.3)
      : clamp(Math.min(usableW / REF_W, usableH / REF_H), 0.78, 1.3);

    // In landscape the rails take the sides, so the hand gets the middle.
    const railW = landscape ? Math.round(96 * scale) : 0;
    const handWidth = Math.max(240, usableW - 24 - railW * 2);

    // Landscape has width to burn and no height, so the hand takes a fixed
    // slice of the screen instead of the biggest card that fits across it.
    const handCardMax = landscape
      ? clamp(Math.floor(cardWidthForHeight(usableH * 0.34, 8)), 40, 76)
      : // Portrait: grow with the screen rather than staying at phone size. 76
        // is the handset figure and `scale` is already 1 there, so phones are
        // unchanged; a roomier window simply gets roomier cards.
        Math.round(76 * scale);
    const fit = fitHand(handWidth, 8, handCardMax);

    return {
      orientation: landscape ? 'landscape' : 'portrait',
      width: usableW,
      height: usableH,
      scale,
      handWidth,
      railW,
      handCardMax,
      handMinHeight: Math.ceil(fanHeight(fit.cardW, 8)),
      // Portrait can afford a generous floor. Sideways it must be zero: the
      // felt is the only flexible row, so any floor it cannot meet is paid for
      // by pushing the hand off the bottom of the screen.
      feltMinHeight: landscape ? 0 : 260,
      // Portrait: the table may take about half the height and no more. Beyond
      // that it is just empty baize, and the cards are what people read.
      feltMaxHeight: landscape ? usableH : Math.round(usableH * 0.48),
      slotW: Math.round(46 * scale),
      slotH: Math.round(67 * scale),
      puck: Math.round((landscape ? 44 : 54) * scale),
      compact: usableH < 620,
    };
  }, [usableW, usableH]);
}
