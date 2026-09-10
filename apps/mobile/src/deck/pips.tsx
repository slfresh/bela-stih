import Svg, { G, Path } from 'react-native-svg';
import PATHS from '../../brand/paths.json';
import { PIP_COLOUR } from './palette';
import type { Suit } from '@belot/engine';
import { MADARICA_SUIT, SUIT_COLOUR, type SuitColourRole } from '@belot/i18n';

/**
 * The four mađarice pips, drawn rather than borrowed.
 *
 * Bela is played with the Hungarian-suited deck — žir (acorns), list (leaves),
 * srce (hearts), bundeva (bells) — and unlike the French deck those four carry
 * four distinct colours, which is a real legibility win on a small screen.
 *
 * `PipShape` emits bare SVG children on a 0..100 canvas so it can be composed
 * inside a full card face; `SuitPip` wraps it for standalone use.
 */

/** The four suits' colours, from the deck's palette (a pure module the contrast test reads). */
export { PIP_COLOUR };

export function suitColour(suit: Suit): { fill: string; dark: string } {
  const role: SuitColourRole = SUIT_COLOUR[suit];
  return PIP_COLOUR[role];
}

/**
 * Pip artwork on a 0..100 canvas, with no <Svg> wrapper — the paths come from
 * brand/paths.json, which the icon and store-art scripts draw from too, so
 * the mark on the launcher is the very pip on the table. Real Tell-pattern
 * pips are MULTICOLOURED: a gold acorn with a red flush under a green cap, a
 * two-tone leaf, a hawk-bell (Schellen) with its red equator band — the round
 * shape Croatians nicknamed "bundeva", the pumpkin.
 */
interface PipPath {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

const SUIT_ART = PATHS.suits as Record<string, PipPath[]>;

export function PipShape({ suit }: { suit: Suit }) {
  const shapes = SUIT_ART[MADARICA_SUIT[suit]] ?? [];
  return (
    <G>
      {shapes.map((p, i) => (
        <Path key={i} d={p.d} fill={p.fill ?? 'none'} stroke={p.stroke} strokeWidth={p.strokeWidth} />
      ))}
    </G>
  );
}

/** A pip on its own — used for the trump indicator and suit buttons. */
export function SuitPip({ suit, size = 24 }: { suit: Suit; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <PipShape suit={suit} />
    </Svg>
  );
}
